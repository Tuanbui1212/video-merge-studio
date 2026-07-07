"use client";

import TaskProgressBar from "@/components/TaskProgressBar";
import { useToast } from "@/components/Toast";
import { useStudio, useStudioActions } from "@/contexts/StudioContext";
import {
  useTaskProgress,
  useTaskProgressActions,
} from "@/contexts/TaskProgressContext";
import { api, isAxiosError } from "@/lib/api";
import { API_URL } from "@/lib/config";
import type { TaskProgress, VideoTask } from "@/lib/types";
import { formatDurationSeconds, mergeWallDurationSec } from "@/lib/time-format";
import { outputVideoPlayUrl } from "@/lib/video-url";
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

function parseProgressPayload(data: Record<string, unknown>): TaskProgress {
  return {
    percent: (data.percent as number) ?? 0,
    time_sec: (data.time_sec as number) ?? 0,
    duration_sec: (data.duration_sec as number) ?? 0,
    speed: (data.speed as number) ?? 0,
    fps: (data.fps as number) ?? 0,
    bitrate_kbps: (data.bitrate_kbps as number) ?? 0,
    eta_sec: (data.eta_sec as number | null) ?? null,
    stage: (data.stage as TaskProgress["stage"]) ?? "encoding",
    log_lines: (data.log_lines as string[]) ?? [],
    source_durations: (data.source_durations as number[]) ?? [],
    output_width: (data.output_width as number) ?? 0,
    output_height: (data.output_height as number) ?? 0,
    output_preset: (data.output_preset as string) ?? '',
  };
}

interface TaskListItemProps {
  task: VideoTask;
  isSelected: boolean;
  onSelect: (task: VideoTask) => void;
  onStartMerge?: (task: VideoTask) => void;
  isStartingMerge?: boolean;
}

