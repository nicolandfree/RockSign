import type { AsrEvent } from "../workers/asr.worker.ts";
import type { Segment } from "./types.ts";

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Decodes any browser-playable audio/video file to 16 kHz mono, which is what Whisper expects.
export async function decodeTo16k(buf: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0));
    if (audio.numberOfChannels === 1) return audio.getChannelData(0);
    const a = audio.getChannelData(0), b = audio.getChannelData(1), out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
    return out;
  } finally {
    void ctx.close();
  }
}

export function transcribeInWorker(audio: Float32Array, onEvent: (e: AsrEvent) => void): Promise<Segment[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/asr.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<AsrEvent>) => {
      onEvent(data);
      if (data.type === "done") { worker.terminate(); resolve(data.segments); }
      if (data.type === "error") { worker.terminate(); reject(new Error(data.message)); }
    };
    const copy = audio.slice(); // AudioBuffer-backed arrays cannot be transferred
    worker.postMessage({ audio: copy }, [copy.buffer]);
  });
}
