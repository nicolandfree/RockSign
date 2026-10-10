// Unit tests for the parts the product's guarantees rest on. Offline: no RPC, no API keys.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import fs from "node:fs";
import { agreementHash, agreementMessage, canonical, deliveryMessage, milestones, parseSealMemo, sealMemo, verifyDelivery, verifySignature } from "../src/lib/agreement.ts";
import { splitOnSilence } from "../src/lib/chunking.ts";
import { toAgreement, type Extraction } from "../src/lib/extract.ts";
import { decodeEnvelope, encodeEnvelope } from "../src/lib/share.ts";
import { feeOf } from "../src/config/chain.ts";
import type { Agreement, Party, Segment, Signature } from "../src/lib/types.ts";

const sample: Agreement = JSON.parse(fs.readFileSync(new URL("../src/data/sample-agreement.json", import.meta.url), "utf8"));
const sign = (kp: Keypair, msg: string, role: Party["role"]): Signature => ({
  role, pubkey: kp.publicKey.toBase58(), signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey)), signedAt: "2026-10-10T00:00:00Z",
});

test("canonical JSON ignores key order and undefined fields", () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: undefined }] }), canonical({ a: [2, { d: 3 }], b: 1 }));
});

test("any change to the agreement text changes its hash", async () => {
  const h = await agreementHash(sample);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await agreementHash(structuredClone(sample)));
  const edited = structuredClone(sample);
  edited.terms[2].value = edited.terms[2].value.replace("1,200", "1,300");
  assert.notEqual(h, await agreementHash(edited));
});

test("signatures verify only for the same hash, title and role", async () => {
  const kp = Keypair.generate();
  const h = await agreementHash(sample);
  const sig = sign(kp, agreementMessage(h, sample.title, "client"), "client");
  assert.ok(verifySignature(h, sample.title, sig));
  assert.ok(!verifySignature(h.replace(/^./, "0"), sample.title, sig), "other hash");
  assert.ok(!verifySignature(h, sample.title, { ...sig, role: "provider" }), "other role");
  assert.ok(!verifySignature(h, sample.title, { ...sig, pubkey: Keypair.generate().publicKey.toBase58() }), "other key");
  assert.ok(!verifySignature(h, sample.title, { ...sig, signature: "garbage" }), "malformed");
});

test("seal memo round-trips and needs both signatures", async () => {
  const h = await agreementHash(sample);
  const p = sign(Keypair.generate(), agreementMessage(h, sample.title, "provider"), "provider");
  const c = sign(Keypair.generate(), agreementMessage(h, sample.title, "client"), "client");
  const memo = sealMemo(h, [p, c]);
  assert.ok(Buffer.byteLength(memo) < 566, "fits in one memo instruction");
  const parsed = parseSealMemo(`Program log: Memo (len 344): "${memo}"`);
  assert.equal(parsed?.hash, h);
  assert.deepEqual(parsed?.sigs.map((s) => s.signature), [p.signature, c.signature]);
  assert.throws(() => sealMemo(h, [p]));
  assert.equal(parseSealMemo("something else"), null);
});

test("delivery notice is a separate statement from signing", async () => {
  const kp = Keypair.generate();
  const h = await agreementHash(sample);
  assert.ok(verifyDelivery(h, sample.title, sign(kp, deliveryMessage(h, sample.title), "provider")));
  assert.ok(!verifyDelivery(h, sample.title, sign(kp, agreementMessage(h, sample.title, "provider"), "provider")), "a signing signature is not a delivery notice");
});

test("payment plan from the call becomes milestones", () => {
  const plan = (total: number, upfrontPercent: number) => milestones({ ...sample, payment: { currency: "USDC", total, upfrontPercent } });
  assert.deepEqual(plan(1200, 50).map((m) => [m.n, m.amount, m.due]), [[1, 600, "signing"], [2, 600, "delivery"]]);
  assert.deepEqual(plan(2000, 30).map((m) => m.amount), [600, 1400]);
  assert.deepEqual(plan(500, 0).map((m) => [m.n, m.due]), [[2, "delivery"]]);
  assert.deepEqual(plan(500, 100).map((m) => [m.n, m.due]), [[1, "signing"]]);
  assert.deepEqual(milestones({ ...sample, payment: null }), []);
});

test("RockSign fee is 1% of each payment", () => {
  assert.equal(feeOf(600), 6);
  assert.equal(feeOf(1400), 14);
  assert.equal(feeOf(33.33), 0.3333, "exact to USDC's 6 decimals");
  assert.equal(feeOf(0.000001), 0, "dust pays no fee");
});

test("audio is cut at pauses into pieces Whisper can read", () => {
  const rate = 16000;
  // 70 s: 4 s of tone, 0.6 s of silence, repeated; starts with 1.5 s of silence.
  const audio = new Float32Array(70 * rate);
  for (let i = Math.round(1.5 * rate); i < audio.length; i++) if ((i / rate - 1.5) % 4.6 < 4) audio[i] = 0.5 * Math.sin(i / 7);
  const pieces = splitOnSilence(audio);
  assert.ok(pieces.length >= 3);
  for (const p of pieces) assert.ok(p.samples.length / rate <= 25.01, "each piece fits Whisper's window");
  assert.ok(pieces[0].offset > 1.2 && pieces[0].offset < 1.5, "leading silence is skipped");
  for (const p of pieces.slice(1)) {
    const t = (p.offset - 1.5) % 4.6;
    assert.ok(t > 3.9 || t < 0.05, `piece at ${p.offset.toFixed(2)} s starts in or at the end of a pause`);
  }
});

test("extracted line numbers become exact times and quotes, clamped to the transcript", () => {
  const segs: Segment[] = [{ start: 0, end: 2, text: "Hi." }, { start: 2, end: 5, text: "Fee is $100." }, { start: 5, end: 7, text: "Deal." }];
  const x: Extraction = {
    title: "T", provider: { name: "Ana", company: null }, client: { name: "Bo", company: "Co" }, consentGiven: true,
    payment: { totalUsd: 100, upfrontPercent: 50 },
    terms: [
      { kind: "fee", label: "Fee", value: "Bo pays Ana $100.", firstLine: 1, lastLine: 2 },
      { kind: "other", label: "Odd", value: "Out of range.", firstLine: 9, lastLine: -3 },
    ],
  };
  const a = toAgreement(x, segs, "ab".repeat(32));
  assert.deepEqual([a.terms[0].start, a.terms[0].end, a.terms[0].quote], [2, 7, "Fee is $100. Deal."]);
  assert.deepEqual([a.terms[1].start, a.terms[1].end], [5, 7]);
  assert.equal(a.parties[1].company, "Co");
  assert.equal(a.parties[0].company, undefined);
  assert.deepEqual(a.payment, { currency: "USDC", total: 100, upfrontPercent: 50 });
});

test("agreement links round-trip and reject damaged data", () => {
  const env = { agreement: sample, signatures: [] };
  assert.deepEqual(decodeEnvelope(encodeEnvelope(env)), env);
  assert.equal(decodeEnvelope("not-a-real-link"), null);
});
