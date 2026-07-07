from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass

BROWSER_COMPATIBLE_CODECS = {"h264", "vp8", "vp9", "av1"}


@dataclass
class VideoProbe:
    codec: str
    pix_fmt: str
    width: int
    height: int

    @property
    def browser_compatible(self) -> bool:
        return self.codec in BROWSER_COMPATIBLE_CODECS and self.pix_fmt == "yuv420p"


def probe_video(path: str) -> VideoProbe:
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
        raise ValueError("No video stream found")
    stream = streams[0]
    return VideoProbe(
        codec=(stream.get("codec_name") or "unknown").lower(),
        pix_fmt=stream.get("pix_fmt") or "",
        width=int(stream.get("width") or 0),
        height=int(stream.get("height") or 0),
    )


def build_browser_preview(source_path: str, output_path: str) -> VideoProbe:
    """Create a full-length H.264/yuv420p MP4 the browser can play in <video>."""
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    probe = probe_video(source_path)

    if probe.browser_compatible:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            source_path,
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            output_path,
        ]
    else:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            source_path,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "28",
            "-vf",
            "scale='min(1280,iw)':-2",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            output_path,
        ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "")[-2000:]
        raise RuntimeError(tail or f"ffmpeg preview failed ({proc.returncode})")

    return probe


def uploaded_preview_path(preview_dir: str, video_id: int) -> str:
    return os.path.join(preview_dir, f"{video_id}.mp4")


def preview_needs_rebuild(source_path: str, preview_path: str) -> bool:
    if not os.path.isfile(preview_path):
        return True
    if not os.path.isfile(source_path):
        return False
    return os.path.getmtime(source_path) > os.path.getmtime(preview_path)
