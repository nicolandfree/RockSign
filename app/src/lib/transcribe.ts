import { splitOnSilence } from "./chunking.ts";
import type { Segment } from "./types.ts";

export type CallLanguage = "en" | "es";

// English keeps the English-only model (it drops less text); other languages use the
// multilingual one with the language set explicitly, since it does not detect it on its own.
export const ASR_MODELS: Record<CallLanguage, { model: string; language?: string }> = {
  en: { model: "onnx-community/whisper-base.en" },
  es: { model: "onnx-community/whisper-base", language: "spanish" },
};
export const ASR_MODEL = ASR_MODELS.en.model;

// Minimal shape of a transformers.js ASR pipeline, so Node and the browser worker share this code.
type Asr = (audio: Float32Array, opts: object) => Promise<unknown>;
interface AsrOutput {
  text: string;
  chunks?: { timestamp: [number, number | null]; text: string }[];
}

export async function transcribe(asr: Asr, audio: Float32Array, onProgress?: (done: number, total: number) => void, lang: CallLanguage = "en"): Promise<Segment[]> {
  const pieces = splitOnSilence(audio);
  const language = ASR_MODELS[lang].language;
  const opts = language ? { language, task: "transcribe" } : {};
  const segments: Segment[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const { offset, samples } = pieces[i];
    let out = (await asr(samples, { ...opts, return_timestamps: true })) as AsrOutput;
    // Timestamp mode sometimes gives up on a piece; plain mode still reads it.
    if (!out.chunks?.length) out = (await asr(samples, opts)) as AsrOutput;
    const pieceEnd = offset + samples.length / 16000;
    for (const c of out.chunks?.length ? out.chunks : [{ timestamp: [0, null] as [number, null], text: out.text }]) {
      const text = c.text.trim();
      if (!text) continue;
      segments.push({
        start: round(offset + c.timestamp[0]),
        end: round(c.timestamp[1] == null ? pieceEnd : offset + c.timestamp[1]),
        text,
      });
    }
    onProgress?.(i + 1, pieces.length);
  }
  return segments;
}

const round = (s: number) => Math.round(s * 100) / 100;
