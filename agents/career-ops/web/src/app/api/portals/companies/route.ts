import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { listTrackedCompanies, addTrackedCompany, updateTrackedCompany, deleteTrackedCompany, PortalsCompaniesError } from "@/lib/portals-companies.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function file() {
  return path.join(careerOpsRoot(), "portals.yml");
}

function errorStatus(kind: string): number {
  if (kind === "not-found") return 404;
  if (kind === "duplicate" || kind === "invalid") return 400;
  return 500;
}

export async function GET() {
  try {
    return Response.json({ companies: listTrackedCompanies(file()) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "could not read portals.yml" }, { status: 500 });
  }
}

// Adds one entry to portals.yml's tracked_companies list. Surgical write (see
// portals-companies.mjs) — every other block and comment in the file is
// untouched.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  try {
    const entry = addTrackedCompany(file(), body);
    return Response.json({ ok: true, company: entry });
  } catch (e) {
    if (e instanceof PortalsCompaniesError) return Response.json({ error: e.message }, { status: errorStatus(e.kind) });
    return Response.json({ error: e instanceof Error ? e.message : "write failed" }, { status: 500 });
  }
}

// Edits (or enables/disables) one entry by name. Body: { name, patch: {...} }
// — patch is merged into the existing entry, so unspecified fields survive.
export async function PATCH(req: Request) {
  let body: { name?: string; patch?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  try {
    const entry = updateTrackedCompany(file(), name, body.patch ?? {});
    return Response.json({ ok: true, company: entry });
  } catch (e) {
    if (e instanceof PortalsCompaniesError) return Response.json({ error: e.message }, { status: errorStatus(e.kind) });
    return Response.json({ error: e instanceof Error ? e.message : "write failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  try {
    deleteTrackedCompany(file(), name);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof PortalsCompaniesError) return Response.json({ error: e.message }, { status: errorStatus(e.kind) });
    return Response.json({ error: e instanceof Error ? e.message : "delete failed" }, { status: 500 });
  }
}
