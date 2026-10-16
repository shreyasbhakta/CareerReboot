import { careerOpsRoot } from "@/lib/career-ops";
import { listVariants, readTailorConfig } from "@/lib/resume/variants.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The base variants the extension's dropdown offers: every .tex in the variants folder.
export async function GET() {
  const cfg = readTailorConfig(careerOpsRoot());
  const variants = listVariants(cfg.variantsDir);
  const fallback = variants[0] ?? null;
  return Response.json({
    variants,
    default: cfg.defaultVariant && variants.includes(cfg.defaultVariant) ? cfg.defaultVariant : fallback,
  });
}
