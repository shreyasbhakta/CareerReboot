import { claudeNoToolsArgs } from "../claude-invocation.mjs";
import { spawnHeadlessCli } from "../spawn-cli.mjs";

const TIMEOUT_MS = 240_000;

/**
 * Run one prompt through the user's signed-in `claude` CLI with no tools and return its text.
 * @param {{binPath: string, cwd: string, prompt: string}} args
 * @returns {Promise<{ok: true, text: string} | {ok: false, status: number, error: string}>}
 */
export function runClaude({ binPath, cwd, prompt }) {
  return new Promise((resolve) => {
    const child = spawnHeadlessCli(binPath, claudeNoToolsArgs({ prompt }), { cwd, env: process.env });
    let out = "";
    let err = "";
    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(killer);
      resolve({ ok: false, status: 503, error: `Could not start Claude Code: ${e.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(killer);
      if (timedOut) return resolve({ ok: false, status: 504, error: `Claude took longer than ${TIMEOUT_MS / 1000}s and was stopped.` });
      let result;
      try {
        result = JSON.parse(out);
      } catch {
        result = null;
      }
      if (code !== 0 || !result || result.is_error || typeof result.result !== "string") {
        const detail = (typeof result?.result === "string" ? result.result : err).trim().slice(0, 300);
        return resolve({ ok: false, status: 502, error: `Claude Code failed${detail ? `: ${detail}` : ". Is it installed and signed in?"}` });
      }
      resolve({ ok: true, text: result.result });
    });
  });
}
