import { useRef, useState } from "react";
import { go } from "../lib/hooks.ts";
import { setPendingUpload } from "./Process.tsx";

export default function Home({ apiKey, onKey }: { apiKey: string; onKey: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (f?: File) => {
    if (!f) return;
    if (!apiKey) return onKey();
    setPendingUpload(f);
    go("/process/upload");
  };
  return (
    <>
      <section className="hero">
        <div className="stack" style={{ gap: 20 }}>
          <span className="pill red" style={{ alignSelf: "flex-start" }}>For freelancers who close deals on calls</span>
          <h1>What's said<br />gets signed.<br /><span style={{ color: "var(--red)" }}>And paid.</span></h1>
          <p className="lead">RockSign turns the call where you and your client agreed on scope, price and dates into an agreement you both sign. Every clause links to the moment it was said. The signatures are sealed on Solana, and the upfront payment is one tap in USDC.</p>
          <div className="row">
            <button className="btn" onClick={() => go("/process/sample")}>▶ Try it with a sample call</button>
            <button className="btn ghost" onClick={() => go("/verify")}>Verify an agreement</button>
          </div>
        </div>
        <div className="art"><img src="/brand/isotype.webp" alt="" /></div>
      </section>

      <section className="steps">
        {[
          ["01", "Record the call", "Ask for consent, talk as usual. Upload the recording when you hang up."],
          ["02", "Terms, with receipts", "Claude drafts each clause and links it to the second it was said."],
          ["03", "Both sign, no wallet needed", "Each side signs the exact agreement hash. RockSign seals both signatures on Solana."],
          ["04", "Get paid upfront", "The agreed deposit becomes a USDC payment your client approves in one tap."],
        ].map(([n, t, d]) => (
          <div className="card" key={n}><span className="n">{n}</span><b>{t}</b><span className="small">{d}</span></div>
        ))}
      </section>

      <section style={{ marginTop: 28 }}>
        <div
          className={`drop${over ? " over" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
        >
          <b style={{ color: "var(--ink)" }}>Have your own call? Drop the recording here</b>
          <div className="small muted" style={{ marginTop: 6 }}>
            MP3, M4A, WAV, WebM or MP4 · English · transcribed in your browser · {apiKey ? "uses your Claude key" : "needs your Claude API key"}
          </div>
          <input ref={input} type="file" accept="audio/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      </section>
    </>
  );
}
