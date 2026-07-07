"use client";

import TaskMergeSettings from "@/components/TaskMergeSettings";
import TaskProgressBar from "@/components/TaskProgressBar";
import { useToast } from "@/components/Toast";
import { useStudioActions } from "@/contexts/StudioContext";
import { useTaskProgress } from "@/contexts/TaskProgressContext";
import { api, isAxiosError } from "@/lib/api";
import {
  formatDurationSeconds,
  formatVideoClock,
  mergeWallDurationSec,
  outputContentDurationSec,
} from "@/lib/time-format";
import { formatResolutionLine } from "@/lib/resolution";
import type { TaskMergeInfo } from "@/lib/resolution";
import type { VideoTask } from "@/lib/types";
import {
  outputVideoDownloadUrl,
  outputVideoPlayUrl,
  sourceVideoPreviewUrl,
} from "@/lib/video-url";
import {
  AlertCircle,
  CheckCircle,
  Download,
  Eye,
  Film,
  Layers,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";
import React, { useCallback } from "react";

interface TaskSourcePanelProps {
  task: VideoTask;
}

function TaskSourcePanelInner({ task }: TaskSourcePanelProps) {
  const { setPreview, clearSelectedTask, setSelectedTask } = useStudioActions();
  const progress = useTaskProgress(task.id);
  const { showToast } = useToast();
  const [isStarting, setIsStarting] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);
  const [outputPreset, setOutputPreset] = React.useState("source");
  const [mergeInfo, setMergeInfo] = React.useState<TaskMergeInfo | null>(null);
  const [mergeInfoLoading, setMergeInfoLoading] = React.useState(false);

  const canConfigureMerge = task.status === "pending" || task.status === "failed";

  React.useEffect(() => {
    if (!canConfigureMerge) {
      setMergeInfo(null);
      return;
    }
    let cancelled = false;
    setMergeInfoLoading(true);
    void api
      .get<TaskMergeInfo>(`/tasks/${task.id}/merge-info`)
      .then((res) => {
        if (cancelled) return;
        setMergeInfo(res.data);
        setOutputPreset((prev) =>
          res.data.output_options.some((o) => o.id === prev)
            ? prev
            : res.data.default_preset,
        );
      })
      .catch(() => {
        if (!cancelled) setMergeInfo(null);
      })
      .finally(() => {
        if (!cancelled) setMergeInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task.id, canConfigureMerge]);

  const sourceResolutionMap = React.useMemo(() => {
    const map = new Map<number, { width: number; height: number; label: string }>();
    mergeInfo?.sources.forEach((s) => {
      if (s.width && s.height) {
        map.set(s.id, {
          width: s.width,
          height: s.height,
          label: s.resolution_label ?? `${s.width}×${s.height}`,
        });
      }
    });
    return map;
  }, [mergeInfo]);

  const startMerge = useCallback(async () => {
    setIsStarting(true);
    try {
      const res = await api.post<VideoTask>(`/tasks/${task.id}/merge`, {
        output_preset: outputPreset,
      });
      showToast("success", `Đã bắt đầu ghép task #${task.id}`);
      setSelectedTask(res.data);
    } catch (err: unknown) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { detail?: string })?.detail || err.message
        : "Lỗi khi bắt đầu ghép video.";
      showToast("error", msg);
    } finally {
      setIsStarting(false);
    }
  }, [task, setSelectedTask, showToast, outputPreset]);

  const resetTask = useCallback(async () => {
    setIsResetting(true);
    try {
      const res = await api.post<VideoTask>(`/tasks/${task.id}/reset`);
      showToast("info", `Task #${task.id} đã đặt lại — có thể ghép lại.`);
      setSelectedTask(res.data);
    } catch (err: unknown) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { detail?: string })?.detail || err.message
        : "Không đặt lại được task.";
      showToast("error", msg);
    } finally {
      setIsResetting(false);
    }
  }, [task.id, setSelectedTask, showToast]);

  const previewSource = useCallback(
    (video: { id: number; filename: string }) => {
      setPreview(sourceVideoPreviewUrl(video.id), video.filename);
    },
    [setPreview],
  );

  const previewOutput = useCallback(() => {
    if (task.output_filename) {
      setPreview(
        outputVideoPlayUrl(task.output_filename),
        task.output_filename,
      );
    }
  }, [setPreview, task.output_filename]);

  const mergeDuration = mergeWallDurationSec(task);
  const contentDuration = outputContentDurationSec(progress);

  const activeOutputLabel = React.useMemo(() => {
    if (task.status === "completed" && task.output_resolution_label) {
      return task.output_resolution_label;
    }
    if (progress?.output_width && progress?.output_height) {
      return formatResolutionLine(progress.output_width, progress.output_height);
    }
    return null;
  }, [task.status, task.output_resolution_label, progress?.output_width, progress?.output_height]);

  return (
    <aside className="h-full w-full flex flex-col bg-[#141414] border-l border-[#282828]">
      <div className="px-4 py-3 border-b border-[#282828] shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-semibold text-gray-100">
              Task #{task.id}
            </h2>
          </div>
          <button
            onClick={clearSelectedTask}
            className="text-[10px] text-gray-500 hover:text-gray-300"
          >
            Đóng
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">
          Tạo: {new Date(task.created_at).toLocaleString("vi-VN")}
        </p>
        {task.merge_started_at && (
          <p className="text-[10px] text-gray-500">
            Bắt đầu ghép:{" "}
            {new Date(task.merge_started_at).toLocaleString("vi-VN")}
          </p>
        )}
        {task.completed_at && (
          <p className="text-[10px] text-gray-500">
            Hoàn thành: {new Date(task.completed_at).toLocaleString("vi-VN")}
          </p>
        )}
        {mergeDuration != null && task.status === "completed" && (
          <p className="text-[10px] text-green-400/90 mt-1">
            Thời gian ghép: {formatDurationSeconds(mergeDuration)}
          </p>
        )}
        {contentDuration != null && task.status === "completed" && (
          <p className="text-[10px] text-gray-500">
            Độ dài video: {formatVideoClock(contentDuration)} (
            {formatDurationSeconds(contentDuration)})
          </p>
        )}
        {activeOutputLabel && (
          <p className="text-[10px] text-violet-300/90">
            Độ phân giải đầu ra: {activeOutputLabel}
          </p>
        )}
        <div className="mt-2">{statusBadge(task.status)}</div>
        {(task.status === "pending" ||
          task.status === "processing" ||
          task.status === "completed") && (
          <div className="mt-3">
            <TaskProgressBar task={task} progress={progress} size="md" />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Video nguồn ({task.source_videos.length})
          </p>
          {task.source_videos.length === 0 ? (
            <p className="text-[10px] text-gray-600 leading-relaxed">
              Không có dữ liệu nguồn (task tạo trước khi cập nhật tính năng
              này).
            </p>
          ) : (
            <div className="space-y-1.5">
              {task.source_videos.map((video) => {
                const res = sourceResolutionMap.get(video.id);
                return (
                <button
                  key={video.id}
                  onClick={() => previewSource(video)}
                  className="w-full flex items-center gap-2 p-2 rounded-md bg-[#181818] border border-[#282828] hover:border-blue-500/40 hover:bg-[#1e2a3a] transition-colors text-left group"
                >
                  <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded bg-[#282828] text-[10px] font-mono text-blue-400">
                    {video.position + 1}
                  </span>
                  <Film className="w-3.5 h-3.5 text-gray-500 shrink-0 group-hover:text-blue-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-gray-300 truncate">
                      {video.filename}
                    </p>
                    <p className="text-[9px] text-gray-600">
                      {res
                        ? `${res.width}×${res.height} (${res.label}) · Click để xem`
                        : "Click để xem"}
                    </p>
                  </div>
                  <Play className="w-3 h-3 text-gray-600 group-hover:text-blue-400 shrink-0" />
                </button>
              );
              })}
            </div>
          )}
        </div>

        {task.status === "completed" && task.output_filename && (
          <div>
            <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-2">
              Video kết quả
            </p>
            <div className="p-2.5 rounded-md bg-green-950/30 border border-green-500/30 space-y-2">
              <p className="text-[11px] text-gray-200 truncate flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                {task.output_filename}
              </p>
              <button
                onClick={previewOutput}
                className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-medium transition-colors"
              >
                <Eye className="w-3 h-3" />
                Xem kết quả ghép
              </button>
              <a
                href={outputVideoDownloadUrl(task.output_filename)}
                className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-[#282828] hover:bg-[#383838] text-gray-300 rounded text-[10px] font-medium transition-colors"
                download
              >
                <Download className="w-3 h-3" />
                Tải về
              </a>
            </div>
          </div>
        )}

        {task.status === "pending" && (
          <div>
            <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-2">
              Hành động
            </p>
            <div className="p-2.5 rounded-md bg-blue-950/30 border border-blue-500/30 space-y-2">
              <TaskMergeSettings
                mergeInfo={mergeInfo}
                loading={mergeInfoLoading}
                selectedPreset={outputPreset}
                onPresetChange={setOutputPreset}
              />
              <button
                onClick={startMerge}
                disabled={isStarting}
                className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-medium transition-colors disabled:opacity-50"
              >
                {isStarting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                Bắt đầu ghép video
              </button>
            </div>
          </div>
        )}

        {task.status === "processing" && (
          <div className="p-2.5 rounded-md bg-blue-950/30 border border-blue-500/30 space-y-2">
            <p className="text-[10px] text-blue-300">
              FFmpeg đang ghép {task.source_videos.length} video.
              {progress && progress.percent > 0
                ? ` Tiến độ thật: ${Math.round(progress.percent)}% — xem log ở Timeline phía dưới.`
                : " Xem timeline & log FFmpeg phía dưới màn hình."}
            </p>
            <button
              onClick={resetTask}
              disabled={isResetting}
              className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-[#282828] hover:bg-[#383838] text-amber-300 rounded text-[10px] font-medium transition-colors disabled:opacity-50"
            >
              {isResetting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
              Đặt lại task (nếu kẹt sau restart)
            </button>
          </div>
        )}

        {task.status === "failed" && (
          <div className="p-2.5 rounded-md bg-red-950/30 border border-red-500/30 space-y-2">
            {task.error_message && (
              <p className="text-[10px] text-red-400 font-mono break-words">
                {task.error_message}
              </p>
            )}
            <TaskMergeSettings
              mergeInfo={mergeInfo}
              loading={mergeInfoLoading}
              selectedPreset={outputPreset}
              onPresetChange={setOutputPreset}
            />
            <button
              onClick={startMerge}
              disabled={isStarting}
              className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-medium transition-colors disabled:opacity-50"
            >
              {isStarting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              Ghép lại
            </button>
            <button
              onClick={resetTask}
              disabled={isResetting}
              className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-[#282828] hover:bg-[#383838] text-gray-300 rounded text-[10px] font-medium transition-colors disabled:opacity-50"
            >
              {isResetting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
              Đặt lại về chờ
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function statusBadge(status: VideoTask["status"]) {
  switch (status) {
    case "completed":
      return (
        <span className="text-[10px] text-green-500 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" /> Hoàn thành
        </span>
      );
    case "processing":
      return (
        <span className="text-[10px] text-blue-500 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Đang ghép
        </span>
      );
    case "failed":
      return (
        <span className="text-[10px] text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Lỗi
        </span>
      );
    default:
      return <span className="text-[10px] text-gray-500">Đang chờ</span>;
  }
}

export default React.memo(TaskSourcePanelInner);
