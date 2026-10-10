// End-to-end check of the on-chain flow against devnet, calling the API handlers directly.
// Usage: node --env-file=.env.local scripts/e2e-chain.ts
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import fs from "node:fs";
import type { Signer } from "../src/lib/signer.ts";
import type { Agreement } from "../src/lib/types.ts";
import { signAgreement, verifySeal, usdcBalance, findPayment } from "../src/lib/chain.ts";
import * as sealApi from "../api/seal.ts";
import * as faucetApi from "../api/faucet.ts";
import * as relayApi from "../api/relay.ts";

const keySigner = (kp: Keypair): Signer => ({
  kind: "embedded", label: "test", pubkey: kp.publicKey.toBase58(),
  signMessage: async (m) => nacl.sign.detached(m, kp.secretKey),
  signTransaction: async (tx) => { tx.partialSign(kp); return tx; },
});
// Route the browser's fetch("/api/...") to the handlers.
globalThis.fetch = (async (input: string, init?: RequestInit) => {
  const mod = { "/api/seal": sealApi, "/api/faucet": faucetApi, "/api/relay": relayApi }[String(input)] as Record<string, (r: Request) => Promise<Response>>;
  return mod[init?.method ?? "GET"](new Request(`http://x${input}`, init));
}) as typeof fetch;

const agreement: Agreement = JSON.parse(fs.readFileSync("src/data/sample-agreement.json", "utf8"));
const provider = keySigner(Keypair.generate());
const client = keySigner(Keypair.generate());
const signatures = [await signAgreement(agreement, "provider", provider), await signAgreement(agreement, "client", client)];

const bad = await sealApi.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ envelope: { agreement: { ...agreement, title: "tampered" }, signatures } }) }));
console.log("tampered seal rejected:", bad.status === 400, await bad.text());

const { tx: sealTx } = await (await sealApi.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ envelope: { agreement, signatures } }) }))).json();
console.log("sealed:", sealTx);
const v = await verifySeal(agreement, sealTx);
console.log("verify:", JSON.stringify(v));
const vt = await verifySeal({ ...agreement, terms: agreement.terms.slice(1) }, sealTx);
console.log("verify edited agreement -> hashMatches:", vt.hashMatches);

await (await faucetApi.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ owner: client.pubkey }) }))).json();
console.log("client USDC:", await usdcBalance(client.pubkey));
const { payUpfront } = await import("../src/lib/chain.ts");
const payTx = await payUpfront(agreement, provider.pubkey, 600, client);
console.log("paid:", payTx, "provider USDC:", await usdcBalance(provider.pubkey));
await new Promise((r) => setTimeout(r, 2000));
console.log("payment found by memo:", await findPayment(agreement, provider.pubkey));
