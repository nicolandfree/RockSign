// The sponsor pays fees for others, so its endpoints must refuse anything that could spend its
// own funds. These checks run before any RPC call, so they are tested offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

const sponsorKp = Keypair.generate();
process.env.SPONSOR_SECRET_KEY = bs58.encode(sponsorKp.secretKey);
process.env.VITE_USDC_MINT = Keypair.generate().publicKey.toBase58();
process.env.RPC_URL = "http://127.0.0.1:1"; // nothing listens: any RPC call would fail the test
const sponsor = sponsorKp.publicKey;
const { POST: solanaPay } = await import("../api/solana-pay.ts");
const { POST: relay, GET: relayInfo } = await import("../api/relay.ts");
const { POST: seal } = await import("../api/seal.ts");

const memo = `rocksign:pay:${"0".repeat(32)}:1`;
const payReq = (to: string, account: string, m = memo) =>
  solanaPay(new Request(`http://x/api/solana-pay?to=${to}&amount=5&memo=${m}`, { method: "POST", body: JSON.stringify({ account }) }));
const someone = () => Keypair.generate().publicKey.toBase58();

test("Solana Pay: the sponsor can never be the payer (treasury drain)", async () => {
  const r = await payReq(someone(), sponsor.toBase58());
  assert.equal(r.status, 400);
});

test("Solana Pay: the sponsor can never be the recipient", async () => {
  assert.equal((await payReq(sponsor.toBase58(), someone())).status, 400);
});

test("Solana Pay: memo must reference an agreement payment", async () => {
  assert.equal((await payReq(someone(), someone(), "hack")).status, 400);
});

test("relay exposes fee payer and treasury", async () => {
  assert.deepEqual(await (await relayInfo()).json(), { feePayer: sponsor.toBase58(), treasury: sponsor.toBase58() });
});

const relayTx = (tx: Transaction) => relay(new Request("http://x", { method: "POST", body: JSON.stringify({ tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64") }) }));
const blank = (feePayer: PublicKey) => { const t = new Transaction({ feePayer }); t.recentBlockhash = Keypair.generate().publicKey.toBase58(); return t; };

test("relay: refuses a SOL transfer out of the sponsor", async () => {
  const tx = blank(sponsor).add(SystemProgram.transfer({ fromPubkey: sponsor, toPubkey: Keypair.generate().publicKey, lamports: 1e9 }));
  assert.equal((await relayTx(tx)).status, 400);
});

test("relay: refuses anything that is not a USDC payment", async () => {
  const from = Keypair.generate().publicKey;
  const tx = blank(sponsor).add(SystemProgram.transfer({ fromPubkey: from, toPubkey: Keypair.generate().publicKey, lamports: 1 }));
  assert.equal((await relayTx(tx)).status, 400);
});

test("relay: only sponsors transactions that name it as fee payer", async () => {
  const tx = blank(Keypair.generate().publicKey);
  assert.equal((await relayTx(tx)).status, 400);
});

test("seal: refuses unsigned or tampered agreements", async () => {
  const r = await seal(new Request("http://x", { method: "POST", body: JSON.stringify({ envelope: { agreement: { title: "x", terms: [] }, signatures: [] } }) }));
  assert.equal(r.status, 400);
});

test("rate limit: the faucet answers 429 after 5 requests from one IP", async () => {
  const { POST: faucet } = await import("../api/faucet.ts");
  const req = () => faucet(new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify({ owner: "not-a-key" }) }));
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await req()).status);
  assert.deepEqual(codes, [400, 400, 400, 400, 400, 429]);
});
