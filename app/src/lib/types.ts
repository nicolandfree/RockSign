export interface Segment {
  start: number; // seconds
  end: number;
  text: string;
}

export type TermKind = "deliverables" | "deadline" | "fee" | "payment" | "revisions" | "handoff" | "start" | "other";

export interface Term {
  kind: TermKind;
  label: string; // "Payment terms"
  value: string; // the clause, written as a contract term
  quote: string; // the words said on the call
  start: number; // where the quote starts in the recording (s)
  end: number;
}

export interface Party {
  role: "provider" | "client";
  name: string;
  company?: string;
}

export interface PaymentPlan {
  currency: "USDC";
  total: number;
  upfrontPercent: number; // 0-100
}

export interface Agreement {
  version: 1;
  title: string;
  createdAt: string; // ISO date
  parties: Party[];
  terms: Term[];
  payment: PaymentPlan | null;
  recordingSha256: string; // hash of the audio the terms were taken from
  audioUrl?: string; // public recording, when there is one (the sample call)
  language?: "en" | "es"; // language of the call and of the clauses
}

export interface Signature {
  role: Party["role"];
  pubkey: string; // base58
  signature: string; // base58 ed25519 signature over agreementMessage()
  signedAt: string;
}

export interface Milestone {
  n: 1 | 2;
  label: string;
  amount: number; // USDC
  due: "signing" | "delivery";
}
