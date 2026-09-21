"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, AlertTriangle, FileText } from "lucide-react";
import { cn } from "@/lib/cn";

// A real Overleaf-style editor for the user's LaTeX resume (resume.tex,
// config/profile.yml's cv.output_format: latex): source on the left, the
// ACTUAL compiled PDF on the right — not a markdown approximation. Reuses
// the same compile primitive as "Apply with Default Resume" (POST
// /api/cv/default -> generate-latex.mjs --compile-only via tectonic) so the
// preview is byte-for-byte what a real apply would attach, and the same
// byte-serving route (/api/cv-pdf?default=1) already built for that feature.
export function LatexEditor({ sourceName }: { sourceName: string }) {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [compileError, setCompileError] = useState("");
  const [hasPreview, setHasPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/cv/latex").then((r) => r.json()),
      fetch("/api/cv/default").then((r) => r.json()),
    ])
      .then(([cv, cvDefault]) => {
        setContent(cv.content ?? "");
        setExists(cv.exists ?? false);
        setHasPreview(!!cvDefault.ready);
      })
      .finally(() => setLoaded(true));
  }, []);

  async function saveAndCompile() {
    setSaving(true);
    setCompileError("");
    try {
      const saveRes = await fetch("/api/cv/latex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        setCompileError(saveData.error || "Could not save resume.tex.");
        return;
      }
      setDirty(false);
      setExists(true);
      const compileRes = await fetch("/api/cv/default", { method: "POST" });
      const compileData = await compileRes.json();
      if (!compileRes.ok || compileData.error) {
        setCompileError(compileData.error || "Compilation failed.");
        return;
      }
      setHasPreview(true);
      setPreviewKey((k) => k + 1);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      setCompileError("Could not reach the server to save/compile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">LaTeX editor</h1>
          <p className="mt-1 text-sm text-muted">
            Edit <code className="text-foreground">{sourceName}</code> — the real source compiled for tailored and
            default-resume PDFs.
            {!exists && loaded && <span className="ml-1 text-faint">Doesn&apos;t exist yet — start typing to create it.</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={saveAndCompile}
          disabled={saving || !dirty}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors max-sm:min-h-[44px]",
            dirty ? "bg-brand text-brand-foreground hover:bg-brand-200" : "border border-border bg-surface text-muted",
          )}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : savedFlash ? <Check className="size-4" /> : null}
          {saving ? "Compiling…" : savedFlash ? "Saved & compiled" : "Save & compile"}
        </button>
      </div>

      {compileError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/[0.06] p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
          <div>
            <p className="font-medium text-red-600 dark:text-red-400">Compile failed</p>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-red-600/90 dark:text-red-400/90">{compileError}</pre>
          </div>
        </div>
      )}

      {!loaded ? (
        <div className="mt-6 text-sm text-muted">Loading…</div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            placeholder="\documentclass{article}&#10;\begin{document}&#10;...&#10;\end{document}"
            className="min-h-[75vh] w-full resize-none rounded-2xl border border-border bg-surface/50 p-4 font-mono text-[13px] leading-relaxed outline-none transition-colors placeholder:text-faint focus:border-brand/40"
          />
          <div className="min-h-[75vh] overflow-hidden rounded-2xl border border-border bg-surface/30">
            {hasPreview ? (
              <iframe key={previewKey} src={`/api/cv-pdf?default=1&v=${previewKey}`} title="Compiled resume preview" className="h-full min-h-[75vh] w-full" />
            ) : (
              <div className="flex h-full min-h-[75vh] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
                <FileText className="size-6 text-faint" />
                <p>No compiled preview yet — Save &amp; compile to see the real PDF here.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
