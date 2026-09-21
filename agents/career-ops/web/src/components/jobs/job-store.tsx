"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { scoreTone } from "@/lib/format";
import { readSavedCliId, resolveCliId } from "@/lib/saved-cli";

export type JobStep = { kind: "tool" | "status"; label: string; ts: number };
export type JobResult = { score: number | null; summary: string; tone: "good" | "warn" | "bad" | "muted" };

export type Job = {
  id: string;
  title: string;
  subtitle?: string;
  page?: string; // route the job was launched from / refers to
  input?: string; // the URL/posting it processed (links inbox rows to their worker)
  kind?: string;
  batchId?: string; // groups jobs fired together (e.g. "evaluate all Anthropic")
  status: "running" | "done" | "error";
  steps: JobStep[];
  text: string;
  result?: JobResult;
  cost?: { tokens: number; usd?: number }; // per-run token cost (Claude result event) — local only
  startedAt: number;
  endedAt?: number;
  /** The backend job-registry id (job-registry.ts) — set from the stream's first
   *  "jobId" event. Its presence is what lets a reopened tab reconnect to a run
   *  that kept going server-side instead of being killed by the disconnect
   *  (#background-jobs); a job started before this existed simply has none. */
  serverId?: string;
};

type StartOpts = { title: string; subtitle?: string; kind: string; input: string; page?: string; batchId?: string };

type Ctx = {
  jobs: Job[];
  startJob: (opts: StartOpts) => string | null;
  removeJob: (id: string) => void;
  clearFinished: () => void;
};

const JobsContext = createContext<Ctx | null>(null);
export function useJobs() {
  const c = useContext(JobsContext);
  if (!c) throw new Error("useJobs must be used within <JobsProvider>");
  return c;
}

const JOBS_KEY = "career-ops:jobs";

function parseVerdict(text: string): JobResult {
  const m = text.match(/VERDICT:\s*([\d.]+)\s*\/\s*5\s*[—:|-]+\s*(.+)/i);
  if (m) {
    const score = parseFloat(m[1]);
    return { score, summary: m[2].trim().replace(/\s+/g, " ").slice(0, 90), tone: scoreTone(`${score}`) };
  }
  const s = text.match(/\b([0-5](?:\.\d)?)\s*\/\s*5\b/);
  if (s) {
    const score = parseFloat(s[1]);
    return { score, summary: "", tone: scoreTone(`${score}`) };
  }
  return { score: null, summary: "", tone: "muted" };
}

type Patch = (id: string, fn: (j: Job) => Job) => void;
type RunOpts = { title: string; subtitle?: string; page?: string; input: string; kind: string };

/** Shared by the two failure paths that never got as far as reading any stream
 *  (the initial fetch came back non-OK, or threw before a body existed) — at
 *  that point there is no accumulated text/steps to fold in, so this mirrors
 *  the terminal branch of consumeRunStream's own `finish` with all of it empty. */
function finishRun(id: string, opts: RunOpts, patch: Patch, status: "error", lastLabel: string) {
  patch(id, (j) => ({
    ...j,
    status,
    endedAt: Date.now(),
    steps: [...j.steps, { kind: "status", label: lastLabel, ts: Date.now() }],
  }));
}

/**
 * Reads one run's NDJSON stream to completion, applying each event to the job
 * via `patch`. Used both for the connection that started the run and for a
 * later reconnect (GET /api/run/stream) — the wire format and event handling
 * are identical either way, which is what makes resuming after a closed tab
 * possible at all (#background-jobs): the backend job kept running regardless
 * of who, if anyone, was reading its output.
 */
async function consumeRunStream(id: string, reader: ReadableStreamDefaultReader<Uint8Array>, opts: RunOpts, patch: Patch) {
  let text = "";
  let verdictLine = ""; // latched separately so the 8000-char tail can't drop it
  let doneTokens = 0; // per-run token cost, forwarded on the done event (#6)
  let doneCostUsd: number | null = null;
  const steps: JobStep[] = [];
  const finish = (status: "done" | "error", lastLabel?: string) => {
    const result = status === "done" ? parseVerdict(verdictLine || text) : undefined;
    const cost = status === "done" && doneTokens > 0 ? { tokens: doneTokens, usd: doneCostUsd ?? undefined } : undefined;
    patch(id, (j) => ({
      ...j,
      status,
      result,
      cost,
      endedAt: Date.now(),
      steps: lastLabel ? [...j.steps, { kind: "status", label: lastLabel, ts: Date.now() }] : j.steps,
    }));
    // persist a readable log file so the CLI/assistant can read past runs
    if (status === "done") {
      fetch("/api/runs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title: opts.title, subtitle: opts.subtitle, page: opts.page, input: opts.input, result, cost, steps, output: text }),
      }).catch(() => {});
      // Tell server-snapshot surfaces (Today, pipeline) to refetch — the
      // worker just wrote a real tracker row / report they don't yet see.
      if (typeof window !== "undefined" && (opts.kind === "evaluate" || opts.kind === "pdf")) {
        window.dispatchEvent(new CustomEvent("co-job-done", { detail: { kind: opts.kind, input: opts.input } }));
      }
    }
  };

  try {
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === "jobId") {
            // Learned once, from either the original connection or a reconnect's
            // replay — persisted so the NEXT reload can reconnect too.
            patch(id, (j) => ({ ...j, serverId: ev.id }));
          } else if (ev.type === "tool") {
            steps.push({ kind: "tool", label: ev.name, ts: Date.now() });
            patch(id, (j) => ({ ...j, steps: [...j.steps, { kind: "tool", label: ev.name, ts: Date.now() }] }));
          } else if (ev.type === "status") {
            steps.push({ kind: "status", label: ev.label, ts: Date.now() });
            patch(id, (j) => ({ ...j, steps: [...j.steps, { kind: "status", label: ev.label, ts: Date.now() }] }));
          } else if (ev.type === "text") {
            const full = text + ev.text;
            const vm = full.match(/VERDICT:[^\n]*/i);
            if (vm) verdictLine = vm[0];
            text = full.slice(-8000);
            patch(id, (j) => ({ ...j, text }));
          } else if (ev.type === "done") {
            // finish happens on stream-close; capture the per-run cost it carries
            if (typeof ev.tokens === "number") doneTokens = ev.tokens;
            if (typeof ev.costUsd === "number") doneCostUsd = ev.costUsd;
          } else if (ev.type === "error") {
            finish("error", ev.msg || "Error");
            return;
          }
        } catch {
          /* skip */
        }
      }
    }
    finish("done", "Done");
  } catch {
    finish("error", "Connection error");
  }
}

