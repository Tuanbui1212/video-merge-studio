import os

from sqlalchemy.orm import Session

from . import models, schemas
from .progress_store import progress_store
from .resolution_utils import (
    available_output_presets,
    format_resolution,
    probe_sources,
    resolution_label,
)


def get_task_source_paths(task: models.VideoTask, db: Session) -> list[tuple[models.TaskSourceVideo, models.UploadedVideo]]:
    return (
        db.query(models.TaskSourceVideo, models.UploadedVideo)
        .join(models.UploadedVideo, models.TaskSourceVideo.uploaded_video_id == models.UploadedVideo.id)
        .filter(models.TaskSourceVideo.task_id == task.id)
        .order_by(models.TaskSourceVideo.position)
        .all()
    )


def build_merge_info(task: models.VideoTask, db: Session) -> schemas.TaskMergeInfoResponse:
    links = get_task_source_paths(task, db)
    if len(links) < 2:
        raise ValueError("Task needs at least 2 source videos")

    sources: list[schemas.TaskSourceVideoResponse] = []
    input_paths: list[str] = []
    max_width = 0
    max_height = 0

    for link, video in links:
        if not os.path.isfile(video.filepath):
            raise FileNotFoundError(f"Source file missing: {video.filename}")
        input_paths.append(video.filepath)
        info = probe_sources([video.filepath])[0]
        max_width = max(max_width, info.width)
        max_height = max(max_height, info.height)
        sources.append(
            schemas.TaskSourceVideoResponse(
                id=video.id,
                filename=video.filename,
                position=link.position,
                uploaded_at=video.uploaded_at,
                width=info.width,
                height=info.height,
                resolution_label=resolution_label(info.width, info.height),
            )
        )

    options = available_output_presets(max_width, max_height)
    return schemas.TaskMergeInfoResponse(
        max_source_width=max_width,
        max_source_height=max_height,
        max_source_label=resolution_label(max_width, max_height),
        output_options=[
            schemas.OutputPresetOption(
                id=opt.id,
                label=opt.label,
                width=opt.width,
                height=opt.height,
            )
            for opt in options
        ],
        default_preset="source",
        sources=sources,
    )


def build_task_response(task: models.VideoTask, db: Session) -> schemas.VideoTaskResponse:
    links = get_task_source_paths(task, db)
    source_videos = [
        schemas.TaskSourceVideoResponse(
            id=video.id,
            filename=video.filename,
            position=link.position,
            uploaded_at=video.uploaded_at,
        )
        for link, video in links
    ]

    progress_data = None
    state = progress_store.get(task.id)
    if state:
        progress_data = schemas.TaskProgressResponse(**state.to_dict())

    output_resolution_label = None
    if task.output_width and task.output_height:
        output_resolution_label = format_resolution(task.output_width, task.output_height)

    return schemas.VideoTaskResponse(
        id=task.id,
        status=task.status,
        output_filename=task.output_filename,
        merge_output_preset=task.merge_output_preset,
        output_width=task.output_width,
        output_height=task.output_height,
        output_resolution_label=output_resolution_label,
        error_message=task.error_message,
        created_at=task.created_at,
        merge_started_at=task.merge_started_at,
        completed_at=task.completed_at,
        source_videos=source_videos,
        progress=progress_data,
    )
