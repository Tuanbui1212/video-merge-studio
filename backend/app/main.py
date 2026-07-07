import os
import shutil
from typing import List
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import asyncio
from sqlalchemy import text

from . import models, schemas, database
from .video_processor import merge_videos_task
from .websocket_manager import manager
from .task_utils import build_merge_info, build_task_response, get_task_source_paths
from .media_utils import video_stream_response, unique_upload_path
from .preview_utils import build_browser_preview, preview_needs_rebuild, uploaded_preview_path
from .progress_store import progress_store
from .resolution_utils import available_output_presets, resolve_merge_target
from .models import ProcessingStatus
import concurrent.futures

merge_executor = concurrent.futures.ThreadPoolExecutor(max_workers=10)

models.Base.metadata.create_all(bind=database.engine)


def _ensure_schema() -> None:
    with database.engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE video_tasks "
                "ADD COLUMN IF NOT EXISTS merge_started_at TIMESTAMP WITH TIME ZONE"
            )
        )
        conn.execute(
            text("ALTER TABLE video_tasks ADD COLUMN IF NOT EXISTS merge_output_preset VARCHAR")
        )
        conn.execute(
            text("ALTER TABLE video_tasks ADD COLUMN IF NOT EXISTS output_width INTEGER")
        )
        conn.execute(
            text("ALTER TABLE video_tasks ADD COLUMN IF NOT EXISTS output_height INTEGER")
        )


_ensure_schema()

app = FastAPI(title="Video Concatenation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Content-Disposition"],
)

UPLOAD_DIR = "/app/uploads"
OUTPUT_DIR = "/app/outputs"
PREVIEW_DIR = "/app/previews"
PREVIEW_TEMP_DIR = "/app/previews/temp"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)
os.makedirs(PREVIEW_TEMP_DIR, exist_ok=True)


def _build_uploaded_preview(video_id: int, source_path: str) -> None:
    """Lazy preview build — only when user opens /videos/{id}/preview."""
    preview_path = uploaded_preview_path(PREVIEW_DIR, video_id)
    if not preview_needs_rebuild(source_path, preview_path):
        return
    try:
        if os.path.isfile(preview_path):
            os.remove(preview_path)
        build_browser_preview(source_path, preview_path)
    except Exception as exc:
        print(f"Preview build failed for video {video_id}: {exc}")

