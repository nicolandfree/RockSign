import nacl from "tweetnacl";
import bs58 from "bs58";
import type { Agreement, Milestone, Party, Signature } from "./types.ts";

// Stable JSON: sorted keys, no whitespace. Same agreement => same bytes => same hash.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function agreementHash(a: Agreement): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(a));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// What the wallet shows and signs. Human-readable, and it commits to the full hash.
export function agreementMessage(hash: string, title: string, role: Party["role"]): string {
  return [
    "RockSign agreement v1",
    `Title: ${title}`,
    `SHA-256: ${hash}`,
    `I agree to every term of this agreement as the ${role === "provider" ? "service provider" : "client"}.`,
  ].join("\n");
}

export function verifySignature(hash: string, title: string, sig: Signature): boolean {
  try {
    const msg = new TextEncoder().encode(agreementMessage(hash, title, sig.role));
    return nacl.sign.detached.verify(msg, bs58.decode(sig.signature), bs58.decode(sig.pubkey));
  } catch {
    return false;
  }
}

export const MEMO_PREFIX = "rocksign:v1";

// On-chain record: hash + both signers + both signatures, so anyone can re-verify from the tx alone.
export function sealMemo(hash: string, sigs: Signature[]): string {
  const p = sigs.find((s) => s.role === "provider");
  const c = sigs.find((s) => s.role === "client");
  if (!p || !c) throw new Error("Both parties must sign before sealing.");
  return [MEMO_PREFIX, hash, p.pubkey, p.signature, c.pubkey, c.signature].join(":");
}

export function parseSealMemo(memo: string): { hash: string; sigs: Signature[] } | null {
  const i = memo.indexOf(MEMO_PREFIX);
  if (i < 0) return null;
  const [, , hash, pk, ps, ck, cs] = memo.slice(i).split(":");
  if (!hash || !pk || !ps || !ck || !cs) return null;
  return {
    hash,
    sigs: [
      { role: "provider", pubkey: pk, signature: ps, signedAt: "" },
      { role: "client", pubkey: ck, signature: cs, signedAt: "" },
    ],
  };
}

// The provider signs this when the work is handed over; it unlocks the payment due on delivery.
export function deliveryMessage(hash: string, title: string): string {
  return ["RockSign delivery v1", `Title: ${title}`, `SHA-256: ${hash}`, "I delivered the work described in this agreement."].join("\n");
}

export function verifyDelivery(hash: string, title: string, sig: Signature): boolean {
  try {
    const msg = new TextEncoder().encode(deliveryMessage(hash, title));
    return nacl.sign.detached.verify(msg, bs58.decode(sig.signature), bs58.decode(sig.pubkey));
  } catch {
    return false;
  }
}

// The payment plan agreed on the call, as the two moments money changes hands.
export function milestones(a: Agreement): Milestone[] {
  if (!a.payment) return [];
  const upfront = Math.round(a.payment.total * a.payment.upfrontPercent) / 100;
  const rest = Math.round((a.payment.total - upfront) * 100) / 100;
  const out: Milestone[] = [];
  if (upfront > 0) out.push({ n: 1, label: `Upfront (${a.payment.upfrontPercent}%)`, amount: upfront, due: "signing" });
  if (rest > 0) out.push({ n: 2, label: upfront > 0 ? `On delivery (${100 - a.payment.upfrontPercent}%)` : "On delivery", amount: rest, due: "delivery" });
  return out;
}
