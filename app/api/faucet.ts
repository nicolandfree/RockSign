import { PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { json, sponsor } from "./_sponsor.ts";

// POST { owner } -> { tx }. Mints 2,000 RockSign test USDC (devnet) so anyone can try the payment step.
export async function POST(request: Request): Promise<Response> {
  const mint = process.env.VITE_USDC_MINT;
  if (!mint) return json({ error: "VITE_USDC_MINT is not set" }, 500);
  let owner: PublicKey;
  try {
    owner = new PublicKey(((await request.json()) as { owner: string }).owner);
  } catch {
    return json({ error: "Body must be JSON: { owner: <base58 address> }" }, 400);
  }
  try {
    const { connection, payer } = sponsor();
    const ata = await getOrCreateAssociatedTokenAccount(connection, payer, new PublicKey(mint), owner);
    const tx = await mintTo(connection, payer, new PublicKey(mint), ata.address, payer, 2_000_000_000n);
    return json({ tx });
  } catch (e) {
    return json({ error: `Faucet failed: ${(e as Error).message}` }, 502);
  }
}
