import fs from "node:fs";
import { configPath, validateConfigText } from "@/lib/hiring-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Saves config.yml (non-secret overrides) only if the scanner's own validator accepts it.
// Empty text removes the file (= back to config.example.yml defaults).
export async function POST(req: Request) {
  let b: { yaml?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const text = typeof b.yaml === "string" ? b.yaml : "";
  if (text.length > 100_000) return Response.json({ error: "config too large" }, { status: 413 });
  if (text.trim() === "") { fs.rmSync(configPath(), { force: true }); return Response.json({ ok: true, reset: true }); }
  const v = await validateConfigText(text);
  if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 422 });
  fs.writeFileSync(configPath(), text.endsWith("\n") ? text : text + "\n", { mode: 0o600 });
  return Response.json({ ok: true });
}
