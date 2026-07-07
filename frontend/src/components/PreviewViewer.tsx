'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Film, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Loader2,
} from 'lucide-react';

interface PreviewViewerProps {
  src: string | null;
  title: string | null;
  hint?: string;
  /** Đổi mỗi lần chọn file — buộc remount player kể cả cùng blob URL */
  reloadKey?: number;
}

const SKIP_SECONDS = 5;

function mediaErrorMessage(video: HTMLVideoElement): string {
  const code = video.error?.code;
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Tải video bị hủy. Thử chọn lại file.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Lỗi mạng khi tải video. Kiểm tra backend đang chạy (port 8003).';
    case MediaError.MEDIA_ERR_DECODE:
      return 'Trình duyệt không giải mã được video này (codec không hỗ trợ).';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Định dạng video không được hỗ trợ hoặc URL không hợp lệ.';
    default:
      return 'Không phát được video. File có thể quá lớn hoặc định dạng không hỗ trợ.';
  }
}

function PreviewViewerInner({ src, title, hint, reloadKey = 0 }: PreviewViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const activeLoadRef = useRef<{ src: string | null; key: number }>({ src: null, key: -1 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [codecWarning, setCodecWarning] = useState<string | null>(null);

  useEffect(() => {
    activeLoadRef.current = { src, key: reloadKey };
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadError(null);
    setIsLoading(!!src);
    setCanPlay(false);
    setCodecWarning(null);
  }, [src, reloadKey]);

  useEffect(() => {
    if (!src || !videoRef.current) return;
    const video = videoRef.current;
    video.load();
  }, [src, reloadKey]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(time)) return;
    const clamped = Math.max(0, Math.min(time, duration || video.duration || 0));
    video.currentTime = clamped;
    setCurrentTime(clamped);
  }, [duration]);

  const seekFromClientX = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const video = videoRef.current;
    if (!bar || !video || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  }, [duration, seekTo]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      video.pause();
    }
  };

  const skip = (delta: number) => {
    seekTo(currentTime + delta);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !isMuted;
    video.muted = next;
    setIsMuted(next);
  };

  const changeVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Math.max(0, Math.min(1, value));
    video.volume = v;
    setVolume(v);
    setIsMuted(v === 0);
    video.muted = v === 0;
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // ignore unsupported fullscreen
    }
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  };

  const checkVideoPicture = useCallback((video: HTMLVideoElement | null) => {
    if (!video || !video.isConnected) return;
    if (video.readyState >= 2 && video.videoWidth === 0 && video.duration > 0 && !video.paused) {
      setCodecWarning(
        'Có tiếng nhưng không có hình (HEVC/TikTok). Đang chờ preview H.264 — icon vàng bên file.',
      );
    } else if (video.videoWidth > 0) {
      setCodecWarning(null);
    }
  }, []);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const showPlayOverlay = !isPlaying && !loadError && !codecWarning && (canPlay || !isLoading);

  useEffect(() => {
    if (!isSeeking) return;
    const onMove = (e: MouseEvent) => seekFromClientX(e.clientX);
    const onUp = () => setIsSeeking(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isSeeking, seekFromClientX]);

  return (
    <div className="flex-1 p-6 flex flex-col items-center justify-center relative border-b border-[#282828] min-h-0">
      <div className="absolute top-4 left-4 text-xs font-mono text-gray-500 flex items-center gap-2 z-10">
        <div className={`w-2 h-2 rounded-full ${src ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
        Preview Viewer
        {src && title?.startsWith('merged_') && (
          <span className="ml-2 px-2 py-0.5 rounded bg-green-900/50 text-green-400 text-[10px] font-sans font-medium border border-green-500/30">
            Kết quả ghép
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className={`w-full max-w-3xl rounded-lg shadow-2xl border border-[#282828] overflow-hidden bg-[#141414] ${isFullscreen ? 'max-w-none h-full flex flex-col' : ''}`}
      >
        {src ? (
          <>
            {/* Video area — aspect-ratio riêng, không chia không gian với controls */}
            <div className={`relative w-full bg-black ${isFullscreen ? 'flex-1 min-h-0' : 'aspect-video'}`}>
              <video
                key={`${reloadKey}-${src ?? ''}`}
                ref={videoRef}
                src={src}
                preload="metadata"
                playsInline
                className="absolute inset-0 w-full h-full object-contain cursor-pointer"
                onClick={togglePlay}
                onTimeUpdate={(e) => { if (!isSeeking) setCurrentTime(e.currentTarget.currentTime); }}
                onLoadedMetadata={(e) => {
                  if (activeLoadRef.current.src !== src || activeLoadRef.current.key !== reloadKey) return;
                  setDuration(e.currentTarget.duration);
                  e.currentTarget.volume = volume;
                  setLoadError(null);
                }}
                onLoadStart={() => {
                  if (activeLoadRef.current.src !== src || activeLoadRef.current.key !== reloadKey) return;
                  setIsLoading(true);
                  setCanPlay(false);
                  setLoadError(null);
                }}
                onWaiting={() => setIsLoading(true)}
                onCanPlay={(e) => {
                  if (activeLoadRef.current.src !== src || activeLoadRef.current.key !== reloadKey) return;
                  setIsLoading(false);
                  setCanPlay(true);
                  setLoadError(null);
                  checkVideoPicture(e.currentTarget);
                }}
                onError={(e) => {
                  if (activeLoadRef.current.src !== src || activeLoadRef.current.key !== reloadKey) return;
                  setIsLoading(false);
                  setCanPlay(false);
                  const msg = mediaErrorMessage(e.currentTarget);
                  const isBlob = src?.startsWith('blob:');
                  setLoadError(
                    isBlob
                      ? `${msg} Thử click lại file trong danh sách Media.`
                      : msg,
                  );
                }}
                onEnded={() => setIsPlaying(false)}
                onPlay={(e) => {
                  setIsPlaying(true);
                  const el = e.currentTarget;
                  window.setTimeout(() => {
                    if (activeLoadRef.current.src !== src || activeLoadRef.current.key !== reloadKey) return;
                    checkVideoPicture(el);
                  }, 300);
                }}
                onPause={() => setIsPlaying(false)}
                onLoadedData={(e) => checkVideoPicture(e.currentTarget)}
              />

              {isLoading && !loadError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 pointer-events-none">
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  <p className="text-[11px] text-gray-400">Đang tải video...</p>
                  <p className="text-[10px] text-gray-600">File lớn có thể mất vài giây</p>
                </div>
              )}

              {codecWarning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 p-4">
                  <p className="text-xs text-amber-300 text-center">{codecWarning}</p>
                </div>
              )}

              {loadError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4">
                  <p className="text-xs text-red-300 text-center">{loadError}</p>
                  <button
                    onClick={() => {
                      const video = videoRef.current;
                      if (!video) return;
                      setLoadError(null);
                      setIsLoading(true);
                      video.load();
                    }}
                    className="px-3 py-1.5 text-[11px] bg-[#282828] hover:bg-[#383838] text-gray-200 rounded"
                  >
                    Thử lại
                  </button>
                </div>
              )}

              {showPlayOverlay && (
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
                  aria-label="Phát video"
                >
                  <div className="w-14 h-14 rounded-full bg-black/70 flex items-center justify-center border border-white/30 shadow-lg">
                    <Play className="w-7 h-7 text-white fill-white ml-1" />
                  </div>
                </button>
              )}
            </div>

            {/* Controls */}
            <div className="shrink-0 bg-[#141414] border-t border-[#282828] px-3 py-2.5 space-y-2">
              <div
                ref={progressRef}
                className="relative h-1.5 bg-gray-800 rounded-full cursor-pointer group/progress"
                onMouseDown={(e) => {
                  setIsSeeking(true);
                  seekFromClientX(e.clientX);
                }}
                onClick={(e) => seekFromClientX(e.clientX)}
              >
                <div
                  className="absolute top-0 left-0 h-full bg-blue-600 rounded-full pointer-events-none"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover/progress:opacity-100 transition-opacity pointer-events-none"
                  style={{ left: `calc(${progress}% - 6px)` }}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-gray-400">
                  <button onClick={() => skip(-SKIP_SECONDS)} disabled={!src} className="p-1 hover:text-white disabled:opacity-30" title={`Lùi ${SKIP_SECONDS}s`}>
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button onClick={togglePlay} disabled={!src} className="p-1 hover:text-white disabled:opacity-30" title="Phát / Dừng">
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                  </button>
                  <button onClick={() => skip(SKIP_SECONDS)} disabled={!src} className="p-1 hover:text-white disabled:opacity-30" title={`Tới ${SKIP_SECONDS}s`}>
                    <SkipForward className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-mono text-gray-500 ml-1 tabular-nums">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-gray-400">
                  <button onClick={toggleMute} disabled={!src} className="p-1 hover:text-white disabled:opacity-30" title="Tắt / Bật tiếng">
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => changeVolume(parseFloat(e.target.value))}
                    disabled={!src}
                    className="w-16 h-1 accent-blue-500 cursor-pointer disabled:opacity-30"
                    title="Âm lượng"
                  />
                  <button onClick={toggleFullscreen} disabled={!src} className="p-1 hover:text-white disabled:opacity-30" title="Toàn màn hình">
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="aspect-video flex flex-col items-center justify-center bg-black">
            <Film className="w-16 h-16 text-gray-800 mb-4" />
            <p className="text-gray-600 text-sm font-medium">Chưa chọn video</p>
            <p className="text-gray-700 text-xs mt-1 text-center px-6">
              {hint || 'Thêm video ở tab Media, sau đó click vào file để xem trước tại đây'}
            </p>
          </div>
        )}
      </div>

      {title && (
        <p className="mt-3 text-xs text-gray-400 truncate max-w-3xl w-full text-center px-4 shrink-0">
          Đang xem: <span className="text-gray-200">{title}</span>
        </p>
      )}
    </div>
  );
}

export default React.memo(PreviewViewerInner);
