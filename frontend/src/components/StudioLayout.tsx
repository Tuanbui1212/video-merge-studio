'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Group, Panel, useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import VideoUploader from '@/components/VideoUploader';
import TaskList from '@/components/TaskList';
import InteractiveTour, { TourStep } from '@/components/InteractiveTour';
import PreviewViewer from '@/components/PreviewViewer';
import TaskSourcePanel from '@/components/TaskSourcePanel';
import TaskTimeline from '@/components/TaskTimeline';
import ResizeSeparator from '@/components/ResizeSeparator';
import { useStudio } from '@/contexts/StudioContext';
import {
  SIDEBAR_DEFAULT_PX,
  STUDIO_H_PANEL_IDS,
  STUDIO_V_PANEL_IDS,
  TASK_PANEL_DEFAULT_PX,
  TIMELINE_DEFAULT_PX,
  studioLayoutStorage,
} from '@/lib/studio-layout-storage';
import { Film, Scissors, Settings, CheckSquare, BookOpen } from 'lucide-react';

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Chào mừng đến Video Studio Pro!',
    body: 'Đây là ứng dụng ghép nhiều video nhỏ thành một video lớn.\n\nTour này sẽ chỉ từng chức năng — bấm "Tiếp theo" để bắt đầu.',
    placement: 'center',
  },
  {
    target: '[data-tour="tab-media"]',
    title: 'Tab Media',
    body: 'Nơi bạn thêm video và bắt đầu ghép. Luôn bắt đầu từ đây.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="import-media"]',
    title: 'Import Media',
    body: 'Kéo thả video vào đây hoặc click để chọn file.\nHỗ trợ MP4, MOV, AVI (tối đa 1GB).',
    placement: 'right',
  },
  {
    target: '[data-tour="media-list"]',
    title: 'Danh sách video',
    body: 'Video bạn chọn sẽ hiện ở đây.\n• Kéo icon ≡ để đổi thứ tự ghép\n• Số 1, 2, 3... = thứ tự trong video cuối\n• Click vào file để xem trước ở Preview Viewer',
    placement: 'right',
  },
  {
    target: '[data-tour="merge-button"]',
    title: 'Upload & Tạo Task',
    body: 'Khi đã sắp xếp xong ít nhất 2 video, bấm nút này để:\n1. Upload từng file lên server\n2. Tạo task PENDING\n3. Tự chuyển sang tab Tasks',
    placement: 'top',
  },
  {
    target: '[data-tour="tab-tasks"]',
    title: 'Tab Tasks',
    body: 'Theo dõi task đã tạo. Task PENDING cần bấm "Bắt đầu ghép" để chạy FFmpeg.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="task-list"]',
    title: 'Lịch sử & trạng thái',
    body: 'Click task để xem chi tiết bên phải:\n• Danh sách video nguồn (click để xem từng file)\n• Video kết quả khi ghép xong',
    placement: 'right',
  },
  {
    target: '[data-tour="preview-viewer"]',
    title: 'Preview Viewer',
    body: 'Xem trước video trước và sau khi ghép.\nClick file ở Media hoặc "Xem trong Preview" ở Tasks.',
    placement: 'left',
  },
  {
    target: '[data-tour="timeline"]',
    title: 'Timeline & FFmpeg Log',
    body: 'Theo dõi tiến độ ghép thật từ FFmpeg:\n• Thanh timeline các video nguồn\n• % thật, tốc độ, ETA\n• Log FFmpeg realtime',
    placement: 'top',
  },
  {
    target: '[data-tour="notifications"]',
    title: 'Thông báo',
    body: 'Mỗi hành động (thêm file, upload, ghép xong, lỗi...) sẽ hiện thông báo ở góc trên bên phải.',
    placement: 'left',
  },
  {
    target: '[data-tour="guide-button"]',
    title: 'Nút Hướng dẫn',
    body: 'Bấm lại bất cứ lúc nào để xem tour này.',
    placement: 'bottom',
  },
  {
    title: 'Sẵn sàng!',
    body: 'Luồng đầy đủ:\nMedia → sắp xếp → Upload & Tạo Task → Tasks → Bắt đầu ghép → Download\n\nChúc bạn ghép video vui vẻ!',
    placement: 'center',
  },
];

