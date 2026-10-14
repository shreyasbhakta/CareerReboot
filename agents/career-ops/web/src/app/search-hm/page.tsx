import { Suspense } from "react";
import { UserSearch } from "lucide-react";
import { SearchHmView } from "@/components/search-hm/search-hm-view";

export const dynamic = "force-dynamic";

export default function SearchHmPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center gap-3">
        <UserSearch className="size-6 text-brand" />
        <h1 className="font-display text-2xl tracking-tight text-landing">Search HM</h1>
      </div>
      <p className="mt-1.5 max-w-2xl text-sm text-muted">
        Paste a job link. The posting is read, then searched across every public source you have set up to find the
        likely hiring manager, recruiter or poster, each with the evidence and links behind it. Leads only: confirm before reaching out.
      </p>
      <div className="mt-6">
        <Suspense>
          <SearchHmView />
        </Suspense>
      </div>
    </div>
  );
}
