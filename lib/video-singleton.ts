let videoEl: HTMLVideoElement | null = null;
let currentContainer: HTMLElement | null = null;

function getVideo(): HTMLVideoElement {
  if (!videoEl) {
    videoEl = document.createElement("video");
    videoEl.loop = true;
    videoEl.playsInline = true;
    videoEl.preload = "none";
    Object.assign(videoEl.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      opacity: "0",
      transition: "opacity 200ms",
    });
  }
  return videoEl;
}

export type VideoCallbacks = {
  onReady: () => void;
  onSound: (withSound: boolean) => void;
};

export function attachVideo(
  container: HTMLElement,
  src: string,
  cb: VideoCallbacks
) {
  const v = getVideo();

  if (currentContainer === container) return;
  if (currentContainer) detachVideo();

  currentContainer = container;
  v.style.opacity = "0";

  v.onloadeddata = () => {
    v.style.opacity = "1";
    cb.onReady();
  };

  v.src = src;
  container.appendChild(v);

  v.muted = false;
  v.volume = 0.85;
  v.play()
    .then(() => cb.onSound(!v.muted))
    .catch(() => {
      v.muted = true;
      v.play().catch(() => {});
      cb.onSound(false);
    });
}

export function detachVideo() {
  const v = videoEl;
  if (!v) return;

  v.pause();
  v.removeAttribute("src");
  v.load();
  v.style.opacity = "0";
  v.onloadeddata = null;

  if (v.parentElement) v.parentElement.removeChild(v);
  currentContainer = null;
}
