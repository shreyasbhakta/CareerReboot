"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";

type Company = {
  name: string;
  careers_url?: string;
  api?: string;
  scan_method?: string;
  scan_query?: string;
  notes?: string;
  enabled?: boolean;
};

type FormState = { name: string; careers_url: string; notes: string; enabled: boolean };
const EMPTY_FORM: FormState = { name: "", careers_url: "", notes: "", enabled: true };

// Full CRUD over portals.yml's tracked_companies — add/edit/delete/enable-
// disable. Writes go through /api/portals/companies, a surgical per-entry
// text splice (see portals-companies.mjs) that never touches the rest of the
// file, so the user's own section comments in portals.yml survive every edit.
export function PortalCompaniesManager() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = () => {
    fetch("/api/portals/companies")
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies ?? []))
      .catch(() => setError("Could not load tracked companies."));
  };
  useEffect(load, []);

  const submitAdd = async () => {
    if (!addForm.name.trim() || !addForm.careers_url.trim()) {
      setError("Name and careers URL are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/portals/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addForm.name.trim(), careers_url: addForm.careers_url.trim(), notes: addForm.notes.trim() || undefined, enabled: addForm.enabled }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Could not add company.");
        return;
      }
      setAdding(false);
      setAddForm(EMPTY_FORM);
      load();
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (c: Company) => {
    setEditing(c.name);
    setEditForm({ name: c.name, careers_url: c.careers_url ?? c.api ?? "", notes: c.notes ?? "", enabled: c.enabled !== false });
    setError("");
  };

  const submitEdit = async (original: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/portals/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: original, patch: { name: editForm.name.trim(), careers_url: editForm.careers_url.trim(), notes: editForm.notes.trim() || undefined, enabled: editForm.enabled } }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Could not save changes.");
        return;
      }
      setEditing(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (c: Company) => {
    setBusy(true);
    try {
      await fetch("/api/portals/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: c.name, patch: { enabled: c.enabled === false } }),
      });
      load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    setBusy(true);
    try {
      await fetch(`/api/portals/companies?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      setConfirmDelete(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (companies === null) return <div className="text-sm text-muted">Loading tracked companies…</div>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg tracking-tight text-landing">Tracked companies ({companies.length})</h2>
        <button
          onClick={() => {
            setAdding((v) => !v);
            setError("");
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand"
        >
          <Plus className="size-3.5" /> Add company
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {adding && (
        <div className="mt-3 rounded-xl border border-border bg-surface/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Company name" className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-sm outline-none focus:border-brand/40" />
            <input value={addForm.careers_url} onChange={(e) => setAddForm({ ...addForm, careers_url: e.target.value })} placeholder="Careers URL" className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-sm outline-none focus:border-brand/40" />
            <input value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} placeholder="Notes (optional)" className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-sm outline-none focus:border-brand/40 sm:col-span-2" />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={submitAdd} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Add
            </button>
            <button onClick={() => setAdding(false)} className="text-xs text-muted hover:text-foreground">
              Cancel
            </button>
            <p className="ml-auto text-[11px] text-faint">The scanner picks up its ATS automatically from the URL — same detection `scan.mjs` uses.</p>
          </div>
        </div>
      )}

      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/30">
        {companies.map((c) => {
          const isEditing = editing === c.name;
          const isConfirmingDelete = confirmDelete === c.name;
          const enabled = c.enabled !== false;
          if (isEditing) {
            return (
              <li key={c.name} className="px-4 py-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-sm outline-none focus:border-brand/40" />
                  <input value={editForm.careers_url} onChange={(e) => setEditForm({ ...editForm, careers_url: e.target.value })} className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-sm outline-none focus:border-brand/40" />
                  <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes" className="rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-sm outline-none focus:border-brand/40 sm:col-span-2" />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button onClick={() => submitEdit(c.name)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-50">
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
                  </button>
                  <button onClick={() => setEditing(null)} className="text-xs text-muted hover:text-foreground">
                    Cancel
                  </button>
                </div>
              </li>
            );
          }
          return (
            <li key={c.name} className="flex items-center gap-3 px-4 py-2.5">
              <CompanyLogo name={c.name} size={20} />
              <span className={`shrink-0 text-sm font-medium ${enabled ? "" : "text-faint line-through"}`}>{c.name}</span>
              <span className="truncate font-mono text-xs text-faint">{c.careers_url ?? c.api ?? ""}</span>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {isConfirmingDelete ? (
                  <>
                    <button onClick={() => remove(c.name)} disabled={busy} className="rounded-md bg-red-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600 disabled:opacity-50">
                      Delete
                    </button>
                    <button onClick={() => setConfirmDelete(null)} className="rounded-md p-1 text-faint hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => toggleEnabled(c)}
                      disabled={busy}
                      title={enabled ? "Disable — stop scanning this company" : "Enable — resume scanning this company"}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${enabled ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-surface-hover text-faint"}`}
                    >
                      {enabled ? "enabled" : "disabled"}
                    </button>
                    <button onClick={() => startEdit(c)} title="Edit" className="rounded-md p-1 text-faint hover:bg-surface-hover hover:text-foreground">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(c.name)} title="Delete" className="rounded-md p-1 text-faint hover:bg-surface-hover hover:text-red-500">
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
