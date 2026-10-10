import { useRef, useState } from "react";
import { go } from "../lib/hooks.ts";
import { setPendingUpload } from "../lib/upload.ts";
import type { CallLanguage } from "../lib/transcribe.ts";

export default function Home({ apiKey, onKey }: { apiKey: string; onKey: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [lang, setLang] = useState<CallLanguage>("en");
  const pick = (f?: File) => {
    if (!f) return;
    if (!apiKey) return onKey();
    setPendingUpload(f, lang);
    go("/process/upload");
  };
  return (
    <>
      <section className="hero">
        <div className="stack" style={{ gap: 20 }}>
          <span className="pill red" style={{ alignSelf: "flex-start" }}>For freelancers paid in dollars by clients abroad</span>
          <h1>What's said<br />gets signed.<br /><span style={{ color: "var(--red)" }}>And paid.</span></h1>
          <p className="lead">You close the job on a call. RockSign turns what you both said into an agreement your client signs with no wallet and no account, then collects the deposit and the final payment in USDC. Every clause links to the second it was said, and the signatures are sealed on Solana.</p>
          <div className="row">
            <button className="btn" onClick={() => go("/process/sample")}>▶ Try a sample call</button>
            <button className="btn ghost" onClick={() => go("/process/sample-es")}>▶ Llamada de ejemplo en español</button>
            <button className="btn dark" onClick={() => go("/record")}>● Record a call</button>
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
          ["04", "Get paid in USDC", "Deposit on signing, balance on delivery, as agreed. Your client pays in one tap; you see it in pesos too."],
        ].map(([n, t, d]) => (
          <div className="card" key={n}><span className="n">{n}</span><b>{t}</b><span className="small">{d}</span></div>
        ))}
      </section>

      <section style={{ marginTop: 36 }} className="stack">
        <h2>Pricing</h2>
        <div className="pricing">
          <div className="card"><span className="small muted">Agreements</span><b className="big">Free</b><span className="small">Unlimited calls, drafts, signatures and seals on Solana. No subscription.</span></div>
          <div className="card" style={{ borderColor: "var(--red)" }}><span className="small muted">When you get paid</span><b className="big">1%</b><span className="small">Of each payment collected through RockSign, taken inside the same transaction. Network fees are on us.</span></div>
          <div className="card"><span className="small muted">Transparent</span><b className="big"><a href="#/stats" style={{ color: "inherit" }}>On-chain</a></b><span className="small">Every agreement sealed and every fee collected is public. <a href="#/stats">See the live numbers</a>.</span></div>
        </div>
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
            MP3, M4A, WAV, WebM or MP4 · transcribed in your browser · {apiKey ? "uses your Claude key" : "needs your Claude API key"}
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
            <span className="small">Call language</span>
            {(["en", "es"] as const).map((l) => (
              <button key={l} className={`btn small ${lang === l ? "dark" : "ghost"}`} onClick={() => setLang(l)}>{l === "en" ? "English" : "Español"}</button>
            ))}
          </div>
          <input ref={input} type="file" accept="audio/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      </section>
    </>
  );
}
