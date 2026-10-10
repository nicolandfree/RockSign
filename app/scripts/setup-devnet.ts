// One-time devnet setup: sponsor keypair (pays fees), RockSign test USDC mint. Writes .env.local.
// Usage: node scripts/setup-devnet.ts <funder-keypair.json>
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import bs58 from "bs58";
import fs from "node:fs";

if (fs.existsSync(".env.local")) throw new Error(".env.local exists; refusing to overwrite the sponsor key");
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.argv[2], "utf8"))));
const sponsor = Keypair.generate();
await sendAndConfirmTransaction(connection, new Transaction().add(
  SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: sponsor.publicKey, lamports: 2 * LAMPORTS_PER_SOL }),
), [funder]);
const mint = await createMint(connection, sponsor, sponsor.publicKey, null, 6);
fs.writeFileSync(".env.local", `SPONSOR_SECRET_KEY=${bs58.encode(sponsor.secretKey)}\nVITE_USDC_MINT=${mint.toBase58()}\nVITE_RPC_URL=https://api.devnet.solana.com\n`, { mode: 0o600 });
console.log("sponsor", sponsor.publicKey.toBase58(), "mint", mint.toBase58());
