import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { Agreement, Signature } from "./types.ts";

// The whole agreement travels in the link (#/a/<data>): no server stores it.
export interface Envelope {
  agreement: Agreement;
  signatures: Signature[];
  sealTx?: string;
}

export const encodeEnvelope = (e: Envelope) => compressToEncodedURIComponent(JSON.stringify(e));

export function decodeEnvelope(data: string): Envelope | null {
  try {
    const json = decompressFromEncodedURIComponent(data);
    return json ? (JSON.parse(json) as Envelope) : null;
  } catch {
    return null;
  }
}

export const envelopeLink = (e: Envelope) => `${location.origin}${location.pathname}#/a/${encodeEnvelope(e)}`;
