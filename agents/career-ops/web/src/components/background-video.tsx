"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { BACKGROUND_VIDEO_URL, VEIL, useVideoEnabled } from "@/lib/appearance";

export function BackgroundVideo() {
  const video = useVideoEnabled();
  const ref = useRef<HTMLVideoElement>(null);
  // Work pages get a heavier veil than the launcher so dense tables stay readable.
  const veil = usePathname() === "/" ? VEIL.launcher : VEIL.work;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Reduced motion keeps the first frame as a still backdrop instead of looping.
    const sync = () => { if (reduce.matches) el.pause(); else el.play().catch(() => { /* autoplay blocked: the still frame stays */ }); };
    sync();
    reduce.addEventListener("change", sync);
    return () => reduce.removeEventListener("change", sync);
  }, [video]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {video && (
        <video
          ref={ref}
          src={BACKGROUND_VIDEO_URL}
          muted
          loop
          playsInline
          preload="metadata"
          className="size-full scale-105 object-cover"
        />
      )}
      <div
        className="absolute inset-0 transition-[background-color] duration-500"
        style={{ backgroundColor: `color-mix(in srgb, var(--bg) ${Math.round(veil * 100)}%, transparent)` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,var(--bg)_100%)] opacity-60" />
    </div>
  );
}