function StudioHeader({ onOpenTour }: { onOpenTour: () => void }) {
  return (
    <header className="h-14 border-b border-[#282828] bg-[#181818] flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="bg-blue-600 p-1.5 rounded-md">
          <Scissors className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-sm font-semibold text-gray-100 tracking-wide">Video Studio Pro</h1>
      </div>
      <div className="flex items-center gap-4">
        <button
          data-tour="guide-button"
          onClick={onOpenTour}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-[#282828] hover:bg-[#383838] rounded-md transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Hướng dẫn
        </button>
        <button className="p-1.5 text-gray-400 hover:text-white transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

function StudioSidebar() {
  const { activeTab, setActiveTab } = useStudio();

  return (
    <aside className="h-full flex flex-col bg-[#141414] border-r border-[#282828]">
      <div className="flex border-b border-[#282828] p-2 gap-1 shrink-0">
        <button
          data-tour="tab-media"
          onClick={() => setActiveTab('media')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md flex justify-center items-center gap-2 transition-colors ${activeTab === 'media' ? 'bg-[#282828] text-white' : 'hover:bg-[#282828]/50 text-gray-400'}`}
        >
          <Film className="w-3.5 h-3.5" /> Media
        </button>
        <button
          data-tour="tab-tasks"
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md flex justify-center items-center gap-2 transition-colors ${activeTab === 'tasks' ? 'bg-[#282828] text-white' : 'hover:bg-[#282828]/50 text-gray-400'}`}
        >
          <CheckSquare className="w-3.5 h-3.5" /> Tasks
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-0">
        <div className={activeTab === 'media' ? 'h-full' : 'hidden'}>
          <VideoUploader />
        </div>
        <div className={activeTab === 'tasks' ? 'h-full' : 'hidden'} data-tour="task-list">
          <TaskList />
        </div>
      </div>
    </aside>
  );
}

function PreviewSection() {
  const { previewSrc, previewTitle, previewNonce } = useStudio();
  return (
    <div data-tour="preview-viewer" className="h-full flex flex-col min-h-0">
      <PreviewViewer src={previewSrc} title={previewTitle} reloadKey={previewNonce} />
    </div>
  );
}

/** Layout cố định — dùng lúc SSR / trước hydrate để tránh mismatch với react-resizable-panels */
function StudioStaticWorkspace() {
  const { selectedTask } = useStudio();

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <div className="w-80 shrink-0 h-full min-h-0">
        <StudioSidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#0e0e0e]">
        <div className="flex-1 min-h-0">
          <PreviewSection />
        </div>
        <div className="h-52 shrink-0 min-h-0">
          <TaskTimelineSection />
        </div>
      </div>
      {selectedTask && (
        <div className="w-72 shrink-0 h-full min-h-0">
          <TaskSourcePanel task={selectedTask} />
        </div>
      )}
    </div>
  );
}

function StudioResizableWorkspaceInner() {
  const { selectedTask } = useStudio();
  const taskPanelRef = usePanelRef();

  const mainLayout = useDefaultLayout({
    id: 'studio-h',
    panelIds: [...STUDIO_H_PANEL_IDS],
    storage: studioLayoutStorage,
  });

  const centerLayout = useDefaultLayout({
    id: 'studio-v',
    panelIds: [...STUDIO_V_PANEL_IDS],
    storage: studioLayoutStorage,
  });

  useEffect(() => {
    const panel = taskPanelRef.current;
    if (!panel) return;
    if (selectedTask) {
      if (panel.isCollapsed()) panel.expand();
      if (panel.getSize().asPercentage < 8) panel.resize(`${TASK_PANEL_DEFAULT_PX}px`);
    } else {
      panel.collapse();
    }
  }, [selectedTask, taskPanelRef]);

  return (
    <Group
      id="studio-h"
      orientation="horizontal"
      className="flex-1 min-h-0 min-w-0"
      defaultLayout={mainLayout.defaultLayout}
      onLayoutChanged={mainLayout.onLayoutChanged}
    >
      <Panel
        id="sidebar"
        defaultSize={`${SIDEBAR_DEFAULT_PX}px`}
        minSize="220px"
        maxSize="480px"
        className="min-w-0"
      >
        <StudioSidebar />
      </Panel>

      <ResizeSeparator direction="vertical" />

      <Panel id="center" minSize="35%" className="min-w-0">
        <Group
          id="studio-v"
          orientation="vertical"
          className="h-full min-h-0"
          defaultLayout={centerLayout.defaultLayout}
          onLayoutChanged={centerLayout.onLayoutChanged}
        >
          <Panel id="preview" minSize="30%" defaultSize="75%" className="min-h-0">
            <PreviewSection />
          </Panel>

          <ResizeSeparator direction="horizontal" />

          <Panel
            id="timeline"
            defaultSize={`${TIMELINE_DEFAULT_PX}px`}
            minSize="120px"
            maxSize="65%"
            className="min-h-0"
          >
            <TaskTimelineSection />
          </Panel>
        </Group>
      </Panel>

      <ResizeSeparator direction="vertical" />

      <Panel
        id="task-detail"
        panelRef={taskPanelRef}
        collapsible
        collapsedSize={0}
        defaultSize={0}
        minSize="200px"
        maxSize="420px"
        className="min-w-0"
      >
        {selectedTask ? <TaskSourcePanel task={selectedTask} /> : null}
      </Panel>
    </Group>
  );
}

function StudioResizableWorkspace() {
  const [panelsReady, setPanelsReady] = useState(false);

  useEffect(() => {
    setPanelsReady(true);
  }, []);

  if (!panelsReady) {
    return <StudioStaticWorkspace />;
  }

  return <StudioResizableWorkspaceInner />;
}

function TaskTimelineSection() {
  const { selectedTask } = useStudio();
  return <TaskTimeline task={selectedTask} />;
}

export default function StudioLayout() {
  const { showTour, setShowTour, setActiveTab } = useStudio();

  const tourSteps = useMemo<TourStep[]>(
    () =>
      TOUR_STEPS.map((step) => {
        if (!step.target) return step;
        const tabTarget = step.target;
        if (tabTarget.includes('tab-media') || tabTarget.includes('import-media') || tabTarget.includes('media-list') || tabTarget.includes('merge-button')) {
          return { ...step, onEnter: () => setActiveTab('media') };
        }
        if (tabTarget.includes('tab-tasks') || tabTarget.includes('task-list')) {
          return { ...step, onEnter: () => setActiveTab('tasks') };
        }
        return step;
      }),
    [setActiveTab],
  );

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0e0e0e] text-gray-300 font-sans flex flex-col selection:bg-blue-500/30">
      <StudioHeader onOpenTour={() => setShowTour(true)} />
      <div data-tour="notifications" className="fixed top-16 right-4 w-72 h-10 z-10 pointer-events-none" />
      <main className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        <StudioResizableWorkspace />
      </main>
      <InteractiveTour active={showTour} onClose={() => setShowTour(false)} steps={tourSteps} />
    </div>
  );
}
