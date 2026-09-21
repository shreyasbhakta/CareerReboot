import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The user's real LaTeX resume source (config/profile.yml's `latex.source`,
// default resume.tex) — same resolution order as resolveLatexSource() in
// pdf-paths.mjs, but WITHOUT requiring the file to already exist: this route
// is how a user in `cv.output_format: latex` mode creates or edits it, so a
// first-time "file doesn't exist yet" must still resolve to a real target
// path rather than null.
function latexSourcePath(root: string): string {
  let rel = "resume.tex";
  try {
    const profile = yaml.load(fs.readFileSync(path.join(root, "config", "profile.yml"), "utf8")) as
      | { latex?: { source?: string } }
      | undefined;
    if (profile?.latex?.source) rel = profile.latex.source;
  } catch {
    /* missing/invalid profile.yml — fall back to the resume.tex default */
  }
  return path.join(root, rel);
}

const MAX_TEX_BYTES = 300_000;

export async function GET() {
  const file = latexSourcePath(careerOpsRoot());
  try {
    return NextResponse.json({ content: fs.readFileSync(file, "utf8"), exists: true, path: path.basename(file) });
  } catch {
    return NextResponse.json({ content: "", exists: false, path: path.basename(file) });
  }
}

export async function POST(req: Request) {
  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (Buffer.byteLength(body.content, "utf8") > MAX_TEX_BYTES) {
    return NextResponse.json({ error: "resume.tex is too large (over 300KB)" }, { status: 413 });
  }
  // DATA_CONTRACT: the user's LaTeX resume is user-layer and gitignored (no
  // git recovery) — never blind-overwrite, snapshot first, write atomically.
  try {
    const file = latexSourcePath(careerOpsRoot());
    const bak = atomicWriteWithBackup(file, body.content);
    return NextResponse.json({ ok: true, backedUp: !!bak });
  } catch {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
}
