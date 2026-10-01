import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { careerOpsRoot } from "@/lib/career-ops";

/**
 * Server-side glue for the Hiring Radar page. All real work happens in
 * agents/hiring-radar (the CLI); this module only resolves paths, edits the
 * gitignored .env / config.yml / crontab, and supervises ONE scan process.
 */

export const radarDir = () => path.resolve(/* turbopackIgnore: true */ careerOpsRoot(), "..", "hiring-radar");
export const radarScript = (name: string) => path.join(/* turbopackIgnore: true */ radarDir(), name);
export const dataDir = () =>
  process.env.HIRING_RADAR_DATA_DIR?.trim() ? path.resolve(process.env.HIRING_RADAR_DATA_DIR) : path.join(careerOpsRoot(), "data");
export const radarInstalled = () => fs.existsSync(radarScript("scan.mjs")) && fs.existsSync(path.join(radarDir(), "node_modules", "js-yaml"));

// ---- .env (secrets live here, never in config.yml, never returned to the browser) ----
export const ENV_KEYS = [
  "SEARXNG_URL", "BRAVE_SEARCH_API_KEY",
  "MODEL_PROVIDER", "MODEL_NAME", "MODEL_BASE_URL",
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "OMNIROUTE_API_KEY",
  "HIRING_RADAR_NOTIFY", "HIRING_RADAR_WEBHOOK_URL",
] as const;
export type EnvKey = (typeof ENV_KEYS)[number];
const SECRET = /(_KEY|WEBHOOK_URL)$/;
export const isSecret = (k: string) => SECRET.test(k);

const envPath = () => path.join(radarDir(), ".env");

function parseEnv(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of text.split("\n")) {
    const mm = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!mm) continue;
    let v = mm[2];
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    m.set(mm[1], v);
  }
  return m;
}

export function readEnv(): Map<string, string> {
  try { return parseEnv(fs.readFileSync(envPath(), "utf8")); } catch { return new Map(); }
}

/** Effective presence: radar .env, career-ops .env, or the server's own environment. */
export function envStatus(): Record<string, { set: boolean; value?: string }> {
  const own = readEnv();
  let shared = new Map<string, string>();
  try { shared = parseEnv(fs.readFileSync(path.join(careerOpsRoot(), ".env"), "utf8")); } catch { /* none */ }
  const out: Record<string, { set: boolean; value?: string }> = {};
  for (const k of ENV_KEYS) {
    const v = own.get(k) ?? shared.get(k) ?? process.env[k] ?? "";
    out[k] = { set: v.length > 0, ...(v && !isSecret(k) ? { value: v } : {}) };
  }
  return out;
}

/** updates: string = set, null = remove. Only allow-listed keys; other lines are preserved. */
export function writeEnv(updates: Record<string, string | null>) {
  let lines: string[] = [];
  try { lines = fs.readFileSync(envPath(), "utf8").split("\n"); } catch { /* new file */ }
  for (const [k, v] of Object.entries(updates)) {
    if (!(ENV_KEYS as readonly string[]).includes(k)) throw new Error(`unsupported key ${k}`);
    if (v !== null && /[\r\n]/.test(v)) throw new Error(`${k}: value must be a single line`);
    const idx = lines.findIndex((l) => new RegExp(`^\\s*${k}\\s*=`).test(l));
    if (v === null) { if (idx >= 0) lines.splice(idx, 1); continue; }
    const rendered = `${k}=${/^[A-Za-z0-9_./:@%+,-]*$/.test(v) ? v : JSON.stringify(v)}`;
    if (idx >= 0) lines[idx] = rendered; else lines.push(rendered);
  }
  const body = lines.filter((l, i, a) => !(l === "" && i === a.length - 1)).join("\n") + "\n";
  fs.writeFileSync(envPath(), body, { mode: 0o600 });
  fs.chmodSync(envPath(), 0o600);
}

// ---- config.yml (non-secret overrides) ----
export const configPath = () => path.join(radarDir(), "config.yml");
export const readLocalConfig = () => { try { return fs.readFileSync(configPath(), "utf8"); } catch { return ""; } };
export const readExampleConfig = () => { try { return fs.readFileSync(path.join(radarDir(), "config.example.yml"), "utf8"); } catch { return ""; } };

export function validateConfigText(yamlText: string): Promise<{ ok: boolean; error?: string }> {
  const tmp = path.join(radarDir(), `.config-check-${process.pid}-${Date.now()}.yml`);
  fs.writeFileSync(tmp, yamlText, { mode: 0o600 });
  return new Promise((resolve) => {
    execFile(process.execPath, [radarScript("scan.mjs"), "--check-config", tmp], { cwd: radarDir(), timeout: 15_000 }, (err, _out, stderr) => {
      fs.rmSync(tmp, { force: true });
      resolve(err ? { ok: false, error: String(stderr || err.message).replace(/\nFix .*$/s, "").trim().slice(0, 1500) } : { ok: true });
    });
  });
}

// ---- results ----
export function readResults(): { json: unknown; generatedAt: string | null } | null {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(dataDir(), "hiring-signals.json"), "utf8"));
    return { json, generatedAt: json.generatedAt ?? null };
  } catch { return null; }
}

export function connectionsFile() { return path.join(dataDir(), "Connections.csv"); }
export function connectionsInfo() {
  const f = process.env.LINKEDIN_CONNECTIONS_CSV?.trim() || connectionsFile();
  try {
    const t = fs.readFileSync(f, "utf8");
    return { present: true, rows: Math.max(0, t.split("\n").length - 4) };
  } catch { return { present: false, rows: 0 }; }
}

