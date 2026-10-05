import { useSyncExternalStore } from "react";

export type Appearance = { video: boolean; videoUrl: string; dim: number };

export const DEFAULT_VIDEO_URL =
  process.env.NEXT_PUBLIC_BACKGROUND_VIDEO_URL?.trim() ||
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_084718_72a17915-4964-4059-afcd-22d59399b72e.mp4";

export const DEFAULT_APPEARANCE: Appearance = { video: true, videoUrl: DEFAULT_VIDEO_URL, dim: 0.55 };
export const DIM_RANGE = { min: 0.2, max: 0.9 } as const;

const KEY = "careerreboot:appearance";
const listeners = new Set<() => void>();

/** Only https or same-origin paths reach the <video> src; anything else falls back to the default. */
export function safeVideoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export function normalizeAppearance(raw: unknown): Appearance {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Appearance, unknown>>;
  const dim = Number(o.dim);
  return {
    video: typeof o.video === "boolean" ? o.video : DEFAULT_APPEARANCE.video,
    videoUrl: safeVideoUrl(o.videoUrl) ?? DEFAULT_APPEARANCE.videoUrl,
    dim: Number.isFinite(dim) ? Math.min(DIM_RANGE.max, Math.max(DIM_RANGE.min, dim)) : DEFAULT_APPEARANCE.dim,
  };
}

// useSyncExternalStore needs a stable snapshot, so cache by the raw stored string.
let cache: { raw: string | null; value: Appearance } = { raw: null, value: DEFAULT_APPEARANCE };

function read(): Appearance {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* storage unavailable: defaults */ }
  if (raw !== cache.raw) {
    let parsed: unknown = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* corrupt entry: defaults */ }
    cache = { raw, value: normalizeAppearance(parsed) };
  }
  return cache.value;
}

export function saveAppearance(next: Appearance | null) {
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(normalizeAppearance(next)));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable: change lasts for this page view only */ }
  listeners.forEach((l) => l());
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; },
    read,
    () => DEFAULT_APPEARANCE,
  );
}
