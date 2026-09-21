"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { ReadyToApplyWorkspace, type ReadyToApplyRow } from "@/components/cv/ready-to-apply-workspace";
import { LatexEditor } from "@/components/cv/latex-editor";

// The section outline nav below reads `## Heading` lines straight out of the
// markdown source (no AST) — good enough for CV structure (Experience,
// Education, Skills, ...) without pulling in a markdown-to-AST parser.
function outlineFromMarkdown(md: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const line of md.split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const title = m[1].replace(/[#*_`]/g, "").trim();
    if (!title) continue;
    let id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!id) continue;
    while (seen.has(id)) id += "-x";
    seen.add(id);
    out.push({ id, title });
  }
  return out;
}

export function CvEditor({ readyToApply, latexSourceName }: { readyToApply?: ReadyToApplyRow[]; latexSourceName?: string | null }) {
  // A latex-mode user (config/profile.yml's cv.output_format: latex) lands on
  // the LaTeX tab by default — that .tex file, not cv.md, is what the
  // tailored-CV and default-resume pipelines actually compile for them.
  const [tab, setTab] = useState<"markdown" | "latex">(latexSourceName ? "latex" : "markdown");
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/cv")
      .then((r) => r.json())
      .then((d) => {
        setContent(d.content ?? "");
        setExists(d.exists ?? false);
      })
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setDirty(false);
        setExists(true);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  const outline = useMemo(() => outlineFromMarkdown(content), [content]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {latexSourceName && (
        <div className="mb-6 inline-flex rounded-lg border border-border bg-surface/40 p-0.5 text-sm">
          {(["latex", "markdown"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3.5 py-1.5 font-medium capitalize transition-colors",
                tab === t ? "bg-brand-soft text-brand" : "text-muted hover:text-foreground",
              )}
            >
              {t === "latex" ? `LaTeX (${latexSourceName})` : "Markdown (cv.md)"}
            </button>
          ))}
        </div>
      )}

      {tab === "latex" && latexSourceName ? (
        <LatexEditor sourceName={latexSourceName} />
      ) : (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl tracking-tight text-landing">CV editor</h1>
              <p className="mt-1 text-sm text-muted">
                Edit <code className="text-foreground">cv.md</code> — your one primary CV, with a document-style preview.
                {latexSourceName && " Used for matching/evaluation regardless of which resume format you apply with."}
                {!exists && loaded && <span className="ml-1 text-faint">No cv.md yet — start typing to create it.</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors max-sm:min-h-[44px]",
                dirty
                  ? "bg-brand text-brand-foreground hover:bg-brand-200"
                  : "border border-border bg-surface text-muted",
              )}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
              {saved ? "Saved" : "Save"}
            </button>
          </div>

          {!loaded ? (
        <div className="mt-6 text-sm text-muted">Loading…</div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_minmax(0,1.1fr)_auto]">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            placeholder="# Your Name&#10;&#10;## Summary&#10;..."
            className="min-h-[70vh] w-full resize-none rounded-2xl border border-border bg-surface/50 p-4 font-mono text-sm leading-relaxed outline-none transition-colors placeholder:text-faint focus:border-brand/40"
          />

          {/* Document-style preview: a "paper" page, not the app's own prose
              styling — the closer the preview looks to the compiled CV, the
              less surprising the generated PDF is. */}
          <div className="min-h-[70vh] overflow-auto rounded-2xl border border-border bg-surface/20 p-4 sm:p-6">
            <article
              id="cv-doc-preview"
              className="report-prose mx-auto max-w-[680px] rounded-sm bg-white p-8 text-[13.5px] text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)] dark:bg-zinc-50 dark:text-zinc-900 sm:p-10"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {content.trim() ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h2: ({ children }) => {
                      const title = String(children).replace(/[#*_`]/g, "").trim();
                      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                      return (
                        <h2 id={id} className="mt-6 scroll-mt-4 border-b border-zinc-300 pb-1 text-[15px] font-semibold uppercase tracking-wide text-zinc-800 first:mt-0">
                          {children}
                        </h2>
                      );
                    },
                  }}
                >
                  {content}
                </ReactMarkdown>
              ) : (
                <p className="text-zinc-400">Preview appears here.</p>
              )}
            </article>
          </div>

          {/* Section outline — quick nav within the preview pane, like a
              document editor's sidebar. */}
          <nav className="hidden max-h-[70vh] w-40 shrink-0 overflow-auto rounded-2xl border border-border bg-surface/30 p-3 text-xs lg:block">
            <p className="mb-2 font-semibold uppercase tracking-wide text-faint">Sections</p>
            {outline.length ? (
              <ul className="space-y-1">
                {outline.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="block truncate rounded px-1.5 py-1 text-muted hover:bg-surface-hover hover:text-foreground"
                      title={s.title}
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-faint">Add {"##"} headings to see an outline.</p>
            )}
          </nav>
        </div>
          )}
        </>
      )}

      {readyToApply !== undefined && (
        <div className="mt-10 border-t border-border pt-8">
          <ReadyToApplyWorkspace rows={readyToApply} />
        </div>
      )}
    </div>
  );
}
