import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { agreementHash, sealMemo, verifySignature } from "../src/lib/agreement.ts";
import type { Envelope } from "../src/lib/share.ts";
import { MEMO_PROGRAM_ID } from "../src/config/chain.ts";
import { json, sponsor } from "./_sponsor.ts";
import { limited } from "./_limit.ts";

// POST { envelope } -> { tx }. Writes the hash and both signatures to Solana in a Memo,
// paying the fee from the sponsor. It refuses unless both signatures verify against the hash,
// so the sponsor can only ever pay for genuine, fully signed agreements.
export async function POST(request: Request): Promise<Response> {
  const tooMany = limited(request, "seal", 30);
  if (tooMany) return tooMany;
  let envelope: Envelope;
  try {
    envelope = ((await request.json()) as { envelope: Envelope }).envelope;
  } catch {
    return json({ error: "Body must be JSON: { envelope }" }, 400);
  }
  const { agreement, signatures } = envelope ?? {};
  if (!agreement || !Array.isArray(signatures)) return json({ error: "Missing agreement or signatures" }, 400);

  const hash = await agreementHash(agreement);
  for (const role of ["provider", "client"] as const) {
    const sig = signatures.find((s) => s.role === role);
    if (!sig) return json({ error: `Missing ${role} signature` }, 400);
    if (!verifySignature(hash, agreement.title, sig)) return json({ error: `The ${role} signature does not match this agreement` }, 400);
  }

  try {
    const { connection, payer } = sponsor();
    const memo = sealMemo(hash, signatures);
    const tx = new Transaction().add(
      new TransactionInstruction({ programId: new PublicKey(MEMO_PROGRAM_ID), keys: [], data: Buffer.from(memo, "utf8") }),
    );
    const sig = await connection.sendTransaction(tx, [payer]);
    await connection.confirmTransaction(sig, "confirmed");
    // Open the provider's USDC account now, so the client's payment is a single plain transfer.
    const mint = process.env.VITE_USDC_MINT;
    const provider = signatures.find((s) => s.role === "provider")!;
    if (mint) await getOrCreateAssociatedTokenAccount(connection, payer, new PublicKey(mint), new PublicKey(provider.pubkey));
    return json({ tx: sig, hash });
  } catch (e) {
    return json({ error: `Could not write to Solana: ${(e as Error).message}` }, 502);
  }
}
