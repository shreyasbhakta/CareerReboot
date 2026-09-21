import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";

const run = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HmResult =
  | { ok: true; company: string; role: string | null; query: string; candidates: { name: string; title: string; url: string; score: number }[]; verification: "unconfirmed"; note: string }
  | { ok: false; error: string };

// Orchestrates the core's find-hiring-manager.mjs (SearXNG-backed) — real
// candidates via web search, never a guess dressed up as a result. The core
// script already reports "SearXNG isn't running" as a clear ok:false rather
// than a stack trace; this route just forwards that.
export async function POST(req: Request) {
  let body: { company?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const company = typeof body.company === "string" ? body.company.trim() : "";
  if (!company) return Response.json({ ok: false, error: "company is required" }, { status: 400 });
  const role = typeof body.role === "string" ? body.role.trim() : "";

  const script = rootScript("find-hiring-manager");
  if (!fs.existsSync(script)) {
    return Response.json({ ok: false, error: "find-hiring-manager.mjs not found in this checkout." }, { status: 500 });
  }

  const args = [script, "--company", company, "--json"];
  if (role) args.push("--role", role);

  try {
    const { stdout } = await run(process.execPath, args, { cwd: careerOpsRoot(), timeout: 20_000, maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout) as HmResult;
    return Response.json(parsed, { status: parsed.ok ? 200 : 502 });
  } catch (e) {
    // execFile rejects with the child's stdout/stderr attached even on a
    // non-zero exit (the script's own --json error path exits 1) — recover
    // the structured error from stdout when present instead of collapsing it
    // to a generic message.
    const stdout = (e as { stdout?: string })?.stdout;
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout) as HmResult;
        return Response.json(parsed, { status: 502 });
      } catch {
        /* fall through to generic error below */
      }
    }
    return Response.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "find-hiring-manager.mjs failed" }, { status: 500 });
  }
}
