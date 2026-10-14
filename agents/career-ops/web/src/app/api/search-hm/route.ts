import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { radarDir, radarScript, radarInstalled, dataDir, envStatus } from "@/lib/hiring-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runs agents/hiring-radar/search-hm.mjs; the CLI owns all fetching, searching and ranking.
const TIMEOUT_MS = 4 * 60_000;
const OVERRIDES = ["company", "title", "location", "team"] as const;
const PROVIDER_KEYS = ["SEARXNG_URL", "BRAVE_SEARCH_API_KEY", "SERPER_API_KEY", "EXA_API_KEY", "HUNTER_API_KEY", "MODEL_PROVIDER"] as const;

const historyFile = () => path.join(dataDir(), "search-hm.json");

export async function GET() {
  let history: unknown[] = [];
  try { history = JSON.parse(fs.readFileSync(historyFile(), "utf8")); } catch { /* no searches yet */ }
  const env = envStatus();
  return Response.json({
    installed: radarInstalled(),
    history: Array.isArray(history) ? history : [],
    providers: Object.fromEntries(PROVIDER_KEYS.map((k) => [k, env[k]?.set ?? false])),
  });
}

function runCli(args: string[], stdin: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [radarScript("search-hm.mjs"), ...args], { cwd: radarDir(), env: process.env });
    let out = "", err = "";
    const kill = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err = (err + d).slice(-20_000)));
    child.on("error", (e) => { clearTimeout(kill); resolve({ code: 127, out, err: e.message }); });
    child.on("close", (code) => { clearTimeout(kill); resolve({ code, out, err }); });
    child.stdin.end(stdin);
  });
}

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) return Response.json({ ok: false, error: "Paste a full job URL (https://…)." }, { status: 400 });
  if (!radarInstalled()) return Response.json({ ok: false, error: "Hiring Radar is not installed. Run `npm run setup` from the repo root." }, { status: 500 });

  const args = [url, "--json"];
  for (const k of OVERRIDES) {
    const v = typeof b[k] === "string" ? (b[k] as string).trim().slice(0, 200) : "";
    if (v) args.push(`--${k}`, v);
  }
  const jd = typeof b.jdText === "string" ? b.jdText.slice(0, 50_000) : "";
  if (jd.trim()) args.push("--jd-stdin");
  if (b.noLlm === true) args.push("--no-llm");

  const r = await runCli(args, jd);
  const line = r.out.trim().split("\n").pop() || "";
  try {
    const parsed = JSON.parse(line);
    return Response.json(parsed, { status: parsed.ok ? 200 : 502 });
  } catch {
    const detail = r.code === null ? "timed out" : r.err.trim().split("\n").slice(-3).join(" ");
    return Response.json({ ok: false, error: `Search HM failed: ${detail || `exit ${r.code}`}`.slice(0, 600) }, { status: 500 });
  }
}
