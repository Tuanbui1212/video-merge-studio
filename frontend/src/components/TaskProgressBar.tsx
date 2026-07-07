'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { TaskProgress, VideoTask } from '@/lib/types';
import { formatDurationSeconds, mergeWallDurationSec } from '@/lib/time-format';

interface TaskProgressBarProps {
  task: VideoTask;
  progress?: TaskProgress | null;
  size?: 'sm' | 'md';
}

function formatElapsed(createdAt: string): string {
  const sec = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatEta(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `~${m}m ${s}s`;
}

function TaskProgressBarInner({ task, progress, size = 'sm' }: TaskProgressBarProps) {
  const [elapsed, setElapsed] = useState('');

  const hasRealProgress = !!(progress && progress.percent > 0);

  const percent = useMemo(() => {
    if (task.status === 'completed') return 100;
    if (task.status === 'failed') return 0;
    if (hasRealProgress) return Math.min(Math.round(progress!.percent), 99);
    return 0;
  }, [task.status, hasRealProgress, progress?.percent]);

  const showIndeterminate = (task.status === 'pending' || task.status === 'processing') && !hasRealProgress;

  const label = useMemo(() => {
    if (task.status === 'pending') return 'Sẵn sàng — bấm Bắt đầu ghép';
    if (progress?.stage === 'preparing') {
      return progress.percent > 0
        ? `Đang phân tích video nguồn... ${Math.round(progress.percent)}%`
        : 'Đang phân tích video nguồn...';
    }
    if (progress?.stage === 'encoding' && !hasRealProgress) {
      return 'FFmpeg đang khởi động (scale/concat)...';
    }
    if (hasRealProgress && progress) {
      const timePart = progress.duration_sec > 0
        ? `${formatTime(progress.time_sec)} / ${formatTime(progress.duration_sec)}`
        : formatTime(progress.time_sec);
      const speedPart = progress.speed > 0 ? ` · ${progress.speed.toFixed(2)}x` : '';
      return `Đang encode ${timePart}${speedPart}`;
    }
    return `Đang ghép... ${elapsed}`;
  }, [task.status, progress, hasRealProgress, elapsed]);

  useEffect(() => {
    if (task.status !== 'pending' && task.status !== 'processing') return;
    const tick = () => setElapsed(formatElapsed(task.created_at));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [task.status, task.created_at]);

  if (task.status === 'pending') {
    return (
      <div className="space-y-1">
        <div className={`${size === 'md' ? 'h-2' : 'h-1.5'} bg-[#282828] rounded-full overflow-hidden`}>
          <div className="h-full w-1/3 rounded-full bg-gray-600/50" />
        </div>
        <p className="text-[10px] text-gray-500">Chờ lệnh ghép — bấm Bắt đầu ghép</p>
      </div>
    );
  }

  if (task.status === 'completed') {
    const mergeDuration = mergeWallDurationSec(task);
    return (
      <div className="space-y-1">
        <div className={`${size === 'md' ? 'h-2' : 'h-1.5'} bg-[#282828] rounded-full overflow-hidden`}>
          <div className="h-full w-full bg-green-500 rounded-full" />
        </div>
        <p className="text-[10px] text-green-500">
          Hoàn thành 100%
          {mergeDuration != null
            ? ` · Ghép mất ${formatDurationSeconds(mergeDuration)}`
            : ''}
        </p>
      </div>
    );
  }

  if (task.status === 'failed') {
    return (
      <div className="space-y-1">
        <div className={`${size === 'md' ? 'h-2' : 'h-1.5'} bg-[#282828] rounded-full overflow-hidden`}>
          <div className="h-full w-full bg-red-500/60 rounded-full" />
        </div>
        <p className="text-[10px] text-red-400">Thất bại</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className={`relative ${size === 'md' ? 'h-2' : 'h-1.5'} bg-[#282828] rounded-full overflow-hidden`}>
        {hasRealProgress ? (
          <div
            className="h-full rounded-full transition-all duration-500 ease-out bg-blue-500"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="absolute inset-0 task-progress-shimmer rounded-full bg-blue-500/40" />
        )}
      </div>
      <div className="flex justify-between items-center gap-2 text-[10px]">
        <span className={task.status === 'processing' ? 'text-blue-400 truncate' : 'text-gray-500 truncate'}>
          {label}
        </span>
        <div className="flex items-center gap-2 shrink-0 font-mono text-gray-500">
          {hasRealProgress && progress?.eta_sec ? (
            <span className="text-gray-600">ETA {formatEta(progress.eta_sec)}</span>
          ) : showIndeterminate ? (
            <span className="text-gray-600">{elapsed}</span>
          ) : null}
          {hasRealProgress ? (
            <span className="text-blue-400">{percent}%</span>
          ) : (
            <span className="text-gray-600">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function progressPropsEqual(prev: TaskProgressBarProps, next: TaskProgressBarProps): boolean {
  if (prev.size !== next.size) return false;
  if (
    prev.task.id !== next.task.id
    || prev.task.status !== next.task.status
    || prev.task.completed_at !== next.task.completed_at
    || prev.task.merge_started_at !== next.task.merge_started_at
  ) {
    return false;
  }
  const p = prev.progress;
  const n = next.progress;
  if (!p && !n) return true;
  if (!p || !n) return false;
  return (
    Math.floor(p.percent) === Math.floor(n.percent)
    && p.stage === n.stage
    && Math.floor(p.time_sec) === Math.floor(n.time_sec)
  );
}

export default React.memo(TaskProgressBarInner, progressPropsEqual);
