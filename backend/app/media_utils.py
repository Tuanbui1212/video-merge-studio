import mimetypes
import os
import re
import uuid
from typing import Iterator
from urllib.parse import quote

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse


def guess_video_media_type(filename: str) -> str:
    media_type, _ = mimetypes.guess_type(filename)
    return media_type or "video/mp4"


def content_disposition_header(disposition: str, filename: str) -> str:
    """Build a latin-1-safe Content-Disposition value (RFC 5987 for non-ASCII names)."""
    try:
        filename.encode("latin-1")
        return f'{disposition}; filename="{filename}"'
    except UnicodeEncodeError:
        ascii_fallback = re.sub(r"[^\x20-\x7E]", "_", filename) or "video.mp4"
        encoded = quote(filename, safe="")
        return f'{disposition}; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded}'


def unique_upload_path(upload_dir: str, original_filename: str) -> tuple[str, str]:
    """Return (disk_path, stored_filename) with unique name to avoid overwrites."""
    base, ext = os.path.splitext(original_filename)
    safe_base = base or "video"
    unique_name = f"{safe_base}_{uuid.uuid4().hex[:8]}{ext or '.mp4'}"
    return os.path.join(upload_dir, unique_name), unique_name


def _parse_range_header(range_header: str, file_size: int) -> tuple[int, int]:
    match = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
    if not match:
        raise HTTPException(status_code=416, detail="Invalid range header")

    start_str, end_str = match.groups()
    if start_str:
        start = int(start_str)
        end = int(end_str) if end_str else file_size - 1
    elif end_str:
        suffix = int(end_str)
        start = max(file_size - suffix, 0)
        end = file_size - 1
    else:
        raise HTTPException(status_code=416, detail="Invalid range header")

    if start >= file_size or start > end:
        raise HTTPException(
            status_code=416,
            detail="Range not satisfiable",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    return start, min(end, file_size - 1)


def _iter_file_range(path: str, start: int, end: int, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
    with open(path, "rb") as file:
        file.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = file.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def video_stream_response(
    request: Request,
    filepath: str,
    filename: str,
    *,
    inline: bool = True,
) -> StreamingResponse:
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="File not found")

    file_size = os.path.getsize(filepath)
    media_type = guess_video_media_type(filename)
    disposition = "inline" if inline else "attachment"
    base_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": content_disposition_header(disposition, filename),
    }

    range_header = request.headers.get("range")
    if range_header:
        start, end = _parse_range_header(range_header, file_size)
        content_length = end - start + 1
        headers = {
            **base_headers,
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(content_length),
        }
        return StreamingResponse(
            _iter_file_range(filepath, start, end),
            status_code=206,
            media_type=media_type,
            headers=headers,
        )

    headers = {**base_headers, "Content-Length": str(file_size)}
    return StreamingResponse(
        _iter_file_range(filepath, 0, file_size - 1),
        status_code=200,
        media_type=media_type,
        headers=headers,
    )
