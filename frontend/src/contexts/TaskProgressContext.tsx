'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { TaskProgress } from '@/lib/types';

type Listener = () => void;

function shouldSkipProgressUpdate(prev: TaskProgress | undefined, next: TaskProgress): boolean {
  if (!prev) return false;
  if (prev.stage !== next.stage) return false;
  if (prev.log_lines.length !== next.log_lines.length) return false;
  if (Math.floor(prev.percent) !== Math.floor(next.percent)) return false;
  if (Math.abs(prev.time_sec - next.time_sec) >= 2) return false;
  return true;
}

class TaskProgressStore {
  private data = new Map<number, TaskProgress>();
  private listeners = new Map<number, Set<Listener>>();

  subscribe = (taskId: number, listener: Listener): (() => void) => {
    if (!this.listeners.has(taskId)) this.listeners.set(taskId, new Set());
    this.listeners.get(taskId)!.add(listener);
    return () => this.listeners.get(taskId)?.delete(listener);
  };

  getSnapshot = (taskId: number): TaskProgress | null => this.data.get(taskId) ?? null;

  update = (taskId: number, progress: TaskProgress): void => {
    const prev = this.data.get(taskId);
    if (shouldSkipProgressUpdate(prev, progress)) return;
    this.data.set(taskId, progress);
    this.listeners.get(taskId)?.forEach((l) => l());
  };
}

const TaskProgressStoreContext = createContext<TaskProgressStore | null>(null);

export function TaskProgressProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<TaskProgressStore | null>(null);
  if (!storeRef.current) storeRef.current = new TaskProgressStore();

  return (
    <TaskProgressStoreContext.Provider value={storeRef.current}>
      {children}
    </TaskProgressStoreContext.Provider>
  );
}

function useStore(): TaskProgressStore {
  const store = useContext(TaskProgressStoreContext);
  if (!store) throw new Error('useTaskProgress must be used within TaskProgressProvider');
  return store;
}

export function useTaskProgress(taskId: number | null | undefined): TaskProgress | null {
  const store = useStore();
  return useSyncExternalStore(
    (onStoreChange) => (taskId ? store.subscribe(taskId, onStoreChange) : () => {}),
    () => (taskId ? store.getSnapshot(taskId) : null),
    () => null,
  );
}

export function useTaskProgressActions() {
  const store = useStore();
  const updateProgress = useCallback(
    (taskId: number, progress: TaskProgress) => store.update(taskId, progress),
    [store],
  );
  return useMemo(() => ({ updateProgress }), [updateProgress]);
}
