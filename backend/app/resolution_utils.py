from __future__ import annotations

from dataclasses import dataclass

from .ffmpeg_utils import MergeTarget, VideoStreamInfo, _even_dimension, compute_merge_target, probe_video_stream


@dataclass(frozen=True)
class ResolutionPreset:
    id: str
    label: str
    width: int
    height: int


OUTPUT_PRESETS: tuple[ResolutionPreset, ...] = (
    ResolutionPreset("4k", "4K UHD", 3840, 2160),
    ResolutionPreset("1440p", "2K (1440p)", 2560, 1440),
    ResolutionPreset("1080p", "Full HD (1080p)", 1920, 1080),
    ResolutionPreset("720p", "HD (720p)", 1280, 720),
)


def resolution_label(width: int, height: int) -> str:
    if width >= 3840 and height >= 2160:
        return "4K"
    if width >= 2560 and height >= 1440:
        return "2K"
    if width >= 1920 and height >= 1080:
        return "1080p"
    if width >= 1280 and height >= 720:
        return "720p"
    return f"{width}×{height}"


def format_resolution(width: int, height: int) -> str:
    return f"{width}×{height} ({resolution_label(width, height)})"


def preset_fits_source(preset: ResolutionPreset, max_width: int, max_height: int) -> bool:
    return preset.width <= max_width and preset.height <= max_height


def available_output_presets(max_width: int, max_height: int) -> list[ResolutionPreset]:
    natural = ResolutionPreset(
        "source",
        f"Cao nhất ({resolution_label(max_width, max_height)})",
        max_width,
        max_height,
    )
    options = [natural]
    for preset in OUTPUT_PRESETS:
        if preset_fits_source(preset, max_width, max_height):
            options.append(preset)
    return options


def resolve_merge_target(input_paths: list[str], output_preset: str = "source") -> MergeTarget:
    natural = compute_merge_target(input_paths)
    if output_preset == "source":
        return natural

    preset = next((p for p in OUTPUT_PRESETS if p.id == output_preset), None)
    if preset is None:
        raise ValueError(f"Unknown output preset: {output_preset}")
    if not preset_fits_source(preset, natural.width, natural.height):
        raise ValueError(
            f"Preset {output_preset} ({preset.width}x{preset.height}) "
            f"exceeds source max ({natural.width}x{natural.height})",
        )

    return MergeTarget(
        width=_even_dimension(preset.width),
        height=_even_dimension(preset.height),
        fps=natural.fps,
    )


def probe_sources(input_paths: list[str]) -> list[VideoStreamInfo]:
    return [probe_video_stream(path) for path in input_paths]
