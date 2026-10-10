import { Buffer } from "buffer";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import bs58 from "bs58";
import { MEMO_PROGRAM_ID, RPC_URL, USDC_MINT } from "../config/chain.ts";
import { agreementHash, agreementMessage, parseSealMemo, verifySignature } from "./agreement.ts";
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

export const payMemo = (hash: string) => `rocksign:pay:${hash.slice(0, 32)}`;

export async function usdcBalance(owner: string): Promise<number> {
  try {
    const acc = await getAccount(connection, getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(owner)));
    return Number(acc.amount) / 1e6;
  } catch {
    return 0;
  }
}

// Client pays the provider in USDC; the RockSign sponsor covers the network fee.
export async function payUpfront(a: Agreement, providerPubkey: string, amount: number, signer: Signer): Promise<string> {
  const mint = new PublicKey(USDC_MINT);
  const owner = new PublicKey(signer.pubkey);
  const { feePayer } = await api<{ feePayer: string }>("/api/relay");
  const tx = new Transaction({ feePayer: new PublicKey(feePayer), ...(await connection.getLatestBlockhash()) });
  tx.add(
    createTransferCheckedInstruction(
      getAssociatedTokenAddressSync(mint, owner),
      mint,
      getAssociatedTokenAddressSync(mint, new PublicKey(providerPubkey)),
      owner,
      BigInt(Math.round(amount * 1e6)),
      6,
    ),
    new TransactionInstruction({ programId: new PublicKey(MEMO_PROGRAM_ID), keys: [], data: Buffer.from(payMemo(await agreementHash(a)), "utf8") }),
  );
  const signed = await signer.signTransaction(tx);
  const { tx: sig } = await api<{ tx: string }>("/api/relay", { tx: signed.serialize({ requireAllSignatures: false }).toString("base64") });
  return sig;
}

// Finds the upfront payment by its memo on the provider's USDC account.
export async function findPayment(a: Agreement, providerPubkey: string): Promise<string | null> {
  const ata = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(providerPubkey));
  const memo = payMemo(await agreementHash(a));
  const sigs = await connection.getSignaturesForAddress(ata, { limit: 50 }).catch(() => []);
  return sigs.find((s) => !s.err && s.memo?.includes(memo))?.signature ?? null;
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
