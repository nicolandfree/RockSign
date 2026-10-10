# RockSign app

RockSign turns a recorded call between a freelancer and a client into an agreement both sides sign. Every clause links to the second it was said. Both signatures are sealed on Solana, and the agreed upfront payment is paid in USDC with one tap.

This is the hackathon build. It runs on Solana **devnet** with a RockSign test USDC token.

## What happens, step by step

1. **Transcribe in the browser.** The recording is decoded to 16 kHz mono and transcribed by Whisper (`onnx-community/whisper-base.en`, transformers.js) in a Web Worker. The audio never leaves the device. `src/lib/chunking.ts` cuts the audio at pauses into pieces of at most 25 s, so every line keeps an exact timestamp.
2. **Extract the terms with Claude.** `src/lib/extract.ts` sends the numbered transcript to Claude Opus 5.5 with a JSON schema (structured outputs). Claude returns each term plus the transcript lines where it was agreed, and the app maps those lines to times. The call uses the user's own API key from the browser. Without a key, the sample call uses terms extracted ahead of time with the same prompt (`scripts/extract-sample.ts`).
3. **Review.** The freelancer edits names and clauses. Each clause has a ▶ button that replays the exact moment from the call.
4. **Sign.** Each party signs a human-readable message that contains the SHA-256 of the canonical agreement JSON (`src/lib/agreement.ts`). The signer is either a browser wallet (Wallet Standard: Phantom, Solflare, Backpack) or a key generated in the browser, so the client needs no wallet.
5. **Seal.** `POST /api/seal` checks both Ed25519 signatures against the hash. It then writes `rocksign:v1:<hash>:<provider>:<sig>:<client>:<sig>` to the Solana Memo program and pays the fee from a sponsor key. The sponsor pays only for fully signed, valid agreements.
6. **Pay.** The client signs a USDC `transferChecked` to the provider with the memo `rocksign:pay:<hash>`. `POST /api/relay` adds the sponsor as fee payer. It refuses any transaction that holds anything other than one USDC transfer and a memo, or that uses the sponsor in an instruction.
7. **Verify.** Anyone with the agreement link can re-check the record on Solana. The app reads the seal transaction, recomputes the hash of the text they hold, and verifies both signatures. No RockSign server is involved.

The agreement itself travels in the link (`#/a/<lz-string data>`). No server stores it.

## Run it locally

```bash
cd app
npm install
node scripts/setup-devnet.ts ~/.config/solana/id.json   # once: creates the sponsor key, test USDC mint and .env.local; needs about 2 devnet SOL
npm run dev                                             # http://localhost:5173
```

Open the app and click **Try it with a sample call**. To use your own recording, add a Claude API key from the header.

`node --env-file=.env.local scripts/e2e-chain.ts` runs the whole on-chain flow against devnet:
- it seals a signed agreement and confirms a tampered one is rejected;
- it verifies the seal, mints test USDC and pays the upfront amount through the relay;
- it finds the payment by its memo.

## Layout

| Path | What it does |
|---|---|
| `src/lib/chunking.ts`, `transcribe.ts`, `workers/asr.worker.ts` | Whisper transcription in the browser, split at pauses |
| `src/lib/extract.ts` | Claude prompt, JSON schema, mapping lines to timestamps |
| `src/lib/agreement.ts` | Canonical JSON, hash, signing message, memo format |
| `src/lib/chain.ts` | Signing, sealing, payment, verification on Solana |
| `api/seal.ts`, `api/relay.ts`, `api/faucet.ts` | Sponsor-paid seal, fee-sponsored USDC transfer, devnet test USDC |
| `scripts/` | Sample precompute, devnet setup, end-to-end chain test |

## Limits of this build

- Devnet only. The test USDC token is not Circle USDC.
- The key generated in the browser lives in `localStorage`. Production would use an embedded wallet with recovery.
- Speech recognition is English only (`whisper-base.en`).
- A wallet signature is an electronic signature. The on-chain record makes it tamper-evident and timestamped. Whether it is enough legally depends on the jurisdiction.
