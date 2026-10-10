import { PublicKey } from "@solana/web3.js";
import { buildPaymentTx } from "../src/lib/chain.ts";
import { json, sponsor } from "./_sponsor.ts";

// Solana Pay transaction request (https://docs.solanapay.com/spec#transaction-request).
// A wallet scans solana:<this URL>?to=&amount=&memo=, GETs the label, POSTs its account,
// and receives the split payment (99% provider, 1% RockSign) with RockSign paying the gas.
export async function GET(request: Request): Promise<Response> {
  return json({ label: "RockSign", icon: `${new URL(request.url).origin}/favicon.png` });
}

export async function POST(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const amount = Number(q.get("amount"));
  const memo = q.get("memo") ?? "";
  let to: PublicKey, account: PublicKey;
  try {
    to = new PublicKey(q.get("to") ?? "");
    account = new PublicKey(((await request.json()) as { account: string }).account);
  } catch {
    return json({ error: "Invalid recipient or account" }, 400);
  }
  if (!(amount > 0 && amount <= 100_000)) return json({ error: "Invalid amount" }, 400);
  if (!/^rocksign:pay:[0-9a-f]{32}:[12]$/.test(memo)) return json({ error: "Invalid memo" }, 400);
  try {
    const { connection, payer } = sponsor();
    const tx = buildPaymentTx({ payer: account, provider: to, treasury: payer.publicKey, feePayer: payer.publicKey, amount, memo });
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.partialSign(payer); // gas only; the wallet signs the transfers
    return json({ transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"), message: `Pay ${amount} USDC · 1% RockSign fee included` });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
