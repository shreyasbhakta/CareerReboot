"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileCog, Loader2, Palette, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";
import { setVideoEnabled, useVideoEnabled } from "@/lib/appearance";
import type { SettingsDocView } from "@/lib/settings";

const APPEARANCE = "appearance";
const inputCls = "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand/50";

type Msg = { ok: boolean; text: string } | null;

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** The trigger and its dialog. `dock` is the launcher's bottom pill; `sidebar` sits in the app shell. */
export function SettingsButton({ variant }: { variant: "dock" | "sidebar" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const dirty = useRef(false);

  const show = () => { ref.current?.showModal(); setOpen(true); };
  const close = useCallback(() => {
    if (dirty.current && !window.confirm("Discard unsaved changes?")) return;
    dirty.current = false;
    ref.current?.close();
    setOpen(false);
  }, []);

  return (
    <>
      {variant === "dock" ? (
        <button
          type="button"
          onClick={show}
          className="btn-shine group inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-foreground shadow-[0_0_30px_-10px_var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <Settings2 className="size-4 transition-transform duration-500 group-hover:rotate-90" />
          Settings
        </button>
      ) : (
        <button
          type="button"
          onClick={show}
          className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Settings2 className="size-4" /> Settings
        </button>
      )}
      <dialog
        ref={ref}
        aria-label="Settings"
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClick={(e) => { if (e.target === ref.current) close(); }}
        className="glass m-auto max-h-[88vh] w-[min(980px,94vw)] overflow-hidden rounded-3xl p-0 text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        {open && <SettingsPanel onClose={close} onDirty={(d) => { dirty.current = d; }} />}
      </dialog>
    </>
  );
}

function SettingsPanel({ onClose, onDirty }: { onClose: () => void; onDirty: (dirty: boolean) => void }) {
  const [docs, setDocs] = useState<SettingsDocView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(APPEARANCE);

  const load = useCallback(async () => {
    try { setDocs((await call("/api/settings")).docs); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "could not load settings"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const doc = docs?.find((d) => d.id === tab);
  const tabs: { id: string; label: string; local?: boolean }[] = [
    { id: APPEARANCE, label: "Appearance" },
    ...(docs ?? []).map((d) => ({ id: d.id, label: d.label, local: d.localText !== null })),
  ];

  return (
    <div className="flex max-h-[88vh] flex-col">
      <header className="flex items-start gap-3 border-b border-border/70 px-6 py-4">
        <div>
          <h2 className="font-display text-xl tracking-tight">Settings</h2>
          <p className="mt-0.5 text-xs text-muted">Every personal value lives in a gitignored file on this machine. The repo only ships examples with placeholders.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings" className="ml-auto"><X className="size-4" /></Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/70 p-3 md:w-52 md:flex-col md:border-b-0 md:border-r">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors",
                tab === t.id ? "bg-brand-soft text-brand-text" : "text-muted hover:bg-surface-hover hover:text-foreground",
              )}
            >
              {t.id === APPEARANCE ? <Palette className="size-4" /> : <FileCog className="size-4" />}
              {t.label}
              {t.local !== undefined && <span className={cn("ml-auto size-1.5 rounded-full", t.local ? "bg-emerald-500" : "bg-amber-500")} title={t.local ? "local file" : "using example"} />}
            </button>
          ))}
          {!docs && !err && <span className="flex items-center gap-2 px-3 py-2 text-xs text-faint"><Loader2 className="size-3 animate-spin" /> Loading…</span>}
        </nav>
        <section className="min-h-0 flex-1 overflow-y-auto p-6">
          {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
          {tab === APPEARANCE ? <AppearancePanel /> : doc && <DocPanel key={doc.id} doc={doc} reload={load} onDirty={onDirty} />}
        </section>
      </div>
    </div>
  );
}

function AppearancePanel() {
  const video = useVideoEnabled();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Appearance</h3>
        <p className="mt-1 text-xs text-muted">Saved in this browser only.</p>
      </div>
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={video} onChange={(e) => setVideoEnabled(e.target.checked)} />
        Show the background video
      </label>
      <div className="flex items-center gap-3 border-t border-border/70 pt-4">
        <span className="text-sm text-muted">Theme</span>
        <ThemeToggle />
      </div>
    </div>
  );
}

function DocPanel({ doc, reload, onDirty }: { doc: SettingsDocView; reload: () => Promise<void>; onDirty: (dirty: boolean) => void }) {
  // Overlay files start empty (only overrides); full copies start from the example.
  const initial = doc.localText ?? (doc.kind === "overlay" ? "" : doc.exampleText);
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const isLocal = doc.localText !== null;
  const dirty = text !== initial;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { const text = await fn(); onDirty(false); await reload(); setMsg({ ok: true, text }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "failed" }); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const r = await call(`/api/settings/${doc.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ yaml: text }) });
    return r.backup ? `Saved. Previous version kept at ${r.backup}.` : `Saved to ${doc.localPath}.`;
  });
  const remove = () => {
    if (!window.confirm(`Remove ${doc.localPath}? The flow falls back to the example placeholders; a backup copy is kept.`)) return;
    run(async () => {
      const r = await call(`/api/settings/${doc.id}`, { method: "DELETE" });
      setText(doc.kind === "overlay" ? "" : doc.exampleText);
      return r.backup ? `Removed. Backup kept at ${r.backup}.` : "Removed.";
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{doc.label}</h3>
          <p className="mt-1 text-xs text-muted">{doc.description}</p>
        </div>
        <Badge tone={isLocal ? "good" : "warn"}>{isLocal ? "Local file" : "Using example"}</Badge>
      </div>
      <p className="text-xs text-faint">
        Local: <code>{doc.localPath}</code> · Example: <code>{doc.examplePath}</code>
        {doc.id === "hiring-radar" && <> · API keys, connections and schedule: <Link href="/hiring-radar" className="text-brand-text underline-offset-2 hover:underline">Hiring Radar page</Link></>}
      </p>
      <textarea
        aria-label={`${doc.label} YAML`}
        className={cn(inputCls, "h-[44vh] resize-y font-mono text-xs leading-relaxed")}
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={doc.kind === "overlay" ? "# Only the keys you change. Everything else comes from the example." : undefined}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="shine" onClick={save} disabled={busy || !text.trim() || (!dirty && isLocal)}>
          {busy && <Loader2 className="size-4 animate-spin" />} {isLocal ? "Validate & save" : "Create local file"}
        </Button>
        <Button variant="ghost" onClick={() => setText(initial)} disabled={busy || !dirty}>Revert</Button>
        <Button variant="ghost" onClick={() => setText(doc.exampleText)} disabled={busy}>Load example</Button>
        {isLocal && <Button variant="ghost" className="ml-auto text-red-600" onClick={remove} disabled={busy}>Remove local file</Button>}
      </div>
      {msg && <p role="status" className={cn("whitespace-pre-wrap text-xs", msg.ok ? "text-emerald-600" : "text-red-600")}>{msg.text}</p>}
    </div>
  );
}