const TaskListItem = React.memo(function TaskListItem({
  task,
  isSelected,
  onSelect,
  onStartMerge,
  isStartingMerge,
}: TaskListItemProps) {
  const progress = useTaskProgress(
    task.status === "pending" || task.status === "processing" ? task.id : null,
  );

  return (
    <div
      onClick={() => onSelect(task)}
      className={`p-3 rounded-md flex flex-col gap-1 shrink-0 cursor-pointer transition-all
        ${
          isSelected
            ? "bg-[#1e2a3a] border-2 border-blue-500 shadow-lg shadow-blue-900/20"
            : "bg-[#181818] border border-[#282828] hover:border-[#404040]"
        }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-gray-400 bg-[#282828] px-1.5 py-0.5 rounded">
            #{task.id}
          </span>
          <span className="text-[10px] text-gray-500">
            {task.source_videos.length} video
          </span>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={task.status} />
          <ChevronRight
            className={`w-3 h-3 text-gray-600 transition-transform ${isSelected ? "rotate-90 text-blue-400" : ""}`}
          />
        </div>
      </div>

      {(task.status === "pending" || task.status === "processing") && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          {task.status === "pending" ? (
            <button
              type="button"
              onClick={() => onStartMerge?.(task)}
              disabled={isStartingMerge}
              className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-[10px] font-medium transition-colors"
            >
              {isStartingMerge ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3 fill-current" />
              )}
              Bắt đầu ghép
            </button>
          ) : (
            <TaskProgressBar task={task} progress={progress} />
          )}
        </div>
      )}

      {isSelected && (
        <p className="text-[10px] text-blue-400/80">
          Chi tiết video → bên phải
        </p>
      )}
      {!isSelected && task.status === "completed" && (
        <p className="text-[10px] text-green-500/80">
          {(() => {
            const d = mergeWallDurationSec(task);
            return d != null
              ? `Ghép ${formatDurationSeconds(d)} · Click xem →`
              : "Click để xem →";
          })()}
        </p>
      )}
    </div>
  );
});

function StatusBadge({ status }: { status: VideoTask["status"] }) {
  switch (status) {
    case "completed":
      return (
        <span className="flex items-center gap-1 text-green-500 text-[10px] font-medium">
          <CheckCircle className="w-3 h-3" /> Xong
        </span>
      );
    case "processing":
      return (
        <span className="flex items-center gap-1 text-blue-500 text-[10px] font-medium">
          <Loader2 className="w-3 h-3 animate-spin" /> Đang ghép
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-red-500 text-[10px] font-medium">
          <AlertCircle className="w-3 h-3" /> Lỗi
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-gray-500 text-[10px] font-medium">
          <Clock className="w-3 h-3" /> Chờ
        </span>
      );
  }
}

type TaskLoadState = "loading" | "ready" | "error";

function TaskListInner() {
  const { showToast } = useToast();
  const { focusTaskId, activeTab } = useStudio();
  const { setPreview, setSelectedTask } = useStudioActions();
  const { updateProgress } = useTaskProgressActions();

  const tasksTabActive = activeTab === "tasks";

  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [loadState, setLoadState] = useState<TaskLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [startingMergeId, setStartingMergeId] = useState<number | null>(null);
  const prevStatusRef = useRef<Record<number, string>>({});
  const hasLoadedOnceRef = useRef(false);
  const handleTaskUpdateRef = useRef<
    (data: {
      task_id: number;
      status: string;
      output_filename?: string;
      error_message?: string;
      completed_at?: string;
    }) => void
  >(() => {});
  const handleTaskProgressRef = useRef<(data: Record<string, unknown>) => void>(
    () => {},
  );
  const wsConnectedRef = useRef(false);

  const fetchTasks = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent && !hasLoadedOnceRef.current) {
        setLoadState("loading");
        setErrorMessage(null);
      }

      try {
        const res = await api.get<VideoTask[]>("/tasks", { timeout: 15_000 });
        setTasks(res.data);
        res.data.forEach((t) => {
          if (t.progress) updateProgress(t.id, t.progress);
        });
        setLoadState("ready");
        setErrorMessage(null);
        hasLoadedOnceRef.current = true;
        return res.data;
      } catch (err) {
        console.error("Error fetching tasks", err);
        const msg = isAxiosError(err)
          ? err.code === "ECONNABORTED"
            ? "Backend không phản hồi (timeout). FFmpeg đang chạy có thể làm API chậm tạm thời."
            : (err.response?.data as { detail?: string })?.detail || err.message
          : "Không tải được danh sách task.";
        if (!silent || !hasLoadedOnceRef.current) {
          setLoadState("error");
          setErrorMessage(msg);
        }
        return [];
      }
    },
    [updateProgress],
  );

  const previewTask = useCallback(
    (task: VideoTask) => {
      if (task.status === "completed" && task.output_filename) {
        setPreview(
          outputVideoPlayUrl(task.output_filename),
          task.output_filename,
        );
      }
    },
    [setPreview],
  );

  const selectTask = useCallback(
    (task: VideoTask) => {
      setSelectedId(task.id);
      setSelectedTask(task);
    },
    [setSelectedTask],
  );

  const handleTaskUpdate = useCallback(
    (data: {
      task_id: number;
      status: string;
      output_filename?: string;
      error_message?: string;
      completed_at?: string;
    }) => {
      const prevStatus = prevStatusRef.current[data.task_id];

      if (data.status === "completed" && prevStatus !== "completed") {
        showToast(
          "success",
          `Task #${data.task_id} ghép xong! Xem kết quả bên phải.`,
        );
      } else if (data.status === "failed" && prevStatus !== "failed") {
        showToast(
          "error",
          `Task #${data.task_id} thất bại: ${data.error_message || "Lỗi không xác định"}`,
        );
      } else if (data.status === "processing" && prevStatus !== "processing") {
        showToast("info", `Task #${data.task_id} đang ghép bằng FFmpeg...`);
      }

      prevStatusRef.current[data.task_id] = data.status;

      setTasks((prevTasks) => {
        const taskExists = prevTasks.some((t) => t.id === data.task_id);
        if (taskExists) {
          return prevTasks.map((t) =>
            t.id === data.task_id
              ? {
                  ...t,
                  status: data.status as VideoTask["status"],
                  output_filename: data.output_filename ?? t.output_filename,
                  error_message: data.error_message ?? t.error_message,
                  completed_at: data.completed_at ?? t.completed_at,
                }
              : t,
          );
        }
        void (async () => {
          try {
            await fetchTasks({ silent: true });
          } catch (err) {
            console.error("Failed to refresh tasks after update", err);
          }
        })();
        return prevTasks;
      });
    },
    [fetchTasks, showToast],
  );

  handleTaskUpdateRef.current = handleTaskUpdate;

  const handleTaskProgress = useCallback(
    (data: Record<string, unknown>) => {
      const taskId = data.task_id as number;
      if (!taskId) return;
      updateProgress(taskId, parseProgressPayload(data));
    },
    [updateProgress],
  );

  handleTaskProgressRef.current = handleTaskProgress;

  const hasProcessing = useMemo(
    () => tasks.some((t) => t.status === "processing"),
    [tasks],
  );

  useEffect(() => {
    if (!tasksTabActive) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await fetchTasks();
        if (cancelled) return;
        list.forEach((t) => {
          prevStatusRef.current[t.id] = t.status;
        });
        if (focusTaskId) {
          const task = list.find((t) => t.id === focusTaskId);
          if (task) selectTask(task);
        }
      } catch (err) {
        console.error("Failed to load tasks", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tasksTabActive, fetchTasks, focusTaskId, selectTask]);

  useEffect(() => {
    if (!tasksTabActive) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(API_URL.replace(/^http/, "ws") + "/ws/tasks");

      ws.onopen = () => {
        wsConnectedRef.current = true;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "task_update") handleTaskUpdateRef.current(data);
          else if (data.type === "task_progress")
            handleTaskProgressRef.current(data);
        } catch (err) {
          console.error("WS parse error", err);
        }
      };

      ws.onclose = () => {
        wsConnectedRef.current = false;
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => {
        wsConnectedRef.current = false;
      };
    };

    connect();

    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, 25_000);

    return () => {
      cancelled = true;
      wsConnectedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      ws?.close();
    };
  }, [tasksTabActive]);

  useEffect(() => {
    if (!tasksTabActive || !hasProcessing) return;

    const interval = setInterval(() => {
      if (wsConnectedRef.current) return;

      void (async () => {
        try {
          const list = await fetchTasks({ silent: true });
          list.forEach((t) => {
            const prev = prevStatusRef.current[t.id];
            if (prev && prev !== t.status) {
              handleTaskUpdateRef.current({
                task_id: t.id,
                status: t.status,
                output_filename: t.output_filename ?? undefined,
                error_message: t.error_message ?? undefined,
                completed_at: t.completed_at ?? undefined,
              });
            }
            prevStatusRef.current[t.id] = t.status;
          });
        } catch (err) {
          console.error("Failed to poll tasks", err);
        }
      })();
    }, 10_000);

    return () => clearInterval(interval);
  }, [tasksTabActive, hasProcessing, fetchTasks]);

  useEffect(() => {
    if (!selectedId) return;
    const task = tasks.find((t) => t.id === selectedId);
    if (task) setSelectedTask(task);
    if (task?.status === "completed") previewTask(task);
  }, [tasks, selectedId, setSelectedTask, previewTask]);

  const startTaskMerge = useCallback(
    async (task: VideoTask) => {
      setStartingMergeId(task.id);
      try {
        const res = await api.post<VideoTask>(`/tasks/${task.id}/merge`);
        const updated = res.data;
        showToast(
          "success",
          `Task #${task.id} đang ghép — theo dõi tiến độ bên dưới.`,
        );
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? updated : t)),
        );
        prevStatusRef.current[task.id] = "processing";
        selectTask(updated);
      } catch (err) {
        console.error("Failed to start merge", err);
        const msg = isAxiosError(err)
          ? (err.response?.data as { detail?: string })?.detail || err.message
          : "Không thể bắt đầu ghép video.";
        showToast("error", msg);
      } finally {
        setStartingMergeId(null);
      }
    },
    [showToast, selectTask],
  );

  const handleSelect = useCallback(
    (task: VideoTask) => {
      selectTask(task);
      if (task.status === "completed") previewTask(task);
    },
    [selectTask, previewTask],
  );

  const activeCount = useMemo(
    () => tasks.filter((t) => t.status === "processing").length,
    [tasks],
  );

  const pendingCount = useMemo(
    () => tasks.filter((t) => t.status === "pending").length,
    [tasks],
  );

  if (loadState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
        <p className="text-xs font-medium">Đang tải danh sách task...</p>
        <p className="text-[10px] text-gray-600">Kết nối backend...</p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <div className="space-y-1">
          <p className="text-xs font-medium text-red-300">
            Không tải được task
          </p>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            {errorMessage}
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await fetchTasks();
            } catch (err) {
              console.error("Failed to retry loading tasks", err);
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-gray-200 bg-[#282828] hover:bg-[#383838] rounded-md transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Thử lại
        </button>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
        <Inbox className="w-8 h-8 text-gray-600" />
        <p className="text-xs font-medium text-gray-400">Chưa có task nào</p>
        <p className="text-[10px] text-gray-600 leading-relaxed">
          Thêm video ở tab Media, bấm Upload & Tạo Task.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {pendingCount > 0 && (
        <div className="p-2.5 rounded-md bg-amber-950/30 border border-amber-500/30 text-[10px] text-amber-200 leading-relaxed shrink-0">
          {pendingCount} task chờ ghép — bấm{" "}
          <strong className="font-semibold">Bắt đầu ghép</strong> để chạy
          FFmpeg.
        </div>
      )}
      {activeCount > 0 && (
        <div className="p-2.5 rounded-md bg-blue-950/40 border border-blue-500/30 text-[10px] text-blue-300 leading-relaxed shrink-0">
          <Loader2 className="w-3 h-3 inline animate-spin mr-1 -mt-0.5" />
          {activeCount} task đang ghép. Kết quả hiện bên phải khi xong.
        </div>
      )}

      <div className="flex-1 space-y-2 custom-scrollbar overflow-y-auto min-h-0">
        {tasks.map((task) => (
          <TaskListItem
            key={task.id}
            task={task}
            isSelected={selectedId === task.id}
            onSelect={handleSelect}
            onStartMerge={startTaskMerge}
            isStartingMerge={startingMergeId === task.id}
          />
        ))}
      </div>
    </div>
  );
}

export default React.memo(TaskListInner);
