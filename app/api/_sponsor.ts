import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// The sponsor pays network fees so neither party needs SOL. Devnet only.
export function sponsor(): { connection: Connection; payer: Keypair } {
  const secret = process.env.SPONSOR_SECRET_KEY;
  if (!secret) throw new Error("SPONSOR_SECRET_KEY is not set");
  const rpc = process.env.RPC_URL ?? process.env.VITE_RPC_URL ?? "https://api.devnet.solana.com";
  return { connection: new Connection(rpc, "confirmed"), payer: Keypair.fromSecretKey(bs58.decode(secret)) };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
