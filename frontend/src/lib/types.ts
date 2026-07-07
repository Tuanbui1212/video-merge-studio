export interface TaskSourceVideo {
  id: number;
  filename: string;
  position: number;
  uploaded_at: string;
  width?: number;
  height?: number;
  resolution_label?: string;
}

export interface TaskProgress {
  percent: number;
  time_sec: number;
  duration_sec: number;
  speed: number;
  fps: number;
  bitrate_kbps: number;
  eta_sec: number | null;
  stage: 'pending' | 'preparing' | 'encoding' | 'done' | 'failed';
  log_lines: string[];
  source_durations: number[];
  output_width?: number;
  output_height?: number;
  output_preset?: string;
}

export interface VideoTask {
  id: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  output_filename: string | null;
  merge_output_preset?: string | null;
  output_width?: number | null;
  output_height?: number | null;
  output_resolution_label?: string | null;
  error_message: string | null;
  created_at: string;
  merge_started_at: string | null;
  completed_at: string | null;
  source_videos: TaskSourceVideo[];
  progress?: TaskProgress | null;
}
