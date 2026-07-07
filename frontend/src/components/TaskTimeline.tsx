'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
  Activity, Clock, Film, Gauge, Layers, Monitor, ScrollText, Terminal, Zap,
} from 'lucide-react';
import type { VideoTask } from '@/lib/types';
import { useTaskProgress } from '@/contexts/TaskProgressContext';
import {
  formatDurationSeconds,
  formatVideoClock,
  mergeWallDurationSec,
  outputContentDurationSec,
} from '@/lib/time-format';
import { formatResolutionLine } from '@/lib/resolution';

interface TaskTimelineProps {
  task: VideoTask | null;
}

const SEGMENT_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-cyan-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatEta(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)} giây`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} phút ${s} giây`;
}

function stageLabel(stage?: string): string {
  switch (stage) {
    case 'preparing': return 'Chuẩn bị';
    case 'encoding': return 'Đang encode';
    case 'done': return 'Hoàn tất';
    case 'failed': return 'Lỗi';
    default: return 'Chờ';
  }
}

function TaskTimelineInner({ task }: TaskTimelineProps) {
  const progress = useTaskProgress(task?.id ?? null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progress?.log_lines?.length]);

  const durations = useMemo(
    () => (progress?.source_durations?.length
      ? progress.source_durations
      : task?.source_videos.map(() => 1) ?? []),
    [progress?.source_durations, task?.source_videos],
  );
  const totalDuration = useMemo(
    () => durations.reduce((a, b) => a + b, 0) || 1,
    [durations],
  );
  const playheadPercent = useMemo(
    () => (progress?.duration_sec
      ? Math.min((progress.time_sec / progress.duration_sec) * 100, 100)
      : 0),
    [progress?.duration_sec, progress?.time_sec],
  );

  if (!task) {
    return (
      <div data-tour="timeline" className="h-full bg-[#141414] flex flex-col border-t border-[#282828]">
        <div className="h-9 border-b border-[#282828] flex items-center px-4 bg-[#181818] gap-2">
          <Layers className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-medium text-gray-400">Timeline & FFmpeg Log</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-600">Chọn task để xem timeline ghép và log FFmpeg realtime</p>
        </div>
      </div>
    );
  }

  const isActive = task.status === 'pending' || task.status === 'processing';
  const logs = progress?.log_lines ?? [];
  const mergeDuration = mergeWallDurationSec(task);
  const contentDuration = outputContentDurationSec(progress);
  const isDone = task.status === 'completed';

  return (
    <div data-tour="timeline" className="h-full bg-[#141414] flex flex-col border-t border-[#282828]">
      {/* Header */}
      <div className="h-9 border-b border-[#282828] flex items-center justify-between px-4 bg-[#181818] shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-medium text-gray-300">Timeline · Task #{task.id}</span>
          {isActive && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-950 text-blue-400 border border-blue-500/30">
              {stageLabel(progress?.stage)}
            </span>
          )}
        </div>
        {progress && (
          <span className="text-[10px] font-mono text-blue-400">
            {progress.percent > 0 ? `${Math.round(progress.percent)}%` : stageLabel(progress.stage)}
          </span>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: timeline + stats */}
        <div className="flex-1 flex flex-col p-3 gap-2 min-w-0 border-r border-[#282828]">
          {/* Stats chips */}
          {isActive && progress && (
            <div className="flex flex-wrap gap-1.5 shrink-0">
              <StatChip icon={Clock} label="Thời gian" value={`${formatTime(progress.time_sec)} / ${formatTime(progress.duration_sec)}`} />
              <StatChip icon={Gauge} label="Tốc độ" value={progress.speed > 0 ? `${progress.speed.toFixed(2)}x` : '—'} />
              <StatChip icon={Zap} label="FPS" value={progress.fps > 0 ? String(progress.fps) : '—'} />
              <StatChip icon={Activity} label="Bitrate" value={progress.bitrate_kbps > 0 ? `${progress.bitrate_kbps} kbps` : '—'} />
              <StatChip icon={Clock} label="Còn lại" value={formatEta(progress.eta_sec)} accent />
              {(progress.output_width ?? 0) > 0 && (progress.output_height ?? 0) > 0 && (
                <StatChip
                  icon={Monitor}
                  label="Đầu ra"
                  value={formatResolutionLine(progress.output_width!, progress.output_height!)}
                />
              )}
            </div>
          )}

          {isDone && (
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {mergeDuration != null && (
                <StatChip
                  icon={Clock}
                  label="Thời gian ghép"
                  value={formatDurationSeconds(mergeDuration)}
                  accent
                />
              )}
              {contentDuration != null && (
                <StatChip
                  icon={Film}
                  label="Độ dài video"
                  value={`${formatVideoClock(contentDuration)} (${formatDurationSeconds(contentDuration)})`}
                />
              )}
              {(task.output_width && task.output_height) ? (
                <StatChip
                  icon={Monitor}
                  label="Độ phân giải đầu ra"
                  value={task.output_resolution_label ?? formatResolutionLine(task.output_width, task.output_height)}
                  accent
                />
              ) : (progress?.output_width ?? 0) > 0 && (progress?.output_height ?? 0) > 0 ? (
                <StatChip
                  icon={Monitor}
                  label="Độ phân giải đầu ra"
                  value={formatResolutionLine(progress!.output_width!, progress!.output_height!)}
                  accent
                />
              ) : null}
              {task.completed_at && (
                <StatChip
                  icon={Clock}
                  label="Hoàn thành lúc"
                  value={new Date(task.completed_at).toLocaleString('vi-VN')}
                />
              )}
            </div>
          )}

          {/* Visual timeline */}
          {task.source_videos.length > 0 ? (
            <div className="flex-1 flex flex-col justify-center gap-2 min-h-0">
              <div className="relative h-10 bg-[#0e0e0e] rounded-lg border border-[#282828] overflow-hidden">
                <div className="absolute inset-0 flex">
                  {task.source_videos.map((video, i) => {
                    const widthPercent = (durations[i] / totalDuration) * 100;
                    return (
                      <div
                        key={video.id}
                        className={`relative h-full ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]} opacity-80 border-r border-black/30 last:border-r-0 group`}
                        style={{ width: `${widthPercent}%` }}
                        title={`${video.position + 1}. ${video.filename}`}
                      >
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-white/90 truncate px-1">
                          {video.position + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {playheadPercent > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10 transition-all duration-300"
                    style={{ left: `${playheadPercent}%` }}
                  >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
                  </div>
                )}
                {task.status === 'completed' && (
                  <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center">
                    <span className="text-[10px] text-green-400 font-medium">✓ Ghép hoàn tất</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {task.source_videos.map((video, i) => (
                  <span key={video.id} className="flex items-center gap-1 text-[9px] text-gray-500">
                    <span className={`w-2 h-2 rounded-sm ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`} />
                    <Film className="w-2.5 h-2.5" />
                    <span className="truncate max-w-[100px]">{video.filename}</span>
                    {durations[i] > 1 && (
                      <span className="text-gray-600 font-mono">({formatTime(durations[i])})</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-gray-600 flex-1 flex items-center">Không có dữ liệu video nguồn cho timeline.</p>
          )}
        </div>

        {/* Right: log console */}
        <div className="w-[42%] max-w-md flex flex-col min-h-0 bg-[#0a0a0a]">
          <div className="h-7 flex items-center gap-1.5 px-3 border-b border-[#282828] shrink-0">
            <Terminal className="w-3 h-3 text-green-500" />
            <span className="text-[10px] font-medium text-gray-500">FFmpeg Log</span>
            <ScrollText className="w-3 h-3 text-gray-600 ml-auto" />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 font-mono text-[9px] leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-gray-700 italic">
                {isActive ? 'Đang chờ log từ FFmpeg...' : 'Chưa có log cho task này.'}
              </p>
            ) : (
              logs.map((line, i) => (
                <LogLine key={`${i}-${line.slice(0, 24)}`} line={line} isLatest={i === logs.length - 1} />
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] ${
      accent
        ? 'bg-blue-950/50 border-blue-500/30 text-blue-300'
        : 'bg-[#181818] border-[#282828] text-gray-400'
    }`}>
      <Icon className="w-2.5 h-2.5 shrink-0" />
      <span className="text-gray-600">{label}:</span>
      <span className={`font-mono ${accent ? 'text-blue-300' : 'text-gray-300'}`}>{value}</span>
    </div>
  );
}

function LogLine({ line, isLatest }: { line: string; isLatest: boolean }) {
  const isError = line.startsWith('✗') || line.toLowerCase().includes('error');
  const isSuccess = line.startsWith('✓');
  const isInfo = line.startsWith('[') || line.startsWith('  ') || line.startsWith('Tổng') || line.startsWith('Bắt đầu');

  let color = 'text-gray-500';
  if (isError) color = 'text-red-400';
  else if (isSuccess) color = 'text-green-400';
  else if (isLatest && line.includes('time=')) color = 'text-cyan-400';
  else if (isInfo) color = 'text-gray-400';

  return (
    <div className={`${color} ${isLatest ? 'bg-white/[0.03] -mx-1 px-1 rounded' : ''} break-all`}>
      {line}
    </div>
  );
}

export default React.memo(TaskTimelineInner);
