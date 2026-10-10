import { Buffer } from "buffer";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import bs58 from "bs58";
import { FEE_BPS, MEMO_PROGRAM_ID, RPC_URL, USDC_MINT, feeOf } from "../config/chain.ts";
import { agreementHash, agreementMessage, deliveryMessage, parseSealMemo, verifySignature } from "./agreement.ts";
import type { Envelope } from "./share.ts";
import type { Signer } from "./signer.ts";
import type { Agreement, Party, Signature } from "./types.ts";

export const connection = new Connection(RPC_URL, "confirmed");

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `${path} returned ${res.status}` }));
  if (!res.ok || data.error) throw new Error(data.error ?? `${path} failed`);
  return data as T;
}

export async function signAgreement(a: Agreement, role: Party["role"], signer: Signer): Promise<Signature> {
  const hash = await agreementHash(a);
  const sig = await signer.signMessage(new TextEncoder().encode(agreementMessage(hash, a.title, role)));
  return { role, pubkey: signer.pubkey, signature: bs58.encode(sig), signedAt: new Date().toISOString() };
}

export const seal = (envelope: Envelope) => api<{ tx: string; hash: string }>("/api/seal", { envelope });
export const faucet = (owner: string) => api<{ tx: string }>("/api/faucet", { owner });

export const payMemo = (hash: string, n: number) => `rocksign:pay:${hash.slice(0, 32)}:${n}`;

// Solana Pay transaction request: any wallet app scans the QR, fetches the split payment
// (99% provider, 1% RockSign) from /api/solana-pay, signs it, and RockSign pays the gas.
export async function solanaPayUrl(a: Agreement, providerPubkey: string, n: number, amount: number): Promise<string> {
  const q = new URLSearchParams({ to: providerPubkey, amount: String(amount), memo: payMemo(await agreementHash(a), n) });
  return `solana:${encodeURIComponent(`${location.origin}/api/solana-pay?${q.toString()}`)}`;
}

export async function usdcBalance(owner: string): Promise<number> {
  try {
    const acc = await getAccount(connection, getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(owner)));
    return Number(acc.amount) / 1e6;
  } catch {
    return 0;
  }
}

// Builds a milestone payment: 99% to the provider, 1% RockSign fee, and the memo that ties it to
// the agreement. Shared by the in-app payment and the Solana Pay transaction request.
export function buildPaymentTx(opts: { payer: PublicKey; provider: PublicKey; treasury: PublicKey; feePayer: PublicKey; amount: number; memo: string }): Transaction {
  const mint = new PublicKey(USDC_MINT);
  const total = BigInt(Math.round(opts.amount * 1e6));
  const fee = BigInt(Math.round(feeOf(opts.amount) * 1e6));
  const from = getAssociatedTokenAddressSync(mint, opts.payer);
  const tx = new Transaction({ feePayer: opts.feePayer });
  tx.add(createTransferCheckedInstruction(from, mint, getAssociatedTokenAddressSync(mint, opts.provider), opts.payer, total - fee, 6));
  if (fee > 0n) tx.add(createTransferCheckedInstruction(from, mint, getAssociatedTokenAddressSync(mint, opts.treasury), opts.payer, fee, 6));
  tx.add(new TransactionInstruction({ programId: new PublicKey(MEMO_PROGRAM_ID), keys: [], data: Buffer.from(opts.memo, "utf8") }));
  return tx;
}

// Client pays in the app; the RockSign sponsor covers the network fee.
export async function payMilestone(a: Agreement, providerPubkey: string, n: number, amount: number, signer: Signer): Promise<string> {
  const { feePayer, treasury } = await api<{ feePayer: string; treasury: string }>("/api/relay");
  const tx = buildPaymentTx({
    payer: new PublicKey(signer.pubkey),
    provider: new PublicKey(providerPubkey),
    treasury: new PublicKey(treasury),
    feePayer: new PublicKey(feePayer),
    amount,
    memo: payMemo(await agreementHash(a), n),
  });
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const signed = await signer.signTransaction(tx);
  const { tx: sig } = await api<{ tx: string }>("/api/relay", { tx: signed.serialize({ requireAllSignatures: false }).toString("base64") });
  return sig;
}