/**
 * Called on mount for any job whose localStorage snapshot still says
 * "running" AND carries a serverId — meaning the backend job may well have
 * kept working the whole time the tab was gone (#background-jobs). Resets
 * this job's steps/text before replaying so the fresh full history from the
 * registry doesn't get appended after the stale pre-reload copy of the same
 * events, which would otherwise show every step twice.
 */
async function reconnectJob(job: Job, patch: Patch) {
  if (!job.serverId) return;
  patch(job.id, (j) => ({ ...j, steps: [{ kind: "status", label: "Reconnecting…", ts: Date.now() }], text: "" }));
  const opts: RunOpts = { title: job.title, subtitle: job.subtitle, page: job.page, input: job.input || "", kind: job.kind || "evaluate" };
  try {
    const res = await fetch(`/api/run/stream?id=${encodeURIComponent(job.serverId)}&after=0`);
    if (!res.ok || !res.body) {
      finishRun(job.id, opts, patch, "error", "Interrupted (page reloaded) — that run is no longer reachable.");
      return;
    }
    await consumeRunStream(job.id, res.body.getReader(), opts, patch);
  } catch {
    finishRun(job.id, opts, patch, "error", "Interrupted (page reloaded) — couldn't reconnect.");
  }
}

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const seq = useRef(0);
  const loaded = useRef(false);

  const patch = useCallback((id: string, fn: (j: Job) => Job) => {
    setJobs((js) => js.map((j) => (j.id === id ? fn(j) : j)));
  }, []);

  // restore history
  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOBS_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr)) {
        setJobs(arr);
        // A job left "running" survived a reload only in appearance — the fetch()
        // that was streaming it died with the tab. Its serverId is what tells us
        // whether the underlying work kept going too (#background-jobs): with
        // one, reconnect and pick the stream back up; without one (a job started
        // before this existed, or the CLI-missing early-return which never
        // reaches the server), it really is gone, so fall back to the old
        // "Interrupted" message.
        for (const j of arr as Job[]) {
          if (j.status !== "running") continue;
          if (j.serverId) {
            void reconnectJob(j, patch);
          } else {
            patch(j.id, (job) => ({
              ...job,
              status: "error",
              endedAt: Date.now(),
              steps: [...job.steps, { kind: "status", label: "Interrupted (page reloaded)", ts: Date.now() }],
            }));
          }
        }
      }
    } catch {
      /* ignore */
    }
    loaded.current = true;
    // patch is stable (useCallback with no deps); running this once on mount is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(JOBS_KEY, JSON.stringify(jobs.slice(0, 40)));
    } catch {
      /* quota */
    }
  }, [jobs]);

  const startJob = useCallback(
    (opts: StartOpts): string | null => {
      const id = `job-${Date.now()}-${seq.current++}`;
      const job: Job = {
        id,
        title: opts.title,
        subtitle: opts.subtitle,
        page: opts.page,
        input: opts.input,
        kind: opts.kind,
        batchId: opts.batchId,
        status: "running",
        steps: [{ kind: "status", label: "Starting…", ts: Date.now() }],
        text: "",
        startedAt: Date.now(),
      };
      setJobs((js) => [job, ...js]);

      (async () => {
        const cliId = readSavedCliId() || (await resolveCliId());
        if (!cliId) {
          patch(id, (j) => ({
            ...j,
            status: "error",
            endedAt: Date.now(),
            steps: [...j.steps, { kind: "status", label: "No CLI configured — open Config and click Save config", ts: Date.now() }],
          }));
          return;
        }
        try {
          const res = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: opts.kind, input: opts.input, cliId }),
          });
          if (!res.ok || !res.body) {
            const e = await res.json().catch(() => ({}));
            finishRun(id, opts, patch, "error", e.error || "Failed to start");
            return;
          }
          await consumeRunStream(id, res.body.getReader(), opts, patch);
        } catch {
          finishRun(id, opts, patch, "error", "Connection error");
        }
      })();

      return id;
    },
    [patch],
  );

  const removeJob = useCallback((id: string) => setJobs((js) => js.filter((j) => j.id !== id)), []);
  const clearFinished = useCallback(() => setJobs((js) => js.filter((j) => j.status === "running")), []);

  return <JobsContext.Provider value={{ jobs, startJob, removeJob, clearFinished }}>{children}</JobsContext.Provider>;
}
