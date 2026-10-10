import { useState } from "react";
import { getDraft, setDraft } from "../lib/draft.ts";
import { fmt } from "../lib/extract.ts";
import { go, useClipPlayer, useSigner } from "../lib/hooks.ts";
import { signAgreement } from "../lib/chain.ts";
import { encodeEnvelope } from "../lib/share.ts";
import type { Agreement, Term } from "../lib/types.ts";

export default function Review() {
  const draft = getDraft();
  const [a, setA] = useState<Agreement | null>(draft?.agreement ?? null);
  const [focus, setFocus] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useClipPlayer(draft?.audioUrl);
  const signer = useSigner("provider");
  if (!draft || !a) return <div className="card">Nothing to review yet. <a href="#/">Start with a call</a>.</div>;

  const provider = a.parties.find((p) => p.role === "provider")!;
  const client = a.parties.find((p) => p.role === "client")!;
  const setParty = (role: string, patch: object) => setA({ ...a, parties: a.parties.map((p) => (p.role === role ? { ...p, ...patch } : p)) });
  const setTerm = (i: number, patch: Partial<Term>) => setA({ ...a, terms: a.terms.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const focused = focus === null ? null : a.terms[focus];
  const upfront = a.payment ? (a.payment.total * a.payment.upfrontPercent) / 100 : 0;

  const sign = async () => {
    setBusy(true);
    setError(null);
    try {
      const clean: Agreement = { ...a, terms: a.terms.filter((t) => t.value.trim()) };
      setDraft({ ...draft, agreement: clean });
      const sig = await signAgreement(clean, "provider", signer);
      go(`/a/${encodeEnvelope({ agreement: clean, signatures: [sig] })}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="stack" style={{ gap: 6 }}>
          <h3>Review the draft</h3>
          <h1 style={{ fontSize: 34 }}>{a.title}</h1>
        </div>
        <span className="pill ok">✓ Recording consent captured on the call</span>
      </div>
      {draft.note && <div className="card small" style={{ background: "var(--cream)" }}>{draft.note}</div>}

      <div className="split">
        <div className="card" style={{ padding: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", padding: "6px 10px 10px" }}>
            <h3>Call transcript</h3>
            <span className="small muted">click a line to hear it</span>
          </div>
          <div className="transcript">
            {draft.segments.map((s, i) => {
              const hl = focused && s.start < focused.end - 0.05 && s.end > focused.start + 0.05;
              const on = player.playing === `l${i}`;
              return (
                <div key={i} className={`line${hl ? " hl" : ""}${on ? " playing" : ""}`} onClick={() => player.play(`l${i}`, s.start, s.end)}>
                  <time>{fmt(s.start)}</time><span>{s.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <h3>Parties</h3>
            <div className="row">
              <label className="field">You (service provider)<input className="text" value={provider.name} onChange={(e) => setParty("provider", { name: e.target.value })} placeholder="Your full name" /></label>
              <label className="field">Client<input className="text" value={client.name} onChange={(e) => setParty("client", { name: e.target.value })} /></label>
              <label className="field">Client company<input className="text" value={client.company ?? ""} onChange={(e) => setParty("client", { company: e.target.value || undefined })} /></label>
            </div>
          </div>

          <div className="stack" style={{ gap: 10 }}>
            <h3>Terms found in the call · {a.terms.length}</h3>
            {a.terms.map((t, i) => (
              <div key={i} className="term" onMouseEnter={() => setFocus(i)} onFocus={() => setFocus(i)}>
                <div className="head">
                  <span className="label">{t.label}</span>
                  <button className={`play${player.playing === `t${i}` ? " on" : ""}`} onClick={() => player.play(`t${i}`, t.start, t.end)} disabled={!player.available}>
                    {player.playing === `t${i}` ? "■" : "▶"} {fmt(t.start)}
                  </button>
                </div>
                <textarea rows={Math.max(2, Math.ceil(t.value.length / 62))} value={t.value} onChange={(e) => setTerm(i, { value: e.target.value })} />
                <div className="quote">"{t.quote}"</div>
              </div>
            ))}
          </div>

          {a.payment && (
            <div className="card row" style={{ justifyContent: "space-between" }}>
              <div>
                <h3>Upfront payment</h3>
                <div style={{ fontSize: 22, color: "var(--ink)", fontFamily: "Oswald" }}>{upfront.toLocaleString()} USDC</div>
                <div className="small muted">{a.payment.upfrontPercent}% of {a.payment.total.toLocaleString()} on signing, the rest on delivery · RockSign keeps 1% of each payment, signing is free</div>
              </div>
              <label className="field" style={{ maxWidth: 120, minWidth: 100 }}>Upfront %
                <input className="text" type="number" min={0} max={100} value={a.payment.upfrontPercent} onChange={(e) => setA({ ...a, payment: { ...a.payment!, upfrontPercent: Math.min(100, Math.max(0, Number(e.target.value))) } })} />
              </label>
            </div>
          )}

          <div className="card stack" style={{ background: "var(--ink)", color: "#fff", border: 0 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "Oswald", fontSize: 20, textTransform: "uppercase" }}>Sign and send to {client.name || "your client"}</div>
                <div className="small" style={{ color: "#cfc6bc" }}>Signing with {signer.label} · <span className="mono">{signer.pubkey.slice(0, 4)}…{signer.pubkey.slice(-4)}</span></div>
              </div>
              <button className="btn" onClick={sign} disabled={busy || !provider.name.trim() || provider.name === "Provider"}>{busy ? "Signing…" : "Sign as provider"}</button>
            </div>
            {(!provider.name.trim() || provider.name === "Provider") && <div className="small" style={{ color: "#f0b4ae" }}>Add your name above first.</div>}
            {error && <div className="error">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
