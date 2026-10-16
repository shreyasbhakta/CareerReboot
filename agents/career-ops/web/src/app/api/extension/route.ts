import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const run = promisify(execFile);

// The Chrome extension lives at the repo root (extension/), two levels above career-ops.
function extensionDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "..", "..", "extension");
}

// The resume tailor extension as a zip, for the Config page's download button.
export async function GET() {
  const dir = extensionDir();
  if (!fs.existsSync(path.join(dir, "manifest.json"))) {
    return Response.json({ error: "The extension/ folder isn't in this checkout." }, { status: 404 });
  }
  try {
    const { stdout } = await run("zip", ["-q", "-r", "-X", "-", "."], { cwd: dir, encoding: "buffer", maxBuffer: 5 * 1024 * 1024 });
    return new Response(new Uint8Array(stdout), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="careerreboot-resume-tailor.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    return Response.json(
      { error: missing ? `zip is not installed. Load the folder directly instead: ${dir}` : "Could not package the extension." },
      { status: missing ? 503 : 500 },
    );
  }
}
