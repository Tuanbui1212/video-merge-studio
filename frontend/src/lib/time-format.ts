import type { TaskProgress, VideoTask } from '@/lib/types';

/** Định dạng số giây thành chuỗi tiếng Việt (vd. "8 phút 40 giây"). */
export function formatDurationSeconds(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '—';
  const sec = Math.round(totalSec);
  if (sec < 60) return `${sec} giây`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} giờ ${m} phút ${s} giây`;
  if (m > 0) return `${m} phút ${s} giây`;
  return `${s} giây`;
}

/** Thời gian encode/ghép thực tế (từ bắt đầu ghép → hoàn thành). */
export function mergeWallDurationSec(task: VideoTask): number | null {
  if (!task.completed_at || !task.merge_started_at) return null;
  const end = new Date(task.completed_at).getTime();
  const start = new Date(task.merge_started_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 1000;
}

/** Tổng thời lượng nội dung video output (từ metadata FFmpeg). */
export function outputContentDurationSec(
  progress?: TaskProgress | null,
): number | null {
  if (!progress) return null;
  if (progress.duration_sec > 0) return progress.duration_sec;
  if (progress.source_durations?.length) {
    const sum = progress.source_durations.reduce((a, b) => a + b, 0);
    return sum > 0 ? sum : null;
  }
  return null;
}

export function formatVideoClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
