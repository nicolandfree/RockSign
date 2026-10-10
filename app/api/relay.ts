import { PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, decodeTransferCheckedInstruction } from "@solana/spl-token";
import { MEMO_PROGRAM_ID } from "../src/config/chain.ts";
import { json, sponsor } from "./_sponsor.ts";

// GET -> { feePayer }: the address the client sets as fee payer.
export async function GET(): Promise<Response> {
  try {
    return json({ feePayer: sponsor().payer.publicKey.toBase58() });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

// POST { tx } (base64, signed by the payer, fee payer = sponsor) -> { tx: signature }.
// The sponsor only adds its fee signature to a USDC transfer (+ memo). It never appears in
// any instruction, so a relayed transaction cannot move the sponsor's own funds.
export async function POST(request: Request): Promise<Response> {
  const mint = process.env.VITE_USDC_MINT;
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(((await request.json()) as { tx: string }).tx, "base64"));
  } catch {
    return json({ error: "Body must be JSON: { tx: <base64 transaction> }" }, 400);
  }
  try {
    const { connection, payer } = sponsor();
    if (!tx.feePayer?.equals(payer.publicKey)) return json({ error: "Fee payer must be the RockSign sponsor" }, 400);
    if (tx.instructions.length > 3) return json({ error: "Too many instructions" }, 400);
    let transfers = 0;
    for (const ix of tx.instructions) {
      if (ix.keys.some((k) => k.pubkey.equals(payer.publicKey))) return json({ error: "Sponsor cannot be an instruction account" }, 400);
      if (ix.programId.equals(new PublicKey(MEMO_PROGRAM_ID))) continue;
      if (!ix.programId.equals(TOKEN_PROGRAM_ID)) return json({ error: "Only USDC transfers can be relayed" }, 400);
      const decoded = decodeTransferCheckedInstruction(ix); // throws on anything but transferChecked
      if (!mint || !decoded.keys.mint.pubkey.equals(new PublicKey(mint))) return json({ error: "Only USDC transfers can be relayed" }, 400);
      transfers++;
    }
    if (transfers !== 1) return json({ error: "Exactly one USDC transfer is required" }, 400);
    tx.partialSign(payer);
    if (!tx.verifySignatures()) return json({ error: "Transaction is not fully signed" }, 400);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, "confirmed");
    return json({ tx: sig });
  } catch (e) {
    return json({ error: `Relay failed: ${(e as Error).message}` }, 502);
  }
}
