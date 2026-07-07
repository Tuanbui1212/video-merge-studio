import asyncio
import datetime
import os
import uuid

from .ffmpeg_utils import build_merge_command, probe_duration, run_ffmpeg_with_progress
from .resolution_utils import resolve_merge_target
from .progress_store import progress_store
from .websocket_manager import manager

OUTPUT_DIR = "/app/outputs"


PREPARE_MAX_PERCENT = 12.0
ENCODE_PERCENT_RANGE = 100.0 - PREPARE_MAX_PERCENT


def _broadcast_progress(task_id: int, loop: asyncio.AbstractEventLoop | None) -> None:
    state = progress_store.get(task_id)
    if not state:
        return
    manager.broadcast_sync(
        {
            "type": "task_progress",
            "task_id": task_id,
            **state.to_dict(),
        },
        loop,
    )


def merge_videos_task(
    input_paths: list[str],
    task_id: int,
    output_preset: str = "source",
    loop: asyncio.AbstractEventLoop | None = None,
):
    from .database import SessionLocal
    from .models import ProcessingStatus, VideoTask

    db = SessionLocal()
    try:
        task = db.query(VideoTask).filter(VideoTask.id == task_id).first()
        if not task:
            return
        task.status = ProcessingStatus.PROCESSING
        db.commit()
    finally:
        db.close()

    try:
        progress_store.get_or_create(task_id)
        manager.broadcast_sync(
            {"type": "task_update", "task_id": task_id, "status": "processing"},
            loop,
        )

        progress_store.update(
            task_id,
            stage="preparing",
            percent=1.0,
            log_line=f"[Task #{task_id}] Đang phân tích {len(input_paths)} video nguồn...",
        )
        _broadcast_progress(task_id, loop)

        source_durations = []
        total_inputs = len(input_paths)
        for index, path in enumerate(input_paths, start=1):
            progress_store.update(
                task_id,
                stage="preparing",
                percent=max(1.0, ((index - 1) / total_inputs) * PREPARE_MAX_PERCENT),
                log_line=f"Đang đọc metadata video {index}/{total_inputs}...",
            )
            _broadcast_progress(task_id, loop)

            duration = probe_duration(path)
            source_durations.append(duration)
            progress_store.update(
                task_id,
                percent=(index / total_inputs) * PREPARE_MAX_PERCENT,
                log_line=f"  Video {index}: {duration / 60:.1f} phút ({duration:.0f}s)",
            )
            _broadcast_progress(task_id, loop)

        total_duration = sum(source_durations)
        progress_store.update(
            task_id,
            source_durations=source_durations,
            duration_sec=total_duration,
            percent=PREPARE_MAX_PERCENT,
            log_line=f"Tổng thời lượng ước tính: {total_duration / 60:.1f} phút",
        )
        _broadcast_progress(task_id, loop)

        output_filename = f"merged_{uuid.uuid4().hex}.mp4"
        output_path = os.path.join(OUTPUT_DIR, output_filename)
        merge_target = resolve_merge_target(input_paths, output_preset)
        cmd = build_merge_command(input_paths, output_path, target=merge_target)

        progress_store.update(
            task_id,
            stage="encoding",
            percent=PREPARE_MAX_PERCENT,
            output_width=merge_target.width,
            output_height=merge_target.height,
            output_preset=output_preset,
            log_line=(
                f"Bắt đầu FFmpeg encode chất lượng cao "
                f"({merge_target.width}x{merge_target.height} @ {merge_target.fps}fps, "
                f"libx264 crf=18, preset=slow)..."
            ),
        )
        _broadcast_progress(task_id, loop)

        def on_log(line: str) -> None:
            if "time=" in line or "frame=" in line:
                progress_store.update(task_id, log_line=line)

        def on_progress(data: dict) -> None:
            raw_percent = float(data.get("percent") or 0.0)
            scaled_percent = PREPARE_MAX_PERCENT + (raw_percent / 100.0) * ENCODE_PERCENT_RANGE
            progress_store.update(
                task_id,
                **{**data, "percent": min(99.0, scaled_percent), "stage": "encoding"},
            )
            _broadcast_progress(task_id, loop)

        run_ffmpeg_with_progress(
            cmd,
            total_duration_sec=total_duration,
            on_progress=on_progress,
            on_log=on_log,
        )

        progress_store.update(
            task_id,
            stage="done",
            percent=100.0,
            time_sec=total_duration,
            eta_sec=0,
            log_line="FFmpeg hoàn tất — đang lưu kết quả...",
        )
        _broadcast_progress(task_id, loop)

        completed_at: datetime.datetime | None = None
        db = SessionLocal()
        try:
            task = db.query(VideoTask).filter(VideoTask.id == task_id).first()
            if task:
                task.status = ProcessingStatus.COMPLETED
                task.output_filename = output_filename
                task.output_filepath = output_path
                task.output_width = merge_target.width
                task.output_height = merge_target.height
                task.merge_output_preset = output_preset
                completed_at = datetime.datetime.now(datetime.timezone.utc)
                task.completed_at = completed_at
                db.commit()
        finally:
            db.close()

        manager.broadcast_sync(
            {
                "type": "task_update",
                "task_id": task_id,
                "status": "completed",
                "output_filename": output_filename,
                "completed_at": completed_at.isoformat() if completed_at else None,
            },
            loop,
        )
        progress_store.update(
            task_id,
            log_line=f"✓ Ghép xong: {output_filename} ({merge_target.width}x{merge_target.height})",
        )
        _broadcast_progress(task_id, loop)

    except Exception as e:
        error_message = str(e)
        if hasattr(e, "stderr") and e.stderr:
            error_message = e.stderr.decode("utf-8") if isinstance(e.stderr, bytes) else str(e.stderr)
        db = SessionLocal()
        try:
            task = db.query(VideoTask).filter(VideoTask.id == task_id).first()
            if task:
                task.status = ProcessingStatus.FAILED
                task.error_message = error_message[:2000]
                db.commit()
        finally:
            db.close()

        progress_store.update(
            task_id,
            stage="failed",
            log_line=f"✗ Lỗi: {error_message[:500]}",
        )
        _broadcast_progress(task_id, loop)
        manager.broadcast_sync(
            {
                "type": "task_update",
                "task_id": task_id,
                "status": "failed",
                "error_message": error_message[:2000],
            },
            loop,
        )
