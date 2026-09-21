import { fillSession, handoffSession, getSession } from "@/lib/apply/session";
import { resolveTailoredCv, resolveDefaultCv, companyFromTitle } from "@/lib/apply/cv";
import type { ApplyField } from "@/lib/apply/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Fill the real form behind the scenes (headed-but-off-screen), screenshotting
// each step for the "behind the scenes" strip, then bring the window to the front
// so the HUMAN reviews and submits. NEVER submits — there is no submit path here.
export async function POST(req: Request) {
  let body: {
    sessionId?: string;
    answers?: Record<string, string>;
    fields?: ApplyField[];
    handoff?: boolean;
    company?: string;
    application?: string;
    useDefaultCv?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const { sessionId, answers = {}, fields = [], handoff, company, application, useDefaultCv } = body;
  if (!sessionId) return Response.json({ error: "sessionId required" }, { status: 400 });
  if (company !== undefined && typeof company !== "string") {
    return Response.json({ error: "company must be a string" }, { status: 400 });
  }
  if (application !== undefined && typeof application !== "string") {
    return Response.json({ error: "application must be a string" }, { status: 400 });
  }

  // Resolve the CV server-side (never trust a client path). useDefaultCv is an
  // explicit, distinct choice ("Apply with Default Resume") — it never falls
  // back to a tailored CV, so the user always knows which resume was attached.
  const session = getSession(sessionId);
  const cvPath = useDefaultCv
    ? resolveDefaultCv() ?? undefined
    : (await resolveTailoredCv(company, application)) ?? (application ? null : await resolveTailoredCv(companyFromTitle(session?.title))) ?? undefined;

  try {
    const result = await fillSession(sessionId, answers, fields, cvPath);
    if (handoff) await handoffSession(sessionId).catch(() => {});
    return Response.json({ ...result, handedOff: !!handoff, cvAttached: !!cvPath });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 200) : "fill failed" }, { status: 500 });
  }
}
