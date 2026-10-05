import { useSyncExternalStore } from "react";

// Served from public/ so the background never depends on a remote host (see README "Citations").
export const BACKGROUND_VIDEO_URL = "/background.mp4";

// Share of the page background laid over the video: launcher, then work pages.
export const VEIL = { launcher: 0.55, work: 0.82 } as const;

const KEY = "careerreboot:background-video";
const listeners = new Set<() => void>();

const read = (): boolean => {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
};

export function setVideoEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage unavailable: lasts for this page view */ }
  listeners.forEach((l) => l());
}

export function useVideoEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; },
    read,
    () => true,
  );
}
