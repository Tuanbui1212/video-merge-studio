'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { VideoTask } from '@/lib/types';

export type StudioTab = 'media' | 'tasks';

interface StudioContextValue {
  activeTab: StudioTab;
  showTour: boolean;
  previewSrc: string | null;
  previewTitle: string | null;
  /** Tăng mỗi lần chọn preview — buộc player remount kể cả cùng blob URL */
  previewNonce: number;
  focusTaskId: number | null;
  selectedTask: VideoTask | null;
  setActiveTab: (tab: StudioTab) => void;
  setShowTour: (show: boolean) => void;
  setPreview: (src: string | null, title: string | null) => void;
  setSelectedTask: (task: VideoTask | null) => void;
  setFocusTaskId: (id: number | null) => void;
  onMergeStarted: (taskId: number) => void;
  clearSelectedTask: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<StudioTab>('media');
  const [showTour, setShowTour] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [focusTaskId, setFocusTaskId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<VideoTask | null>(null);

  const setPreview = useCallback((src: string | null, title: string | null) => {
    // Không revoke blob: ở đây — VideoUploader giữ objectUrl cho từng file.
    setPreviewSrc(src);
    setPreviewTitle(title);
    setPreviewNonce((n) => n + 1);
  }, []);

  const onMergeStarted = useCallback((taskId: number) => {
    setFocusTaskId(taskId);
    setActiveTab('tasks');
  }, []);

  const clearSelectedTask = useCallback(() => setSelectedTask(null), []);

  const value = useMemo<StudioContextValue>(
    () => ({
      activeTab,
      showTour,
      previewSrc,
      previewTitle,
      previewNonce,
      focusTaskId,
      selectedTask,
      setActiveTab,
      setShowTour,
      setPreview,
      setSelectedTask,
      setFocusTaskId,
      onMergeStarted,
      clearSelectedTask,
    }),
    [
      activeTab,
      showTour,
      previewSrc,
      previewTitle,
      previewNonce,
      focusTaskId,
      selectedTask,
      setPreview,
      onMergeStarted,
      clearSelectedTask,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used within StudioProvider');
  return ctx;
}

/** Chỉ lấy actions — tránh re-render khi state đổi */
export function useStudioActions() {
  const {
    setActiveTab,
    setShowTour,
    setPreview,
    setSelectedTask,
    setFocusTaskId,
    onMergeStarted,
    clearSelectedTask,
  } = useStudio();
  return useMemo(
    () => ({
      setActiveTab,
      setShowTour,
      setPreview,
      setSelectedTask,
      setFocusTaskId,
      onMergeStarted,
      clearSelectedTask,
    }),
    [setActiveTab, setShowTour, setPreview, setSelectedTask, setFocusTaskId, onMergeStarted, clearSelectedTask],
  );
}
