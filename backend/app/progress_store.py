from __future__ import annotations

from dataclasses import dataclass, field
from threading import RLock
from typing import Optional

MAX_LOG_LINES = 100


@dataclass
class TaskProgressState:
    percent: float = 0.0
    time_sec: float = 0.0
    duration_sec: float = 0.0
    speed: float = 0.0
    fps: int = 0
    bitrate_kbps: int = 0
    eta_sec: Optional[float] = None
    stage: str = "pending"
    log_lines: list[str] = field(default_factory=list)
    source_durations: list[float] = field(default_factory=list)
    output_width: int = 0
    output_height: int = 0
    output_preset: str = ""

    def to_dict(self) -> dict:
        return {
            "percent": round(self.percent, 1),
            "time_sec": round(self.time_sec, 1),
            "duration_sec": round(self.duration_sec, 1),
            "speed": round(self.speed, 2),
            "fps": self.fps,
            "bitrate_kbps": self.bitrate_kbps,
            "eta_sec": round(self.eta_sec) if self.eta_sec is not None else None,
            "stage": self.stage,
            "log_lines": self.log_lines[-MAX_LOG_LINES:],
            "source_durations": self.source_durations,
            "output_width": self.output_width,
            "output_height": self.output_height,
            "output_preset": self.output_preset,
        }


class ProgressStore:
    def __init__(self) -> None:
        self._data: dict[int, TaskProgressState] = {}
        self._lock = RLock()

    def get(self, task_id: int) -> Optional[TaskProgressState]:
        with self._lock:
            return self._data.get(task_id)

    def get_or_create(self, task_id: int) -> TaskProgressState:
        with self._lock:
            if task_id not in self._data:
                self._data[task_id] = TaskProgressState()
            return self._data[task_id]

    def update(self, task_id: int, **kwargs) -> TaskProgressState:
        with self._lock:
            if task_id not in self._data:
                self._data[task_id] = TaskProgressState()
            state = self._data[task_id]
            for key, value in kwargs.items():
                if key == "log_line" and value:
                    state.log_lines.append(str(value))
                    if len(state.log_lines) > MAX_LOG_LINES:
                        state.log_lines = state.log_lines[-MAX_LOG_LINES:]
                elif hasattr(state, key):
                    setattr(state, key, value)
            return state

    def clear(self, task_id: int) -> None:
        with self._lock:
            self._data.pop(task_id, None)


progress_store = ProgressStore()