// Finds each milestone's payment by its memo on the provider's USDC account. Works for
// payments made in the app and for Solana Pay payments from any wallet.
export async function findPayments(a: Agreement, providerPubkey: string): Promise<Record<number, string | null>> {
  const ata = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(providerPubkey));
  const hash = await agreementHash(a);
  const sigs = await connection.getSignaturesForAddress(ata, { limit: 100 }).catch(() => []);
  const find = (n: number) => sigs.find((s) => !s.err && s.memo?.includes(payMemo(hash, n)))?.signature ?? null;
  return { 1: find(1), 2: find(2) };
}

export async function signDelivery(a: Agreement, signer: Signer): Promise<Signature> {
  const hash = await agreementHash(a);
  const sig = await signer.signMessage(new TextEncoder().encode(deliveryMessage(hash, a.title)));
  return { role: "provider", pubkey: signer.pubkey, signature: bs58.encode(sig), signedAt: new Date().toISOString() };
}

// Live USDC -> ARS rate (best bid across Argentine exchanges), for freelancers paid in pesos.
export async function usdcArsRate(): Promise<{ rate: number; venue: string } | null> {
  try {
    const d = (await (await fetch("https://criptoya.com/api/usdc/ars/1")).json()) as Record<string, { totalBid?: number }>;
    const best = Object.entries(d).filter(([, v]) => v.totalBid).sort((x, y) => y[1].totalBid! - x[1].totalBid!)[0];
    return best ? { rate: best[1].totalBid!, venue: best[0] } : null;
  } catch {
    return null;
  }
}

export interface Verification {
  txFound: boolean;
  hashOnChain: string | null;
  hashMatches: boolean;
  signatures: { role: Party["role"]; pubkey: string; valid: boolean }[];
  blockTime: number | null;
}

// Re-derives everything from the chain: the memo's hash must equal the hash of the agreement
// you hold, and both signatures in the memo must verify against it.
export async function verifySeal(a: Agreement, txSig: string): Promise<Verification> {
  const tx = await connection.getParsedTransaction(txSig, { maxSupportedTransactionVersion: 0 });
  const empty: Verification = { txFound: false, hashOnChain: null, hashMatches: false, signatures: [], blockTime: null };
  if (!tx) return empty;
  const memoIx = tx.transaction.message.instructions.find((ix) => ix.programId.toBase58() === MEMO_PROGRAM_ID);
  const memo = memoIx && "parsed" in memoIx ? String(memoIx.parsed) : "";
  const parsed = parseSealMemo(memo);
  if (!parsed) return { ...empty, txFound: true, blockTime: tx.blockTime ?? null };
  const hash = await agreementHash(a);
  return {
    txFound: true,
    hashOnChain: parsed.hash,
    hashMatches: parsed.hash === hash,
    signatures: parsed.sigs.map((s) => ({ role: s.role, pubkey: s.pubkey, valid: verifySignature(parsed.hash, a.title, s) })),
    blockTime: tx.blockTime ?? null,
  };
}

export interface Stats { agreementsSealed: number; feesUsdc: number; volumeUsdc: number; sponsor: string; lastSealTx: string | null }

// Public traction numbers, read straight from Solana: every seal is a sponsor-paid memo
// transaction, and the treasury account only ever receives the 1% fee.
export async function chainStats(): Promise<Stats> {
  const { feePayer, treasury } = await api<{ feePayer: string; treasury: string }>("/api/relay");
  const sigs = await connection.getSignaturesForAddress(new PublicKey(feePayer), { limit: 1000 });
  const seals = sigs.filter((s) => !s.err && s.memo?.includes("rocksign:v1:"));
  const fees = await usdcBalance(treasury);
  return { agreementsSealed: seals.length, feesUsdc: fees, volumeUsdc: Math.round((fees * 10000) / FEE_BPS * 100) / 100, sponsor: feePayer, lastSealTx: seals[0]?.signature ?? null };
}
