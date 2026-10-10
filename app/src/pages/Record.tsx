import { useEffect, useRef, useState } from "react";
import { go } from "../lib/hooks.ts";
import { setPendingUpload } from "./Process.tsx";
import type { CallLanguage } from "../lib/transcribe.ts";

// Records the call in the browser: your microphone, plus (optionally) the audio of the tab
// where the meeting runs, so the other side is captured too. Nothing is uploaded.
export default function Record({ apiKey, onNeedKey }: { apiKey: string; onNeedKey: () => void }) {
  const [lang, setLang] = useState<CallLanguage>("en");
  const [withTab, setWithTab] = useState(true);
  const [state, setState] = useState<"idle" | "recording" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const ctx = useRef<AudioContext | null>(null);
  const level = useRef<HTMLDivElement>(null);

  useEffect(() => () => stopAll(), []);
  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  function stopAll() {
    streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams.current = [];
    void ctx.current?.close();
    ctx.current = null;
  }

  async function start() {
    setError(null);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streams.current.push(mic);
      const ac = new AudioContext();
      ctx.current = ac;
      const out = ac.createMediaStreamDestination();
      const analyser = ac.createAnalyser();
      ac.createMediaStreamSource(mic).connect(out);
      ac.createMediaStreamSource(mic).connect(analyser);
      if (withTab) {
        // Chrome only shares tab audio together with video; the video track is dropped right away.
        const tab = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        tab.getVideoTracks().forEach((t) => t.stop());
        if (!tab.getAudioTracks().length) throw new Error('No tab audio was shared. Pick the meeting tab and turn on "Share tab audio".');
        streams.current.push(tab);
        ac.createMediaStreamSource(tab).connect(out);
        ac.createMediaStreamSource(tab).connect(analyser);
      }
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        if (!ctx.current) return;
        analyser.getByteTimeDomainData(buf);
        const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v - 128)), 0) / 128;
        if (level.current) level.current.style.width = `${Math.min(100, peak * 160)}%`;
        requestAnimationFrame(draw);
      };
      draw();
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(out.stream, { mimeType: "audio/webm;codecs=opus" });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stopAll();
        const file = new File(chunks, `call-${new Date().toISOString().slice(0, 16)}.webm`, { type: "audio/webm" });
        setPendingUpload(file, lang);
        go("/process/upload");
      };
      rec.start(1000);
      recorder.current = rec;
      setSeconds(0);
      setState("recording");
    } catch (e) {
      stopAll();
      setState("error");
      setError((e as Error).message);
    }
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="stack" style={{ maxWidth: 640, margin: "10px auto", gap: 18 }}>
      <h1 style={{ fontSize: 40 }}>Record a call</h1>
      <p>Open your meeting (Google Meet, Zoom or Teams in the browser) in another tab, then start here. RockSign records your microphone and the meeting tab's audio. The recording stays on this device.</p>
      {!apiKey && <div className="card small" style={{ background: "var(--cream)" }}>You'll need your Claude API key to turn the recording into an agreement. <a href="#/record" onClick={(e) => { e.preventDefault(); onNeedKey(); }}>Add it now</a>.</div>}
      {state !== "recording" ? (
        <div className="card stack">
          <div className="row"><span className="small">Call language</span>
            {(["en", "es"] as const).map((l) => <button key={l} className={`btn small ${lang === l ? "dark" : "ghost"}`} onClick={() => setLang(l)}>{l === "en" ? "English" : "Español"}</button>)}
          </div>
          <label className="row small" style={{ cursor: "pointer" }}><input type="checkbox" checked={withTab} onChange={(e) => setWithTab(e.target.checked)} /> Also capture the meeting tab's audio (the other person's voice)</label>
          <div className="card small" style={{ background: "var(--blush)", border: 0, color: "var(--ink2)" }}>
            <b>Ask for consent first.</b> Say: "{lang === "es" ? "Uso RockSign, así que esta llamada se graba y al cortar te llega el acuerdo para firmar. ¿Te parece bien?" : "I use RockSign, so this call is recorded and you'll get the agreement to sign when we hang up. Is that okay?"}" RockSign checks for this in the transcript.
          </div>
          <button className="btn" onClick={start}>● Start recording</button>
          {error && <div className="error">{error}</div>}
        </div>
      ) : (
        <div className="card stack" style={{ alignItems: "center" }}>
          <div className="pill red">● Recording · {mmss}</div>
          <div className="bar" style={{ width: "100%", height: 8 }}><i ref={level} style={{ width: "0%" }} /></div>
          <button className="btn dark" onClick={() => { if (!apiKey) onNeedKey(); recorder.current?.stop(); }}>■ Hang up and draft the agreement</button>
        </div>
      )}
    </div>
  );
}
