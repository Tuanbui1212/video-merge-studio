import { API_URL } from '@/lib/config';

/** URL để phát video trong Preview Viewer (inline, hỗ trợ Range) */
export function videoPlayUrl(path: string): string {
  if (path.includes('?')) return path;
  return `${path}${path.includes('/download/') ? '?inline=true' : ''}`;
}

export function sourceVideoUrl(videoId: number): string {
  return `${API_URL}/videos/${videoId}/stream`;
}

/** Preview H.264 — dùng khi file gốc là HEVC/TikTok (trình duyệt chỉ nghe tiếng) */
export function sourceVideoPreviewUrl(videoId: number): string {
  return `${API_URL}/videos/${videoId}/preview`;
}

export function mediaPreviewUrl(previewId: string): string {
  return `${API_URL}/preview/${previewId}/stream`;
}

export function outputVideoPlayUrl(filename: string): string {
  return `${API_URL}/download/${encodeURIComponent(filename)}?inline=true`;
}

export function outputVideoDownloadUrl(filename: string): string {
  return `${API_URL}/download/${encodeURIComponent(filename)}`;
}
