'use client';

import React, { useState, useCallback, memo, useRef, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { api, isAxiosError } from '@/lib/api';
import { Plus, Film, X, Loader2, Play, CheckCircle, GripVertical, RotateCcw } from 'lucide-react';
import { sourceVideoPreviewUrl } from '@/lib/video-url';
import { useToast } from '@/components/Toast';
import { useStudioActions } from '@/contexts/StudioContext';

type UploadStatus = 'pending_upload' | 'uploading' | 'uploaded' | 'failed';
type PreviewStatus = 'native' | 'loading' | 'ready' | 'failed';

interface FileItem {
  id: string;
  file: File;
  status: UploadStatus;
  videoId: number | null;
  objectUrl: string;
  previewUrl: string | null;
  previewStatus: PreviewStatus;
  videoCodec: string | null;
  transcodeChecked: boolean;
}

interface VideoUploaderProps {
  onMergeStarted?: (taskId: number) => void;
  onPreview?: (src: string | null, title: string | null) => void;
}

function playbackUrl(item: FileItem): string {
  // Trước upload: luôn xem bằng blob local. Server preview chỉ khi đã có videoId.
  if (item.videoId && item.previewStatus === 'ready' && item.previewUrl) {
    return item.previewUrl;
  }
  return item.objectUrl;
}

function createItem(file: File): FileItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    status: 'pending_upload',
    videoId: null,
    objectUrl: URL.createObjectURL(file),
    previewUrl: null,
    previewStatus: 'native',
    videoCodec: null,
    transcodeChecked: false,
  };
}

type SubmitPhase = 'idle' | 'uploading' | 'creating-task';

