'use client';

import { ToastProvider } from '@/components/Toast';
import { StudioProvider } from '@/contexts/StudioContext';
import { TaskProgressProvider } from '@/contexts/TaskProgressContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <TaskProgressProvider>
        <StudioProvider>{children}</StudioProvider>
      </TaskProgressProvider>
    </ToastProvider>
  );
}
