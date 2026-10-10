import { useEffect, useRef, useState } from "react";
import { decodeTo16k, sha256Hex, transcribeInWorker } from "../lib/audio.ts";
import { extractWithClaude, toAgreement } from "../lib/extract.ts";
import { setDraft } from "../lib/draft.ts";
import { go } from "../lib/hooks.ts";
import type { Agreement } from "../lib/types.ts";
import sampleAgreement from "../data/sample-agreement.json";
import sampleEsAgreement from "../data/sample-es-agreement.json";
import type { CallLanguage } from "../lib/transcribe.ts";

// Built-in sample calls: public audio plus the terms Claude extracted from it ahead of time.
const SAMPLES: Record<string, { audio: string; lang: CallLanguage; agreement: Agreement }> = {
  sample: { audio: "/sample/call.mp3", lang: "en", agreement: sampleAgreement as Agreement },
  "sample-es": { audio: "/sample/llamada.mp3", lang: "es", agreement: sampleEsAgreement as Agreement },
};

let pendingUpload: File | null = null;
let pendingLang: CallLanguage = "en";
export const setPendingUpload = (f: File, lang: CallLanguage) => { pendingUpload = f; pendingLang = lang; };

type Step = { label: string; detail?: string; progress?: number; state: "todo" | "active" | "done" };
const INITIAL: Step[] = [
  { label: "Reading the recording", state: "todo" },
  { label: "Loading the speech model in your browser", state: "todo" },
  { label: "Transcribing", state: "todo" },
  { label: "Finding what you both agreed to", state: "todo" },
];

export default function Process({ source, apiKey, onNeedKey }: { source: string; apiKey: string; onNeedKey: () => void }) {
  const [steps, setSteps] = useState(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const update = (i: number, s: Partial<Step>) => setSteps((prev) => prev.map((p, j) => (j === i ? { ...p, ...s } : j < i && p.state !== "done" ? { ...p, state: "done" } : p)));

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const sample = SAMPLES[source];
        const isSample = !!sample;
        const lang: CallLanguage = sample?.lang ?? pendingLang;
        update(0, { state: "active" });
        let buf: ArrayBuffer, audioUrl: string;
        if (isSample) {
          audioUrl = sample.audio;
          buf = await (await fetch(audioUrl)).arrayBuffer();
        } else {
          if (!pendingUpload) return go("/");
          buf = await pendingUpload.arrayBuffer();
          audioUrl = URL.createObjectURL(pendingUpload);
        }
        const [hash, audio] = await Promise.all([sha256Hex(buf), decodeTo16k(buf)]);
        update(0, { state: "done", detail: `${Math.round(audio.length / 16000)} s of audio · SHA-256 ${hash.slice(0, 12)}…` });

        update(1, { state: "active" });
        const segments = await transcribeInWorker(audio, lang, (e) => {
          if (e.type === "loading") update(1, { state: "active", progress: e.progress });
          if (e.type === "transcribing") {
            update(1, { state: "done", progress: undefined, detail: `Whisper base · ${lang === "es" ? "Spanish" : "English"} · runs locally` });
            update(2, { state: "active", progress: (e.done / e.total) * 100, detail: `part ${e.done} of ${e.total}` });
          }
        });
        update(2, { state: "done", progress: undefined, detail: `${segments.length} lines` });

        update(3, { state: "active" });
        let agreement: Agreement;
        let note: string | undefined;
        if (apiKey) {
          agreement = toAgreement(await extractWithClaude(apiKey, segments), segments, hash, isSample ? audioUrl : undefined);
          update(3, { state: "done", detail: `Claude found ${agreement.terms.length} terms` });
        } else if (isSample) {
          // No key: use the terms Claude extracted from this same call ahead of time.
          agreement = { ...sample.agreement, recordingSha256: hash, createdAt: new Date().toISOString().slice(0, 10) };
          note = "No Claude key set, so these terms were extracted from this sample call ahead of time with the same prompt. Add your key to extract live.";
          update(3, { state: "done", detail: `${agreement.terms.length} terms (pre-extracted for the sample)` });
        } else {
          onNeedKey();
          throw new Error("Add your Claude API key to extract terms from your own recording.");
        }
        agreement = { ...agreement, language: lang };
        setDraft({ agreement, segments, audioUrl, note });
        setTimeout(() => go("/review"), 600);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [source, apiKey, onNeedKey]);

  return (
    <div className="progress">
      <h2>Drafting your agreement</h2>
      {steps.map((s, i) => (
        <div key={i} className={`pstep ${s.state}`}>
          <span className="dot">{s.state === "done" ? "✓" : ""}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--ink)", fontWeight: 600 }}>{s.label}</div>
            {s.detail && <div className="small muted">{s.detail}</div>}
            {s.progress !== undefined && s.state === "active" && <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${s.progress}%` }} /></div>}
          </div>
        </div>
      ))}
      {error && <div className="error">{error} <a href="#/">Back</a></div>}
    </div>
  );
}
