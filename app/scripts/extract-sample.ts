// Precomputes the sample call's terms with the same prompt and schema the app uses,
// via the local Claude Code CLI (no API key needed).
// Usage: node scripts/extract-sample.ts [transcript.json] [public audio path] [output prefix]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { EXTRACTION_SCHEMA, EXTRACTION_SYSTEM, transcriptForPrompt, toAgreement, type Extraction } from "../src/lib/extract.ts";
import type { Segment } from "../src/lib/types.ts";

const [transcriptPath = "src/data/sample-transcript.json", audioPath = "/sample/call.mp3", prefix = "src/data/sample"] = process.argv.slice(2);
const segments: Segment[] = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
const prompt = `${EXTRACTION_SYSTEM}\n\nReturn ONLY a JSON object matching this JSON Schema, no prose, no code fence:\n${JSON.stringify(EXTRACTION_SCHEMA)}\n\nTranscript:\n${transcriptForPrompt(segments)}`;
const raw = execFileSync("claude", ["-p", "--model", "claude-opus-5-5", "--output-format", "text"], { input: prompt, encoding: "utf8", maxBuffer: 1 << 24 });
const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
const extraction: Extraction = JSON.parse(json);
const audioHash = createHash("sha256").update(fs.readFileSync(`public${audioPath}`)).digest("hex");
const agreement = toAgreement(extraction, segments, audioHash, audioPath);
fs.writeFileSync(`${prefix}-extraction.json`, JSON.stringify(extraction, null, 1));
fs.writeFileSync(`${prefix}-agreement.json`, JSON.stringify(agreement, null, 1));
console.log(JSON.stringify(agreement, null, 1));
