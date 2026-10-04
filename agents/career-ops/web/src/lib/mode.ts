import { useSyncExternalStore } from "react";
import { NAV_ITEMS, type NavItem } from "@/lib/nav-items";

export type Mode = "complete" | "fast" | "cv";

export const MODES: Record<Mode, { label: string; tagline: string; home: string; routes: string[] | "all" }> = {
  complete: { label: "Complete", tagline: "Pipeline, discovery, research, follow-ups, analytics and the CV builder.", home: "/dashboard", routes: "all" },
  fast: { label: "Fast paced", tagline: "Hiring Radar and the CV builder. Nothing else.", home: "/hiring-radar", routes: ["/hiring-radar", "/cv"] },
  cv: { label: "CV builder", tagline: "Only the CV builder.", home: "/cv", routes: ["/cv"] },
};

const KEY = "career-reboot:mode";
const listeners = new Set<() => void>();

const read = (): Mode => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "fast" || v === "cv" ? v : "complete";
  } catch {
    return "complete";
  }
};

export function setMode(mode: Mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* storage unavailable: mode lasts for this page view only */ }
  listeners.forEach((l) => l());
}

export function useMode(): Mode {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; },
    read,
    () => "complete",
  );
}

export function navFor(mode: Mode): NavItem[] {
  const { routes } = MODES[mode];
  return routes === "all" ? NAV_ITEMS : NAV_ITEMS.filter((i) => routes.includes(i.href));
}
