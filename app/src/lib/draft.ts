import type { Agreement, Segment } from "./types.ts";

// The agreement being reviewed before the provider signs. Kept in sessionStorage so a reload keeps it.
export interface Draft {
  agreement: Agreement;
  segments: Segment[];
  audioUrl?: string; // object URL for uploads (this tab only) or the public sample
  note?: string;
}

let current: Draft | null = null;

export function setDraft(d: Draft) {
  current = d;
  try { sessionStorage.setItem("rocksign.draft", JSON.stringify(d)); } catch { /* storage blocked */ }
}

export function getDraft(): Draft | null {
  if (current) return current;
  try {
    const raw = sessionStorage.getItem("rocksign.draft");
    current = raw ? (JSON.parse(raw) as Draft) : null;
  } catch { current = null; }
  return current;
}
