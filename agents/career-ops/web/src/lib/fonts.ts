import localFont from "next/font/local";

// Body / UI — Inter. The latin variable subset is vendored so an offline
// production build never contacts Google.
export const inter = localFont({
  src: [{
    path: "../assets/fonts/inter/Inter-Latin-Variable.woff2",
    weight: "100 900",
    style: "normal",
  }],
  variable: "--font-inter",
  display: "swap",
});

// Display — Space Grotesk, a geometric grotesque distinct from the
// upstream career-ops-docs identity (Instrument Serif on burnt orange).
// Names kept as `instrumentSerif*` since ~30 components already reference
// `instrumentSerif.className` / the `--font-instrument-serif*` CSS
// variables for "the display font" — repointing the export here recolors
// every one of those call sites without touching them individually.
// Space Grotesk ships no italic; the "italic" export below applies the same
// upright file with `style: "italic"`, so the few spots that use it get a
// browser-synthesized oblique rather than a true italic cut.
export const instrumentSerif = localFont({
  src: [{
    path: "../assets/fonts/space-grotesk/SpaceGrotesk-Latin-Variable.woff2",
    weight: "300 700",
    style: "normal",
  }],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const instrumentSerifItalic = localFont({
  src: [{
    path: "../assets/fonts/space-grotesk/SpaceGrotesk-Latin-Variable.woff2",
    weight: "300 700",
    style: "italic",
  }],
  variable: "--font-instrument-serif-italic",
  display: "swap",
});
