import { pipeline } from "@huggingface/transformers";
import { transcribe, ASR_MODELS, type CallLanguage } from "../lib/transcribe.ts";

// Runs Whisper off the main thread. The audio never leaves the browser.
type In = { audio: Float32Array; lang: CallLanguage };
export type AsrEvent =
  | { type: "loading"; progress: number }
  | { type: "transcribing"; done: number; total: number }
  | { type: "done"; segments: import("../lib/types.ts").Segment[] }
  | { type: "error"; message: string };

const post = (e: AsrEvent) => self.postMessage(e);

self.onmessage = async ({ data }: MessageEvent<In>) => {
  try {
    const files = new Map<string, number>();
    const hasWebGPU = "gpu" in navigator && !!(await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null));
    const asr = await pipeline("automatic-speech-recognition", ASR_MODELS[data.lang].model, {
      dtype: hasWebGPU ? "fp32" : "q8",
      device: hasWebGPU ? "webgpu" : "wasm",
      progress_callback: (p: { status: string; file?: string; progress?: number }) => {
        if (p.status === "progress" && p.file) {
          files.set(p.file, p.progress ?? 0);
          post({ type: "loading", progress: [...files.values()].reduce((a, b) => a + b, 0) / files.size });
        }
      },
    });
    const segments = await transcribe(asr as never, data.audio, (done, total) => post({ type: "transcribing", done, total }), data.lang);
    post({ type: "done", segments });
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
  }
};