@app.get("/health")
def health_check(db: Session = Depends(database.get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "service": "video-concatenation-api",
            "database": "connected",
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {e}")

@app.websocket("/ws/tasks")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We don't really expect to receive data, but we must wait to keep connection open
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/upload", response_model=schemas.UploadedVideoResponse)
async def upload_video(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
):
    file_path, stored_name = unique_upload_path(UPLOAD_DIR, file.filename or "video.mp4")

    def save_upload() -> None:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer, length=4 * 1024 * 1024)

    await asyncio.to_thread(save_upload)
        
    db_video = models.UploadedVideo(filename=stored_name, filepath=file_path)
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    return db_video

@app.get("/videos", response_model=List[schemas.UploadedVideoResponse])
def get_videos(db: Session = Depends(database.get_db)):
    return db.query(models.UploadedVideo).order_by(models.UploadedVideo.uploaded_at.desc()).all()

@app.post("/tasks", response_model=schemas.VideoTaskResponse)
def create_task(request: schemas.CreateTaskRequest, db: Session = Depends(database.get_db)):
    if len(request.video_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 videos to merge")
        
    videos = db.query(models.UploadedVideo).filter(models.UploadedVideo.id.in_(request.video_ids)).all()
    if len(videos) != len(request.video_ids):
        raise HTTPException(status_code=404, detail="Some videos not found")
        
    task = models.VideoTask(status=ProcessingStatus.PENDING)
    db.add(task)
    db.commit()
    db.refresh(task)

    for position, video_id in enumerate(request.video_ids):
        db.add(models.TaskSourceVideo(
            task_id=task.id,
            uploaded_video_id=video_id,
            position=position,
        ))
    db.commit()
    return build_task_response(task, db)

@app.post("/tasks/{task_id}/merge", response_model=schemas.VideoTaskResponse)
async def start_task_merge(
    task_id: int,
    request: schemas.MergeTaskRequest = Body(default_factory=schemas.MergeTaskRequest),
    db: Session = Depends(database.get_db),
):
    task = db.query(models.VideoTask).filter(models.VideoTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in (ProcessingStatus.PENDING, ProcessingStatus.FAILED):
        raise HTTPException(
            status_code=400,
            detail=f"Task is not mergeable (status={task.status.value})",
        )

    links = get_task_source_paths(task, db)
    if len(links) < 2:
        raise HTTPException(status_code=400, detail="Task needs at least 2 source videos")

    input_paths: list[str] = []
    max_width = 0
    max_height = 0
    for _, video in links:
        if not os.path.isfile(video.filepath):
            raise HTTPException(
                status_code=404,
                detail=f"Source file missing on disk: {video.filename}",
            )
        input_paths.append(video.filepath)
        from .ffmpeg_utils import probe_video_stream

        info = probe_video_stream(video.filepath)
        max_width = max(max_width, info.width)
        max_height = max(max_height, info.height)

    allowed_ids = {opt.id for opt in available_output_presets(max_width, max_height)}
    if request.output_preset not in allowed_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid output preset '{request.output_preset}' for source max {max_width}x{max_height}",
        )

    try:
        merge_target = resolve_merge_target(input_paths, request.output_preset)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    import datetime

    task.status = ProcessingStatus.PROCESSING
    task.error_message = None
    task.merge_started_at = datetime.datetime.now(datetime.timezone.utc)
    task.merge_output_preset = request.output_preset
    task.completed_at = None
    task.output_width = None
    task.output_height = None
    task.output_filename = None
    task.output_filepath = None
    db.commit()
    db.refresh(task)

    loop = asyncio.get_running_loop()
    progress_store.get_or_create(task.id)
    progress_store.update(
        task.id,
        stage="preparing",
        percent=0,
        output_width=merge_target.width,
        output_height=merge_target.height,
        output_preset=request.output_preset,
        log_line=(
            f"[Task #{task.id}] Ghép {len(input_paths)} video → "
            f"{merge_target.width}x{merge_target.height} (preset={request.output_preset})"
        ),
    )

    progress_payload = progress_store.get(task.id)
    await manager.broadcast({"type": "task_update", "task_id": task.id, "status": "processing"})
    if progress_payload:
        await manager.broadcast(
            {"type": "task_progress", "task_id": task.id, **progress_payload.to_dict()},
        )

    paths_snapshot = list(input_paths)
    preset_snapshot = request.output_preset

    async def _run_merge_job() -> None:
        await loop.run_in_executor(
            merge_executor,
            merge_videos_task,
            paths_snapshot,
            task.id,
            preset_snapshot,
            loop,
        )

    asyncio.create_task(_run_merge_job())

    return build_task_response(task, db)


@app.get("/tasks/{task_id}/merge-info", response_model=schemas.TaskMergeInfoResponse)
def get_task_merge_info(task_id: int, db: Session = Depends(database.get_db)):
    task = db.query(models.VideoTask).filter(models.VideoTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    try:
        return build_merge_info(task, db)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/tasks/{task_id}/reset", response_model=schemas.VideoTaskResponse)
async def reset_task(task_id: int, db: Session = Depends(database.get_db)):
    """Đưa task processing/failed về pending — dùng khi ghép kẹt sau restart Docker."""
    task = db.query(models.VideoTask).filter(models.VideoTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in (ProcessingStatus.PROCESSING, ProcessingStatus.FAILED):
        raise HTTPException(
            status_code=400,
            detail=f"Task cannot be reset (status={task.status.value})",
        )

    if task.output_filepath and os.path.isfile(task.output_filepath):
        try:
            os.remove(task.output_filepath)
        except OSError:
            pass

    task.status = ProcessingStatus.PENDING
    task.error_message = None
    task.merge_started_at = None
    task.merge_output_preset = None
    task.output_width = None
    task.output_height = None
    task.completed_at = None
    task.output_filename = None
    task.output_filepath = None
    db.commit()
    db.refresh(task)

    progress_store.clear(task_id)
    await manager.broadcast({"type": "task_update", "task_id": task.id, "status": "pending"})

    return build_task_response(task, db)


@app.get("/tasks", response_model=List[schemas.VideoTaskResponse])
def get_tasks(db: Session = Depends(database.get_db)):
    tasks = db.query(models.VideoTask).order_by(models.VideoTask.created_at.desc()).all()
    return [build_task_response(t, db) for t in tasks]

@app.get("/tasks/{task_id}", response_model=schemas.VideoTaskResponse)
def get_task(task_id: int, db: Session = Depends(database.get_db)):
    task = db.query(models.VideoTask).filter(models.VideoTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return build_task_response(task, db)

@app.get("/videos/{video_id}/stream")
def stream_uploaded_video(video_id: int, request: Request, db: Session = Depends(database.get_db)):
    video = db.query(models.UploadedVideo).filter(models.UploadedVideo.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if not os.path.exists(video.filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return video_stream_response(request, video.filepath, video.filename, inline=True)


@app.get("/videos/{video_id}/preview")
def preview_uploaded_video(video_id: int, request: Request, db: Session = Depends(database.get_db)):
    video = db.query(models.UploadedVideo).filter(models.UploadedVideo.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if not os.path.exists(video.filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")

    preview_path = uploaded_preview_path(PREVIEW_DIR, video_id)
    if preview_needs_rebuild(video.filepath, preview_path):
        try:
            if os.path.isfile(preview_path):
                os.remove(preview_path)
            build_browser_preview(video.filepath, preview_path)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Preview transcode failed: {exc}") from exc

    return video_stream_response(
        request,
        preview_path,
        f"preview_{video.filename}",
        inline=True,
    )


@app.post("/preview", response_model=schemas.PreviewResponse)
async def create_media_preview(file: UploadFile = File(...)):
    import uuid

    preview_id = uuid.uuid4().hex
    original = file.filename or "video.mp4"
    _, ext = os.path.splitext(original)
    src_path = os.path.join(PREVIEW_TEMP_DIR, f"{preview_id}_src{ext or '.mp4'}")
    out_path = os.path.join(PREVIEW_TEMP_DIR, f"{preview_id}.mp4")

    def save_preview() -> None:
        with open(src_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer, length=4 * 1024 * 1024)
            
    await asyncio.to_thread(save_preview)

    try:
        loop = asyncio.get_running_loop()
        probe = await loop.run_in_executor(merge_executor, build_browser_preview, src_path, out_path)
    except Exception as exc:
        for path in (src_path, out_path):
            if os.path.exists(path):
                os.remove(path)
        raise HTTPException(status_code=500, detail=f"Preview transcode failed: {exc}") from exc
    finally:
        if os.path.exists(src_path):
            os.remove(src_path)

    return schemas.PreviewResponse(
        id=preview_id,
        video_codec=probe.codec,
        browser_compatible=probe.browser_compatible,
        stream_url=f"/preview/{preview_id}/stream",
    )


@app.get("/preview/{preview_id}/stream")
def stream_media_preview(preview_id: str, request: Request):
    if not preview_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid preview id")
    preview_path = os.path.join(PREVIEW_TEMP_DIR, f"{preview_id}.mp4")
    if not os.path.isfile(preview_path):
        raise HTTPException(status_code=404, detail="Preview not found")
    return video_stream_response(request, preview_path, f"preview_{preview_id}.mp4", inline=True)

@app.get("/download/{filename}")
def download_video(filename: str, request: Request, inline: bool = False):
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return video_stream_response(request, file_path, filename, inline=inline)
