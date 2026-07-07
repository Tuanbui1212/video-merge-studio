from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from .database import Base

class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class UploadedVideo(Base):
    __tablename__ = "uploaded_videos"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    filepath = Column(String)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

class VideoTask(Base):
    __tablename__ = "video_tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    status = Column(Enum(ProcessingStatus), default=ProcessingStatus.PENDING)
    output_filename = Column(String, nullable=True)
    output_filepath = Column(String, nullable=True)
    merge_output_preset = Column(String, nullable=True)
    output_width = Column(Integer, nullable=True)
    output_height = Column(Integer, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    merge_started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    source_videos = relationship("TaskSourceVideo", back_populates="task", order_by="TaskSourceVideo.position")

class TaskSourceVideo(Base):
    __tablename__ = "task_source_videos"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("video_tasks.id"), nullable=False, index=True)
    uploaded_video_id = Column(Integer, ForeignKey("uploaded_videos.id"), nullable=False)
    position = Column(Integer, nullable=False, default=0)

    task = relationship("VideoTask", back_populates="source_videos")
    uploaded_video = relationship("UploadedVideo")