// ---- one-at-a-time scan runner ----
export type RunArgs = { days: number; minScore?: number; source: string; dryRun: boolean };
type Run = { id: string; startedAt: number; endedAt?: number; args: RunArgs; status: "running" | "ok" | "failed"; code?: number | null; log: string };
const g = globalThis as unknown as { __hrRun?: Run };

export const SOURCES = ["all", "jobs", "hiring-posts", "hn", "web-search"];

export function buildArgs(a: RunArgs): string[] {
  const args = ["--days", String(a.days), "--source", a.source];
  if (a.minScore !== undefined) args.push("--min-score", String(a.minScore));
  if (a.dryRun) args.push("--dry-run");
  return args;
}

export function currentRun(): Run | null { return g.__hrRun ?? null; }

export function startRun(a: RunArgs): Run {
  if (g.__hrRun?.status === "running") throw new Error("a scan is already running");
  const run: Run = { id: String(Date.now()), startedAt: Date.now(), args: a, status: "running", log: "" };
  g.__hrRun = run;
  const child = spawn(process.execPath, [radarScript("scan.mjs"), ...buildArgs(a)], { cwd: radarDir(), env: process.env });
  const add = (b: Buffer) => { run.log = (run.log + b.toString()).slice(-200_000); };
  child.stdout.on("data", add);
  child.stderr.on("data", add);
  const kill = setTimeout(() => child.kill("SIGTERM"), 15 * 60_000);
  child.on("error", (e) => { run.log += `\nfailed to start: ${e.message}\n`; run.status = "failed"; run.endedAt = Date.now(); clearTimeout(kill); });
  child.on("close", (code) => { clearTimeout(kill); run.code = code; run.status = code === 0 ? "ok" : "failed"; run.endedAt = Date.now(); });
  return run;
}

// ---- cron (user crontab, marked block) ----
const BEGIN = "# BEGIN careerreboot-hiring-radar";
const END = "# END careerreboot-hiring-radar";

export type Schedule = { enabled: boolean; hour: number; minute: number; days: string; scanDays: number; source: string; minScore?: number };

function sh(cmd: string, args: string[], input?: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const c = spawn(cmd, args);
    let out = "", err = "";
    // macOS can park `crontab -` behind a permission dialog; never hang the request on it.
    const timer = setTimeout(() => { c.kill("SIGKILL"); err = "timed out waiting for crontab — on macOS, approve the system permission prompt (or grant your terminal/app Full Disk Access) and try again"; resolve({ code: 124, out, err }); }, 20_000);
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    c.on("error", (e) => { clearTimeout(timer); resolve({ code: 127, out, err: e.message }); });
    c.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out, err }); });
    if (input !== undefined) c.stdin.end(input); else c.stdin.end();
  });
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function cronLine(s: Schedule): string {
  const args = buildArgs({ days: s.scanDays, minScore: s.minScore, source: s.source, dryRun: false }).join(" ");
  const log = path.join(dataDir(), "hiring-radar-cron.log");
  return `${s.minute} ${s.hour} * * ${s.days} cd ${q(radarDir())} && ${q(process.execPath)} scan.mjs ${args} >> ${q(log)} 2>&1`;
}

export async function readSchedule(): Promise<{ available: boolean; installed: boolean; line?: string; error?: string }> {
  const r = await sh("crontab", ["-l"]);
  if (r.code === 127) return { available: false, installed: false, error: "crontab is not available on this machine" };
  const text = r.code === 0 ? r.out : "";
  const m = text.match(new RegExp(`${BEGIN}\\n([\\s\\S]*?)\\n${END}`));
  return { available: true, installed: Boolean(m), line: m?.[1] };
}

export async function writeSchedule(s: Schedule | null): Promise<void> {
  const cur = await sh("crontab", ["-l"]);
  if (cur.code === 127) throw new Error("crontab is not available on this machine");
  let text = cur.code === 0 ? cur.out : "";
  text = text.replace(new RegExp(`${BEGIN}\\n[\\s\\S]*?\\n${END}\\n?`), "").replace(/\n+$/, "");
  if (s?.enabled) text += `${text ? "\n" : ""}${BEGIN}\n${cronLine(s)}\n${END}`;
  const r = await sh("crontab", ["-"], text ? text + "\n" : "\n");
  if (r.code !== 0) throw new Error(r.err.trim() || "crontab rejected the schedule (on macOS, allow your terminal/app in Privacy & Security → Full Disk Access if prompted)");
}

export function validateSchedule(b: unknown): Schedule {
  const o = (b ?? {}) as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number, name: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${name} must be an integer ${lo}-${hi}`);
    return n;
  };
  const days = String(o.days ?? "*");
  if (!/^(\*|[0-6](-[0-6])?(,[0-6](-[0-6])?)*)$/.test(days)) throw new Error("days must be * or weekday numbers like 1-5 or 1,3,5");
  const source = String(o.source ?? "all");
  if (!SOURCES.includes(source)) throw new Error("invalid source");
  const minScore = o.minScore === undefined || o.minScore === "" || o.minScore === null ? undefined : int(o.minScore, 0, 100, "minScore");
  return { enabled: Boolean(o.enabled), hour: int(o.hour, 0, 23, "hour"), minute: int(o.minute, 0, 59, "minute"), days, scanDays: int(o.scanDays ?? 7, 1, 30, "scanDays"), source, minScore };
}
