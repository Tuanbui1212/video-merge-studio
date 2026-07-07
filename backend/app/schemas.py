from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from .models import ProcessingStatus

class UploadedVideoResponse(BaseModel):
    id: int
    filename: str
    uploaded_at: datetime
    
    class Config:
        from_attributes = True

class CreateTaskRequest(BaseModel):
    video_ids: List[int]

class TaskSourceVideoResponse(BaseModel):
    id: int
    filename: str
    position: int
    uploaded_at: datetime
    width: Optional[int] = None
    height: Optional[int] = None
    resolution_label: Optional[str] = None

    class Config:
        from_attributes = True


class OutputPresetOption(BaseModel):
    id: str
    label: str
    width: int
    height: int


class TaskMergeInfoResponse(BaseModel):
    max_source_width: int
    max_source_height: int
    max_source_label: str
    output_options: List[OutputPresetOption]
    default_preset: str = "source"
    sources: List[TaskSourceVideoResponse]


class MergeTaskRequest(BaseModel):
    output_preset: str = "source"

class TaskProgressResponse(BaseModel):
    percent: float = 0.0
    time_sec: float = 0.0
    duration_sec: float = 0.0
    speed: float = 0.0
    fps: int = 0
    bitrate_kbps: int = 0
    eta_sec: Optional[int] = None
    stage: str = "pending"
    log_lines: List[str] = []
    source_durations: List[float] = []
    output_width: int = 0
    output_height: int = 0
    output_preset: str = ""

class VideoTaskResponse(BaseModel):
    id: int
    status: ProcessingStatus
    output_filename: Optional[str]
    merge_output_preset: Optional[str] = None
    output_width: Optional[int] = None
    output_height: Optional[int] = None
    output_resolution_label: Optional[str] = None
    error_message: Optional[str]
    created_at: datetime
    merge_started_at: Optional[datetime] = None
    completed_at: Optional[datetime]
    source_videos: List[TaskSourceVideoResponse] = []
    progress: Optional[TaskProgressResponse] = None

    class Config:
        from_attributes = True


class PreviewResponse(BaseModel):
    id: str
    video_codec: str
    browser_compatible: bool
    stream_url: str
