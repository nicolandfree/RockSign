import type { Agreement, Segment, Term, TermKind } from "./types.ts";

// What Claude returns. Quotes point at transcript lines by index, not by seconds:
// the model is reliable at picking lines, and the line index gives us exact times.
export interface Extraction {
  title: string;
  provider: { name: string; company: string | null };
  client: { name: string; company: string | null };
  terms: {
    kind: TermKind;
    label: string;
    value: string;
    firstLine: number;
    lastLine: number;
  }[];
  payment: { totalUsd: number; upfrontPercent: number } | null;
  consentGiven: boolean;
}

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "provider", "client", "terms", "payment", "consentGiven"],
  properties: {
    title: { type: "string", description: "Short agreement title, e.g. 'Landing page redesign + launch social pieces'" },
    provider: {
      type: "object",
      additionalProperties: false,
      required: ["name", "company"],
      properties: { name: { type: "string" }, company: { type: ["string", "null"] } },
    },
    client: {
      type: "object",
      additionalProperties: false,
      required: ["name", "company"],
      properties: { name: { type: "string" }, company: { type: ["string", "null"] } },
    },
    terms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label", "value", "firstLine", "lastLine"],
        properties: {
          kind: { type: "string", enum: ["deliverables", "deadline", "fee", "payment", "revisions", "handoff", "start", "other"] },
          label: { type: "string" },
          value: { type: "string" },
          firstLine: { type: "integer" },
          lastLine: { type: "integer" },
        },
      },
    },
    payment: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["totalUsd", "upfrontPercent"],
      properties: { totalUsd: { type: "number" }, upfrontPercent: { type: "number" } },
    },
    consentGiven: { type: "boolean" },
  },
} as const;

export const EXTRACTION_SYSTEM = `You turn the transcript of a call between a freelancer (the provider) and a client into the terms of a written agreement.

The transcript comes from automatic speech recognition, so expect misheard words ("RCO" for "our CEO", odd spellings of product names). Read through them; never copy an obvious mishearing into a term.

Rules:
- Only include terms both people actually agreed to on the call. A proposal counts once the other side accepts it, explicitly or by moving on without objection. Never invent amounts, dates or deliverables.
- One term per kind when possible: deliverables, deadline, fee, payment (schedule), revisions, handoff (files/rights delivered), start (start date). Use "other" for anything else that was agreed.
- "value" is the clause as it should read in the contract: specific, third person, plain English. Example: "Provider will deliver the final files and the Figma source by Friday, October 23."
- "firstLine"/"lastLine" are the transcript line numbers where that term was said and agreed (the proposal and, if separate, the acceptance). Keep the range tight.
- "payment" is the total fee in USD and the share due upfront (0 if nothing upfront). null if no fee was agreed.
- "consentGiven" is true only if someone said the call is being recorded and the other person agreed.
- Names: use the names people use on the call; company if mentioned, else null. The provider is the person offering the service.
- Language: write "title", "label" and "value" in the language spoken on the call (for a call in Spanish, the clauses are in Spanish). Amounts in the payment field are always numbers in USD.`;

export function transcriptForPrompt(segments: Segment[]): string {
  return segments.map((s, i) => `[${i}] (${fmt(s.start)}) ${s.text}`).join("\n");
}

export function toAgreement(x: Extraction, segments: Segment[], recordingSha256: string, audioUrl?: string): Agreement {
  const clamp = (i: number) => Math.min(Math.max(i, 0), segments.length - 1);
  const terms: Term[] = x.terms.map((t) => {
    const a = clamp(t.firstLine);
    const b = clamp(Math.max(t.lastLine, t.firstLine));
    return {
      kind: t.kind,
      label: t.label,
      value: t.value,
      quote: segments.slice(a, b + 1).map((s) => s.text).join(" "),
      start: segments[a].start,
      end: segments[b].end,
    };
  });
  return {
    version: 1,
    title: x.title,
    createdAt: new Date().toISOString().slice(0, 10),
    parties: [
      { role: "provider", name: x.provider.name, company: x.provider.company ?? undefined },
      { role: "client", name: x.client.name, company: x.client.company ?? undefined },
    ],
    terms,
    payment: x.payment ? { currency: "USDC", total: x.payment.totalUsd, upfrontPercent: x.payment.upfrontPercent } : null,
    recordingSha256,
    audioUrl,
  };
}

export const EXTRACTION_MODEL = "claude-opus-5-5";

// Runs in the browser with the user's own key; the key never leaves their machine except to api.anthropic.com.
export async function extractWithClaude(apiKey: string, segments: Segment[]): Promise<Extraction> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
    system: EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: `Transcript:\n${transcriptForPrompt(segments)}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to process this transcript.");
  if (response.stop_reason === "max_tokens") throw new Error("The transcript is too long to process in one pass.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no terms.");
  return JSON.parse(text.text) as Extraction;
}

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
