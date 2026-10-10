// End-to-end check of the on-chain flow against devnet, calling the API handlers directly.
// Usage: node --env-file=.env.local scripts/e2e-chain.ts
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import fs from "node:fs";
import type { Signer } from "../src/lib/signer.ts";
import type { Agreement } from "../src/lib/types.ts";
import { signAgreement, verifySeal, usdcBalance, findPayments, payMilestone, signDelivery } from "../src/lib/chain.ts";
import { milestones, agreementHash, verifyDelivery } from "../src/lib/agreement.ts";
import { Transaction } from "@solana/web3.js";
import * as solanaPayApi from "../api/solana-pay.ts";
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
  const mod = { "/api/seal": sealApi, "/api/faucet": faucetApi, "/api/relay": relayApi }[String(input).split("?")[0]] as Record<string, (r: Request) => Promise<Response>>;
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
const plan = milestones(agreement);
console.log("milestones:", plan.map((m) => `${m.n}:${m.amount}@${m.due}`).join(" "));
const treasury = (await (await relayApi.GET()).json()).treasury;
const t0 = await usdcBalance(treasury);
const pay1 = await payMilestone(agreement, provider.pubkey, 1, plan[0].amount, client);
console.log("upfront paid:", pay1, "provider:", await usdcBalance(provider.pubkey), "treasury +", (await usdcBalance(treasury)) - t0);

const delivered = await signDelivery(agreement, provider);
console.log("delivery signature valid:", verifyDelivery(await agreementHash(agreement), agreement.title, delivered));

// Second milestone through the Solana Pay transaction request, as a wallet app would do it.
const q = new URLSearchParams({ to: provider.pubkey, amount: String(plan[1].amount), memo: `rocksign:pay:${(await agreementHash(agreement)).slice(0, 32)}:2` });
const label = await (await solanaPayApi.GET(new Request(`http://x/api/solana-pay?${q}`))).json();
const { transaction, message } = await (await solanaPayApi.POST(new Request(`http://x/api/solana-pay?${q}`, { method: "POST", body: JSON.stringify({ account: client.pubkey }) }))).json();
const tx = Transaction.from(Buffer.from(transaction, "base64"));
await client.signTransaction(tx);
const { connection } = await import("../src/lib/chain.ts");
const pay2 = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(pay2, "confirmed");
console.log("solana pay:", label.label, "|", message, "| paid:", pay2);
console.log("provider total:", await usdcBalance(provider.pubkey), "treasury +", (await usdcBalance(treasury)) - t0);
await new Promise((r) => setTimeout(r, 2000));
console.log("payments found by memo:", JSON.stringify(await findPayments(agreement, provider.pubkey)));
const badPay = await solanaPayApi.POST(new Request(`http://x/api/solana-pay?to=${provider.pubkey}&amount=5&memo=hack`, { method: "POST", body: JSON.stringify({ account: client.pubkey }) }));
console.log("bad memo rejected:", badPay.status === 400);
const sponsorKey = (await (await relayApi.GET()).json()).feePayer;
const drain = await solanaPayApi.POST(new Request(`http://x/api/solana-pay?to=${client.pubkey}&amount=5&memo=rocksign:pay:${"0".repeat(32)}:1`, { method: "POST", body: JSON.stringify({ account: sponsorKey }) }));
console.log("sponsor as payer rejected (treasury drain):", drain.status === 400, await drain.text());
