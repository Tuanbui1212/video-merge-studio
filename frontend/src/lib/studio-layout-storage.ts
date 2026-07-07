import type { Layout, LayoutStorage } from 'react-resizable-panels';

/** Khớp w-80 sidebar */
export const SIDEBAR_DEFAULT_PX = 320;
/** Khớp w-72 task panel */
export const TASK_PANEL_DEFAULT_PX = 288;
/** Khớp h-52 timeline */
export const TIMELINE_DEFAULT_PX = 208;

export const STUDIO_H_PANEL_IDS = ['sidebar', 'center', 'task-detail'] as const;
export const STUDIO_V_PANEL_IDS = ['preview', 'timeline'] as const;

export const STUDIO_H_FALLBACK: Layout = {
  sidebar: 17,
  center: 83,
  'task-detail': 0,
};

export const STUDIO_V_FALLBACK: Layout = {
  preview: 75,
  timeline: 25,
};

/** Tránh lỗi SSR khi đọc localStorage lúc prerender */
export const studioLayoutStorage: LayoutStorage = {
  getItem(key: string) {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
};
