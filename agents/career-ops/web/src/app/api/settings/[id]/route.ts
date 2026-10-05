import { findSettingsDoc, MAX_SETTINGS_BYTES, removeSettings, validateSettingsText, writeSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PUT { yaml }: validate, then write the local file (previous version kept as .bak).
export async function PUT(req: Request, { params }: Ctx) {
  const doc = findSettingsDoc((await params).id);
  if (!doc) return Response.json({ error: "unknown settings file" }, { status: 404 });
  let body: { yaml?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  if (typeof body.yaml !== "string" || !body.yaml.trim()) return Response.json({ error: "yaml must be a non-empty string" }, { status: 400 });
  if (body.yaml.length > MAX_SETTINGS_BYTES) return Response.json({ error: "file too large" }, { status: 413 });
  const problem = await validateSettingsText(doc, body.yaml);
  if (problem) return Response.json({ error: problem }, { status: 422 });
  try {
    return Response.json({ ok: true, backup: writeSettings(doc, body.yaml) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "write failed" }, { status: 500 });
  }
}

// DELETE: drop the local file so the flow falls back to its example (backup kept).
export async function DELETE(_req: Request, { params }: Ctx) {
  const doc = findSettingsDoc((await params).id);
  if (!doc) return Response.json({ error: "unknown settings file" }, { status: 404 });
  try {
    return Response.json({ ok: true, backup: removeSettings(doc) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "remove failed" }, { status: 500 });
  }
}
