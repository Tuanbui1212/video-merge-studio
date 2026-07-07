/** Detect if blob playback shows video (false = likely HEVC/TikTok, needs server transcode). */
export function detectNeedsServerPreview(objectUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let settled = false;
    const finish = (needs: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.pause();
      video.removeAttribute('src');
      video.load();
      resolve(needs);
    };

    const timer = window.setTimeout(() => finish(true), 6000);

    video.addEventListener(
      'loadeddata',
      () => {
        finish(video.videoWidth === 0);
      },
      { once: true },
    );
    video.addEventListener('error', () => finish(true), { once: true });

    video.src = objectUrl;
    video.load();
  });
}