function VideoUploaderInner({ onMergeStarted, onPreview }: VideoUploaderProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<FileItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const previewInFlightRef = useRef<Set<string>>(new Set());
  const itemsRef = useRef<FileItem[]>(items);
  itemsRef.current = items;

  const uploadSingleItem = useCallback(async (itemId: string, file: File): Promise<number> => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: 'uploading' as const, videoId: null } : i)),
    );
    setUploadProgress((prev) => ({ ...prev, [itemId]: 0 }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<{ id: number }>('/upload', formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress((prev) => ({ ...prev, [itemId]: percent }));
          }
        },
      });

      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, status: 'uploaded' as const, videoId: res.data.id } : i,
        ),
      );
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      return res.data.id;
    } catch (err) {
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, status: 'failed' as const } : i)),
      );
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      throw err;
    }
  }, []);

  const requestServerPreview = useCallback(async (item: FileItem) => {
    if (!item.videoId) return;
    if (previewInFlightRef.current.has(item.id)) return;
    previewInFlightRef.current.add(item.id);

    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, previewStatus: 'loading' as const } : i)),
    );

    try {
      const streamUrl = sourceVideoPreviewUrl(item.videoId);
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                previewUrl: streamUrl,
                previewStatus: 'ready' as const,
                videoCodec: 'hevc',
                transcodeChecked: true,
              }
            : i,
        ),
      );
      if (selectedIdRef.current === item.id) {
        onPreview?.(streamUrl, item.file.name);
        showToast('info', 'Video HEVC — server đang chuyển H.264 để xem trong trình duyệt.');
      }
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, previewStatus: 'failed' as const, transcodeChecked: true } : i,
        ),
      );
      if (selectedIdRef.current === item.id) {
        showToast('error', 'Không tạo được preview H.264. Vẫn có thể ghép video bình thường.');
      }
    } finally {
      previewInFlightRef.current.delete(item.id);
    }
  }, [onPreview, showToast]);

  const selectFile = useCallback((index: number) => {
    const item = itemsRef.current[index];
    if (!item) return;
    setSelectedIndex(index);
    selectedIdRef.current = item.id;
    onPreview?.(playbackUrl(item), item.file.name);
    if (item.videoId) {
      void (async () => {
        try {
          if (item.previewStatus === 'failed' || item.previewStatus === 'native') {
            await requestServerPreview(item);
          }
        } catch (err) {
          console.error('Failed to ensure server preview', err);
        }
      })();
    }
  }, [onPreview, requestServerPreview]);

  const moveItem = useCallback((from: number, to: number) => {
    if (from === to) return;
    setItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
    setSelectedIndex((prev) => {
      if (prev === null) return null;
      if (prev === from) return to;
      if (from < prev && to >= prev) return prev - 1;
      if (from > prev && to <= prev) return prev + 1;
      return prev;
    });
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newItems = acceptedFiles.map(createItem);
    setItems((prev) => {
      const firstNewIndex = prev.length;
      if (newItems.length > 0) {
        const first = newItems[0];
        queueMicrotask(() => {
          setSelectedIndex(firstNewIndex);
          selectedIdRef.current = first.id;
          onPreview?.(first.objectUrl, first.file.name);
        });
      }
      return [...prev, ...newItems];
    });
    setError(null);
    showToast('success', `Đã thêm ${acceptedFiles.length} video — sắp xếp thứ tự rồi bấm Upload & Tạo Task.`);
  }, [onPreview, showToast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: (fileRejections) => {
      const names = fileRejections.map((f) => f.file.name).join(', ');
      const msg = `File không hợp lệ: ${names}. Dùng MP4, MOV, AVI (tối đa 1GB).`;
      setError(msg);
      showToast('error', msg);
    },
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
      'video/mp4': ['.mp4'],
      'video/quicktime': ['.mov'],
    },
    maxSize: 1024 * 1024 * 1024,
    noClick: false,
    noKeyboard: false,
  });

  const removeFile = (index: number) => {
    setItems((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.objectUrl);
      return prev.filter((_, i) => i !== index);
    });
    setSelectedIndex((prev) => {
      if (prev === null) return null;
      if (prev === index) {
        selectedIdRef.current = null;
        onPreview?.(null, null);
        return null;
      }
      if (prev > index) return prev - 1;
      return prev;
    });
  };

  const retryUpload = async (index: number) => {
    const item = items[index];
    if (!item) return;
    try {
      await uploadSingleItem(item.id, item.file);
    } catch (err) {
      console.error('Failed to retry upload', err);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isSubmitting) {
      e.preventDefault();
      return;
    }
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (isSubmitting) return;
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (isSubmitting || dragIndex === null) return;
    moveItem(dragIndex, index);
    if (dragIndex !== index) {
      showToast('info', `Đã chuyển "${items[dragIndex]?.file.name}" sang vị trí ${index + 1}`);
    }
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const canSubmit = items.length >= 2 && !isSubmitting;

  const submitButtonLabel = useMemo(() => {
    if (isSubmitting && submitPhase === 'uploading') return 'Đang upload lên server...';
    if (isSubmitting && submitPhase === 'creating-task') return 'Đang tạo task...';
    if (items.length < 2) return `Upload & Tạo Task (cần ${2 - items.length} video nữa)`;
    return 'Upload & Tạo Task';
  }, [isSubmitting, submitPhase, items.length]);

  const uploadAndCreateTask = async () => {
    if (items.length < 2) {
      showToast('error', 'Cần ít nhất 2 video để tạo task.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    let phase: SubmitPhase = 'uploading';
    setSubmitPhase(phase);

    try {
      const videoIds: number[] = [];
      for (const item of items) {
        try {
          const videoId = await uploadSingleItem(item.id, item.file);
          videoIds.push(videoId);
        } catch (err) {
          const msg = isAxiosError(err)
            ? (err.response?.data as { detail?: string })?.detail || err.message
            : 'Upload thất bại';
          showToast('error', `${item.file.name}: ${msg}`);
          throw err;
        }
      }

      phase = 'creating-task';
      setSubmitPhase(phase);
      const taskRes = await api.post<{ id: number }>('/tasks', { video_ids: videoIds });

      showToast('success', `Task #${taskRes.data.id} đã tạo — sang tab Tasks để bắt đầu ghép.`);
      items.forEach((item) => URL.revokeObjectURL(item.objectUrl));
      setItems([]);
      setUploadProgress({});
      setSelectedIndex(null);
      selectedIdRef.current = null;
      onPreview?.(null, null);
      onMergeStarted?.(taskRes.data.id);
    } catch (err: unknown) {
      console.error(err);
      if (phase === 'creating-task') {
        const msg = isAxiosError(err)
          ? (err.response?.data as { detail?: string })?.detail || err.message
          : 'Có lỗi khi tạo task.';
        setError(msg);
        showToast('error', msg);
      }
    } finally {
      setIsSubmitting(false);
      setSubmitPhase('idle');
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <div
        {...getRootProps()}
        data-tour="import-media"
        className={`border border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors duration-200 shrink-0
          ${isDragActive ? 'border-blue-500 bg-blue-500/10' : 'border-[#404040] bg-[#181818] hover:border-[#606060]'}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <Plus className="w-6 h-6" />
          <p className="text-xs font-medium">Import Media</p>
          <p className="text-[10px] text-gray-600">Chỉ xem trước trên máy — upload khi bấm nút bên dưới</p>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-red-900/50 border border-red-500/30 rounded text-red-400 text-xs text-center shrink-0">
          {error}
        </div>
      )}

      {items.length > 1 && !isSubmitting && (
        <p className="text-[10px] text-gray-500 text-center shrink-0">
          Kéo thả <GripVertical className="w-3 h-3 inline -mt-0.5" /> để đổi thứ tự ghép · Số thứ tự = thứ tự trong video cuối
        </p>
      )}

      <div data-tour="media-list" className="flex-1 overflow-y-auto space-y-2 custom-scrollbar min-h-0">
        {items.length === 0 ? (
          <p className="text-xs text-gray-600 text-center mt-4">Chưa có video. Kéo thả hoặc click Import Media.</p>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id}
              draggable={!isSubmitting}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => selectFile(index)}
              className={`flex items-center gap-1.5 p-2 rounded-md border transition-all group cursor-pointer
                ${selectedIndex === index ? 'bg-[#252525] border-blue-500/50' : 'bg-[#181818] border-[#282828] hover:bg-[#202020]'}
                ${dragIndex === index ? 'opacity-40 scale-[0.98]' : ''}
                ${dropIndex === index && dragIndex !== null && dragIndex !== index ? 'border-blue-400 border-dashed bg-blue-950/20' : ''}
              `}
            >
              <div
                className={`shrink-0 p-0.5 rounded text-gray-600 ${!isSubmitting ? 'cursor-grab active:cursor-grabbing hover:text-gray-400' : 'opacity-30'}`}
                onClick={(e) => e.stopPropagation()}
                title="Kéo để đổi thứ tự"
              >
                <GripVertical className="w-4 h-4" />
              </div>

              <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded bg-[#282828] text-[10px] font-mono text-blue-400">
                {index + 1}
              </span>

              <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                <Film className="w-4 h-4 text-gray-500 shrink-0" />
                <div className="truncate min-w-0">
                  <p className="text-xs font-medium text-gray-300 truncate">{item.file.name}</p>
                  <p className="text-[10px] text-gray-500">
                    {(item.file.size / (1024 * 1024)).toFixed(1)} MB
                    {item.videoCodec && item.videoCodec !== 'h264' && (
                      <span className="text-amber-500/80"> · {item.videoCodec.toUpperCase()}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pl-1 shrink-0 w-20">
                {item.previewStatus === 'loading' ? (
                  <span title="Đang tạo preview H.264" className="ml-auto">
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                  </span>
                ) : uploadProgress[item.id] !== undefined ? (
                  <div className="flex flex-col w-full gap-1">
                    <div className="flex justify-between items-center text-[8px] font-mono text-blue-400">
                      <span>Up</span>
                      <span>{uploadProgress[item.id]}%</span>
                    </div>
                    <div className="h-1 bg-[#282828] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${uploadProgress[item.id]}%` }}
                      />
                    </div>
                  </div>
                ) : item.status === 'pending_upload' ? null : item.status === 'failed' ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); retryUpload(index); }}
                    className="p-1 text-red-400 hover:text-red-300 ml-auto"
                    title="Thử upload lại"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                ) : item.status === 'uploaded' ? (
                  <span title="Đã lên server" className="ml-auto">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </span>
                ) : null}
                {item.status !== 'uploading' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                    disabled={isSubmitting}
                    className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div data-tour="merge-button" className="pt-2 border-t border-[#282828] shrink-0">
        <button
          onClick={uploadAndCreateTask}
          disabled={!canSubmit}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-[#282828] disabled:text-gray-500 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          {isSubmitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          {submitButtonLabel}
        </button>
      </div>
    </div>
  );
}

const VideoUploader = memo(VideoUploaderInner);

function VideoUploaderConnected() {
  const { onMergeStarted, setPreview } = useStudioActions();
  return <VideoUploader onMergeStarted={onMergeStarted} onPreview={setPreview} />;
}

export default VideoUploaderConnected;
