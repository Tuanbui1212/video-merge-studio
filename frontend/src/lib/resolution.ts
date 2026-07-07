export interface OutputPresetOption {
  id: string;
  label: string;
  width: number;
  height: number;
}

export interface TaskMergeInfo {
  max_source_width: number;
  max_source_height: number;
  max_source_label: string;
  output_options: OutputPresetOption[];
  default_preset: string;
  sources: Array<{
    id: number;
    filename: string;
    position: number;
    uploaded_at: string;
    width?: number;
    height?: number;
    resolution_label?: string;
  }>;
}

export function formatResolutionLine(width: number, height: number, label?: string): string {
  const tag = label ?? resolutionLabel(width, height);
  return `${width}×${height} (${tag})`;
}

export function resolutionLabel(width: number, height: number): string {
  if (width >= 3840 && height >= 2160) return '4K';
  if (width >= 2560 && height >= 1440) return '2K';
  if (width >= 1920 && height >= 1080) return '1080p';
  if (width >= 1280 && height >= 720) return '720p';
  return `${width}×${height}`;
}

export function presetOptionLabel(opt: OutputPresetOption): string {
  if (opt.id === 'source') {
    return `${opt.label} — ${opt.width}×${opt.height}`;
  }
  return `${opt.label} — ${opt.width}×${opt.height}`;
}
