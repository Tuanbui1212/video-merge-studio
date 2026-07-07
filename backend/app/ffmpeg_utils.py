from __future__ import annotations

import json
import math
import re
import select
import subprocess
import time
from dataclasses import dataclass
from typing import Callable

import ffmpeg

# Encode ưu tiên chất lượng (file lớn hơn, chậm hơn preset=fast + 1080p cố định)
MERGE_CRF = 18
MERGE_PRESET = "slow"
MERGE_AUDIO_BITRATE = "256k"
MERGE_AUDIO_SAMPLE_RATE = 48000
MAX_MERGE_WIDTH = 3840
MAX_MERGE_HEIGHT = 2160

TIME_RE = re.compile(r"time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)")
SPEED_RE = re.compile(r"speed=\s*([\d.]+)x")
FRAME_RE = re.compile(r"frame=\s*(\d+)")
FPS_RE = re.compile(r"fps=\s*([\d.]+)")
BITRATE_RE = re.compile(r"bitrate=\s*([\d.]+)kbits/s")


def probe_duration(path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def parse_timecode(h: str, m: str, s: str) -> float:
    return int(h) * 3600 + int(m) * 60 + float(s)


def parse_ffmpeg_progress_line(line: str) -> dict:
    parsed: dict = {}
    time_match = TIME_RE.search(line)
    if time_match:
        parsed["time_sec"] = parse_timecode(*time_match.groups())
    speed_match = SPEED_RE.search(line)
    if speed_match:
        parsed["speed"] = float(speed_match.group(1))
    frame_match = FRAME_RE.search(line)
    if frame_match:
        parsed["frame"] = int(frame_match.group(1))
    fps_match = FPS_RE.search(line)
    if fps_match:
        parsed["fps"] = int(float(fps_match.group(1)))
    bitrate_match = BITRATE_RE.search(line)
    if bitrate_match:
        parsed["bitrate_kbps"] = int(float(bitrate_match.group(1)))
    return parsed


@dataclass(frozen=True)
class VideoStreamInfo:
    width: int
    height: int
    fps: float


@dataclass(frozen=True)
class MergeTarget:
    width: int
    height: int
    fps: float


def _even_dimension(value: int) -> int:
    return value if value % 2 == 0 else value - 1


def parse_frame_rate(value: str) -> float:
    if not value or value == "0/0":
        return 0.0
    if "/" in value:
        num, den = value.split("/", 1)
        denominator = float(den)
        return float(num) / denominator if denominator else 0.0
    return float(value)


def probe_video_stream(path: str) -> VideoStreamInfo:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-select_streams",
            "v:0",
            "-show_streams",
            path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    streams = json.loads(result.stdout).get("streams", [])
    if not streams:
        raise ValueError(f"No video stream found: {path}")
    stream = streams[0]
    width = int(stream.get("width") or 0)
    height = int(stream.get("height") or 0)
    fps = parse_frame_rate(stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "0")
    if fps <= 0:
        fps = 30.0
    return VideoStreamInfo(width=width, height=height, fps=fps)


def compute_merge_target(input_paths: list[str]) -> MergeTarget:
    """Chọn canvas = độ phân giải cao nhất trong các clip (tối đa 4K), fps = cao nhất."""
    max_width = 0
    max_height = 0
    max_fps = 0.0
    for path in input_paths:
        info = probe_video_stream(path)
        max_width = max(max_width, info.width)
        max_height = max(max_height, info.height)
        max_fps = max(max_fps, info.fps)

    width = _even_dimension(min(max(max_width, 2), MAX_MERGE_WIDTH))
    height = _even_dimension(min(max(max_height, 2), MAX_MERGE_HEIGHT))
    fps = max(max_fps, 24.0)
    # Làm tròn fps hợp lệ cho filter fps (tránh 29.970029...)
    fps = round(fps, 3)
    if math.isclose(fps, round(fps)):
        fps = float(round(fps))
    return MergeTarget(width=width, height=height, fps=fps)


def probe_has_audio(path: str) -> bool:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return bool(result.stdout.strip())


def build_merge_command(
    input_paths: list[str],
    output_path: str,
    *,
    target: MergeTarget | None = None,
) -> list[str]:
    merge_target = target or compute_merge_target(input_paths)
    normalized_streams = []
    for path in input_paths:
        stream = ffmpeg.input(path)
        video = (
            stream.video.filter(
                "scale",
                merge_target.width,
                merge_target.height,
                force_original_aspect_ratio="decrease",
            )
            .filter("pad", merge_target.width, merge_target.height, "(ow-iw)/2", "(oh-ih)/2")
            .filter("fps", fps=merge_target.fps, round="up")
            .filter("setsar", 1)
        )
        if probe_has_audio(path):
            audio = (
                stream.audio
                .filter("aresample", MERGE_AUDIO_SAMPLE_RATE)
                .filter("aformat", sample_fmts="fltp", channel_layouts="stereo")
            )
        else:
            duration = probe_duration(path)
            audio = (
                ffmpeg.input(
                    f"anullsrc=channel_layout=stereo:sample_rate={MERGE_AUDIO_SAMPLE_RATE}",
                    f="lavfi",
                    t=duration,
                )
                .audio
            )
        normalized_streams.extend([video, audio])

    joined = ffmpeg.concat(*normalized_streams, v=1, a=1).node
    out = ffmpeg.output(
        joined[0],
        joined[1],
        output_path,
        vcodec="libx264",
        acodec="aac",
        crf=MERGE_CRF,
        preset=MERGE_PRESET,
        pix_fmt="yuv420p",
        audio_bitrate=MERGE_AUDIO_BITRATE,
        movflags="+faststart",
    ).global_args("-threads", "2", "-y")
    return ffmpeg.compile(out, overwrite_output=True)


def run_ffmpeg_with_progress(
    cmd: list[str],
    *,
    total_duration_sec: float,
    on_progress: Callable[[dict], None],
    on_log: Callable[[str], None],
) -> None:
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
    )
    assert process.stderr is not None

    buffer = ""
    last_emit = 0.0
    current: dict = {
        "time_sec": 0.0,
        "speed": 0.0,
        "fps": 0,
        "bitrate_kbps": 0,
        "percent": 0.0,
        "eta_sec": None,
    }
    saw_encode_progress = False
    startup_announced = False
    process_started_at = time.time()

    def maybe_heartbeat() -> None:
        nonlocal startup_announced, last_emit
        if saw_encode_progress:
            return
        now = time.time()
        if now - process_started_at <= 3.0:
            return
        if not startup_announced:
            on_log("FFmpeg đang khởi động (scale/pad/concat) — chưa có frame đầu tiên...")
            startup_announced = True
        if now - last_emit >= 2.0:
            on_progress(dict(current))
            last_emit = now

    while process.poll() is None:
        ready, _, _ = select.select([process.stderr], [], [], 2.0)
        if not ready:
            maybe_heartbeat()
            continue

        chunk = process.stderr.read(4096)
        if not chunk:
            maybe_heartbeat()
            continue
        buffer += chunk.decode("utf-8", errors="replace")
        while True:
            sep_idx = -1
            for sep in ("\r", "\n"):
                idx = buffer.find(sep)
                if idx != -1 and (sep_idx == -1 or idx < sep_idx):
                    sep_idx = idx
            if sep_idx == -1:
                break
            line = buffer[:sep_idx].strip()
            buffer = buffer[sep_idx + 1 :]
            if not line:
                continue
            on_log(line)
            parsed = parse_ffmpeg_progress_line(line)
            if not parsed:
                continue
            current.update(parsed)
            if total_duration_sec > 0 and current.get("time_sec"):
                saw_encode_progress = True
                current["percent"] = min(
                    99.0,
                    (current["time_sec"] / total_duration_sec) * 100,
                )
            speed = current.get("speed") or 0.0
            if speed > 0 and total_duration_sec > current.get("time_sec", 0):
                current["eta_sec"] = (total_duration_sec - current["time_sec"]) / speed
            now = time.time()
            if now - last_emit >= 0.4:
                on_progress(dict(current))
                last_emit = now

    # Drain remaining stderr after process exit
    if process.stderr:
        tail = process.stderr.read()
        if tail:
            buffer += tail.decode("utf-8", errors="replace")
            while True:
                sep_idx = -1
                for sep in ("\r", "\n"):
                    idx = buffer.find(sep)
                    if idx != -1 and (sep_idx == -1 or idx < sep_idx):
                        sep_idx = idx
                if sep_idx == -1:
                    if buffer.strip():
                        on_log(buffer.strip())
                    break
                line = buffer[:sep_idx].strip()
                buffer = buffer[sep_idx + 1 :]
                if line:
                    on_log(line)

    return_code = process.wait()
    if return_code != 0:
        err_tail = buffer.strip()
        if process.stderr:
            try:
                err_tail = (err_tail + process.stderr.read().decode("utf-8", errors="replace")).strip()
            except Exception:
                pass
        detail = err_tail[-2000:] if err_tail else f"FFmpeg exited with code {return_code}"
        raise RuntimeError(detail)
