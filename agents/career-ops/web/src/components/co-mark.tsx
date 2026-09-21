import { instrumentSerif } from "@/lib/fonts";

// Brand mark — "CR" monogram on the indigo brand color, in the display
// typeface. Original to this app; not a copy of career-ops-docs' "co" mark.
export function CoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`${instrumentSerif.className} inline-flex shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        letterSpacing: "0.01em",
        lineHeight: 1,
      }}
    >
      CR
    </span>
  );
}
