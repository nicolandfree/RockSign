// Transcribes the sample call with the same model and chunking the browser uses.
// Usage: node scripts/transcribe-sample.mjs <call.f32> [en|es] [out.json]   (16 kHz mono float32, from ffmpeg -f f32le)
import { pipeline } from "@huggingface/transformers";
import fs from "node:fs";
import { transcribe, ASR_MODELS } from "../src/lib/transcribe.ts";

const raw = fs.readFileSync(process.argv[2]);
const audio = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const lang = process.argv[3] ?? "en";
const out = process.argv[4] ?? "src/data/sample-transcript.json";
const asr = await pipeline("automatic-speech-recognition", ASR_MODELS[lang].model, { dtype: "q8" });
const t0 = Date.now();
const segments = await transcribe(asr, audio, (d, t) => process.stderr.write(`piece ${d}/${t}\r`), lang);
fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync(out, JSON.stringify(segments, null, 1));
console.log(`\n${segments.length} segments in ${(Date.now() - t0) / 1000}s`);
console.log(segments.map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`).join("\n"));
