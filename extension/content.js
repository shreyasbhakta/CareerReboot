// Runs in the page when the popup opens (injected after extractors.js). Reads only the page
// the user is looking at; it never navigates, clicks or fetches anything.
(() => {
  const MIN_CHARS = 200;
  const clean = (s) => (s || "").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const site = globalThis.CR_EXTRACTORS.find((e) => e.host.test(location.hostname));

  function fromSelectors() {
    for (const sel of site?.selectors ?? []) {
      const text = clean([...document.querySelectorAll(sel)].map((n) => n.innerText).join("\n\n"));
      if (text.length >= MIN_CHARS) return text;
    }
    return "";
  }

  // The container holding the most paragraph and list text, which on a job page is the JD.
  function largestBlock() {
    const totals = new Map();
    for (const el of document.querySelectorAll("p, li")) {
      const box = el.closest("article, main, section, div") ?? document.body;
      totals.set(box, (totals.get(box) ?? 0) + el.innerText.length);
    }
    let best = null;
    for (const [box, n] of totals) if (!best || n > best[1]) best = [box, n];
    return clean(best ? best[0].innerText : document.body.innerText);
  }

  function company() {
    for (const sel of site?.company ?? []) {
      const el = document.querySelector(sel);
      const name = clean(el?.getAttribute("alt") || el?.innerText).replace(/\s+logo$/i, "");
      if (name) return name;
    }
    const slug = { path: location.pathname.split("/")[1], subdomain: location.hostname.split(".")[0] }[site?.companyFrom];
    if (slug) return decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const t = document.title;
    return clean(
      / at ([^|\-–]+)/.exec(t)?.[1] ??
      /^[^|\-–]+[|\-–]\s*([^|\-–]+)/.exec(t)?.[1] ??
      "",
    ).slice(0, 80);
  }

  const selection = clean(String(getSelection()));
  const bySite = fromSelectors();
  const [text, source] = bySite
    ? [bySite, site.name]
    : selection.length >= MIN_CHARS
      ? [selection, "your selection"]
      : [largestBlock(), "the largest text block"];
  return { text, source, company: company(), title: document.title };
})();
