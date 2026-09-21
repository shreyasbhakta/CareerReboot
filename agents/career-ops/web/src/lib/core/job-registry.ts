/**
 * job-registry.ts — server-side background job store shared by /api/run and
 * /api/explore.
 *
 * Both routes used to hold a worker's whole lifetime inside a single HTTP
 * response's ReadableStream: closing the browser tab (or losing wifi, or the
 * laptop sleeping) fired the stream's `cancel()`, which SIGTERM'd the child
 * process outright — killing a real evaluation or scan mid-run just because
 * nobody's fetch() was around to read the bytes anymore. That is the literal
 * cause behind "scan jobs is not working" (a scan killed by its own timeout
 * before ever emitting output looks identical to one killed by a tab close).
 *
 * This registry decouples "the job is alive" from "someone is watching it":
 * a job is created once, runs to its own completion or its own timeout
 * (never a disconnect), and every event it emits is buffered in order. Any
 * number of HTTP responses can subscribe to it — from the start, or resuming
 * after a given cursor — including a browser tab that reopens minutes later.
 *
 * A plain module-level Map would be wiped on every Next.js dev hot-reload
 * (each edit recompiles this module), silently orphaning in-flight jobs and
 * their child processes. Stashing it on `globalThis` survives recompiles —
 * the process itself (not the module instance) owns the registry.
 */
import type { ChildProcess } from "node:child_process";

export type JobStatus = "running" | "done" | "error";

export type JobRecord<E = unknown> = {
  id: string;
  kind: string;
  status: JobStatus;
  events: E[];
  listeners: Set<(e: E) => void>;
  createdAt: number;
  finishedAt?: number;
  /** Set by the route once it spawns the child, so an explicit stop can reach it. Never invoked by a stream disconnect. */
  kill?: () => void;
};

type Registry = Map<string, JobRecord<unknown>>;

const REGISTRY_KEY = "__careerOpsJobRegistry__";
const CLEANUP_AFTER_MS = 2 * 60 * 60 * 1000; // finished jobs are kept 2h so a reopened tab can still read the outcome

function registry(): Registry {
  const g = globalThis as unknown as { [REGISTRY_KEY]?: Registry };
  if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new Map();
  return g[REGISTRY_KEY];
}

function cleanup() {
  const now = Date.now();
  for (const [id, job] of registry()) {
    if (job.status !== "running" && job.finishedAt && now - job.finishedAt > CLEANUP_AFTER_MS) {
      registry().delete(id);
    }
  }
}

export function createJob<E = unknown>(kind: string): JobRecord<E> {
  cleanup();
  const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: JobRecord<E> = { id, kind, status: "running", events: [], listeners: new Set(), createdAt: Date.now() };
  registry().set(id, job as JobRecord<unknown>);
  return job;
}

export function getJob<E = unknown>(id: string): JobRecord<E> | undefined {
  return registry().get(id) as JobRecord<E> | undefined;
}

/** Buffer + broadcast one event. Safe to call after listeners have gone away — buffering never depends on a subscriber being present. */
export function emitJob<E>(job: JobRecord<E>, event: E) {
  job.events.push(event);
  for (const fn of job.listeners) {
    try {
      fn(event);
    } catch {
      /* a bad subscriber must never break the job it's watching */
    }
  }
}

export function finishJob<E>(job: JobRecord<E>, status: "done" | "error") {
  if (job.status !== "running") return; // idempotent — close()/child.on("close") can race a timeout
  job.status = status;
  job.finishedAt = Date.now();
}

/**
 * Replay everything buffered from `sinceIndex` onward, then keep forwarding
 * new events live. Returns an unsubscribe function — calling it detaches
 * this listener only. It never touches the job itself: unsubscribing (e.g. a
 * browser tab closing) must not stop or kill the underlying work.
 */
export function subscribeJob<E>(job: JobRecord<E>, sinceIndex: number, onEvent: (e: E) => void): () => void {
  for (let i = sinceIndex; i < job.events.length; i++) onEvent(job.events[i]);
  job.listeners.add(onEvent);
  return () => job.listeners.delete(onEvent);
}

/** Explicit user-requested stop only — never wire this to a stream's cancel(). */
export function stopJob(id: string): boolean {
  const job = getJob(id);
  if (!job || job.status !== "running" || !job.kill) return false;
  job.kill();
  return true;
}

export type SerializableJobRef = { id: string; kind: string };
export function jobRef(job: JobRecord<unknown>): SerializableJobRef {
  return { id: job.id, kind: job.kind };
}

/** Attach the child so stopJob() can reach it; store on the JobRecord returned by createJob. */
export function attachKill<E>(job: JobRecord<E>, child: ChildProcess) {
  job.kill = () => {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already dead */
    }
  };
}
