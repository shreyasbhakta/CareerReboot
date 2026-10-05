import Link from "next/link";
import { instrumentSerif } from "@/lib/fonts";

export const metadata = { title: "Legal & attributions · CareerReboot" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-8 text-lg font-semibold text-foreground">{children}</h2>;

export default function LegalPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-muted">
      <Link href="/" className="text-xs text-brand hover:underline">← Back</Link>
      <h1 className={`${instrumentSerif.className} mt-3 text-4xl text-landing`}>Legal &amp; attributions</h1>
      <p className="mt-2 text-faint">CareerReboot v2 · software provided “as is”, under the Apache License 2.0, without warranty of any kind.</p>

      <H>What this software is</H>
      <p>A local tool. It runs on your machine, stores your data in files on your machine, and calls only the services you configure. It does not operate a hosted service, collect telemetry, or act on your behalf: nothing is ever submitted, applied to, or sent without you doing it yourself.</p>

      <H>No affiliation</H>
      <p>CareerReboot is independent. It is not affiliated with, endorsed by, or sponsored by LinkedIn, Indeed, Y Combinator / Hacker News, Greenhouse, Lever, Ashby, Workday, Brave, Anthropic, Google, OpenAI, or any employer named in results. All trademarks belong to their owners and are used only to identify the services whose public data or APIs the tool reads.</p>

      <H>Data sources and their terms</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Job data comes from public, documented endpoints (employer ATS job-board APIs and the public Hacker News API) and from a search provider you configure (Brave Search API or your own SearXNG). Use of each is subject to that provider’s terms and rate limits; the tool throttles and caches requests.</li>
        <li>LinkedIn is never logged into, scraped, or automated. Warm-introduction matching uses only the connections export you download from your own account; “friends of friends” links open LinkedIn’s own search in your browser.</li>
        <li>Posts and listings remain the property of their authors and employers. Only short excerpts and links are stored, for your personal use. Do not redistribute collected data.</li>
      </ul>

      <H>Personal data and privacy</H>
      <p>Your CV, profile, connections export, results and keys are stored locally and excluded from version control. Data leaves your machine only when you choose to: search queries go to your search provider; if you enable a model provider, short post excerpts and a summary of target roles and skills (never your email, phone or full CV) go to that provider; if you set a webhook, result summaries go to it. The background video is streamed from a third-party CDN; turn it off in Settings → Appearance to avoid that request. You are the data controller for any personal data of third parties you collect, including your connections list. Delete it when you no longer need it.</p>

      <H>AI-generated content</H>
      <p>Scores, summaries, drafts and tailored documents may be incomplete, outdated or wrong. Verify every fact before using it in an application or message. You are responsible for what you submit or send.</p>

      <H>Not professional advice</H>
      <p>Visa, immigration, sponsorship and compensation information is informational only and is not legal, immigration or financial advice. Consult a qualified professional.</p>

      <H>Open-source attributions</H>
      <p>Built on career-ops by Santiago Fernández de Valderrama (MIT) and ResumeSkills (MIT); see <code>THIRD_PARTY_NOTICES.md</code>. Runtime libraries include Next.js, React, Tailwind CSS, Motion (MIT), lucide-react, js-yaml and Playwright. The v2 visual design draws on UI UX Pro Max by Next Level Builder (MIT) as a reference; no code is copied. The background video is streamed from its host, not redistributed; rights remain with its creator. Full citations are in the README.</p>
    </main>
  );
}
