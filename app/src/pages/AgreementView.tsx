import { useEffect, useMemo, useState } from "react";
import { decodeEnvelope, encodeEnvelope, envelopeLink, type Envelope } from "../lib/share.ts";
import { agreementHash, verifySignature } from "../lib/agreement.ts";
import { faucet, findPayment, payUpfront, seal, signAgreement, usdcBalance, verifySeal, type Verification } from "../lib/chain.ts";
import { fmt } from "../lib/extract.ts";
import { useClipPlayer, useSigner } from "../lib/hooks.ts";
import { explorerTx } from "../config/chain.ts";
import type { Party } from "../lib/types.ts";

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

export default function AgreementView({ data }: { data: string }) {
  const envelope = useMemo(() => decodeEnvelope(data), [data]);
  const [hash, setHash] = useState("");
  useEffect(() => { if (envelope) void agreementHash(envelope.agreement).then(setHash); }, [envelope]);
  const player = useClipPlayer(envelope?.agreement.audioUrl);
  if (!envelope) return <div className="error">This agreement link is damaged. Ask the sender for a new one.</div>;
  const { agreement: a, signatures } = envelope;
  const party = (role: Party["role"]) => a.parties.find((p) => p.role === role)!;
  const sigOf = (role: Party["role"]) => signatures.find((s) => s.role === role);

  return (
    <div className="layout">
      <article className="doc">
        <div className="eyebrow">SERVICE AGREEMENT · DRAFTED FROM A RECORDED CALL ON {a.createdAt}</div>
        <h1>{a.title}</h1>
        <div className="parties">
          {(["provider", "client"] as const).map((r) => (
            <div key={r}>
              <h3>{r === "provider" ? "Service provider" : "Client"}</h3>
              <div style={{ color: "var(--ink)", fontWeight: 600, fontSize: 17 }}>{party(r).name}</div>
              {party(r).company && <div className="small">{party(r).company}</div>}
            </div>
          ))}
        </div>
        {a.terms.map((t, i) => (
          <div className="clause" key={i}>
            <span className="num">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <span className="label" style={{ font: '600 12px "DM Sans"', textTransform: "uppercase", letterSpacing: ".07em", color: "var(--red)" }}>{t.label}</span>
              <p>{t.value}</p>
              <div className="quote">Said on the call: "{t.quote}"</div>
            </div>
            <button className={`play${player.playing === `c${i}` ? " on" : ""}`} onClick={() => player.play(`c${i}`, t.start, t.end)} disabled={!player.available} title={player.available ? "Hear it from the call" : "The recording stays with the provider"}>
              {player.playing === `c${i}` ? "■" : "▶"} {fmt(t.start)}
            </button>
          </div>
        ))}
        <div className="small muted" style={{ marginTop: 18 }}>
          Recording SHA-256 <span className="mono">{a.recordingSha256}</span><br />
          Agreement SHA-256 <span className="mono">{hash}</span><br />
          Each party signs this agreement hash with an Ed25519 key. The two signatures and the hash are then written to Solana, which timestamps them and makes any later change to the text detectable.
        </div>
      </article>

      <aside className="side">
        <Signatures envelope={envelope} hash={hash} />
        {sigOf("provider") && sigOf("client") && envelope.sealTx && a.payment && a.payment.upfrontPercent > 0 && (
          <Payment envelope={envelope} />
        )}
        {envelope.sealTx && <VerifyCard envelope={envelope} />}
      </aside>
    </div>
  );
}

function Signatures({ envelope, hash }: { envelope: Envelope; hash: string }) {
  const { agreement: a, signatures } = envelope;
  const signer = useSigner("client");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const provider = signatures.find((s) => s.role === "provider");
  const client = signatures.find((s) => s.role === "client");
  const clientName = a.parties.find((p) => p.role === "client")!.name;
  const link = envelopeLink(envelope);

  const signAsClient = async () => {
    setError(null);
    try {
      setBusy("Signing…");
      const sig = await signAgreement(a, "client", signer);
      const signed: Envelope = { ...envelope, signatures: [...signatures, sig] };
      location.hash = `/a/${encodeEnvelope(signed)}`;
      setBusy("Sealing on Solana…");
      const { tx } = await seal(signed);
      location.hash = `/a/${encodeEnvelope({ ...signed, sealTx: tx })}`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const row = (role: Party["role"], s = role === "provider" ? provider : client) => {
    const valid = s && hash ? verifySignature(hash, a.title, s) : false;
    const p = a.parties.find((x) => x.role === role)!;
    return (
      <div className="sig" key={role}>
        <span className={`check${s ? (valid ? " ok" : " bad") : ""}`}>{s ? (valid ? "✓" : "!") : ""}</span>
        <div className="small">
          <b style={{ color: "var(--ink)" }}>{p.name}</b> · {role}
          <div className="muted">{s ? <>signed {new Date(s.signedAt).toLocaleString()} · <span className="mono">{short(s.pubkey)}</span></> : "waiting for signature"}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="card stack">
      <h3>Signatures</h3>
      <div>{row("provider")}{row("client")}</div>
      {envelope.sealTx ? (
        <div className="pill ok" style={{ alignSelf: "flex-start" }}>✓ Sealed on Solana · <a href={explorerTx(envelope.sealTx)} target="_blank" rel="noreferrer">view tx</a></div>
      ) : !client ? (
        <>
          <div className="small">Send this link to {clientName}. They can read it, hear each clause from the call, and sign. No account or wallet needed.</div>
          <div className="linkbox">
            <input className="text" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn ghost small" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <button className="btn" onClick={signAsClient} disabled={!!busy || !hash}>{busy ?? `Sign as ${clientName}`}</button>
          <div className="small muted">Signing as the client with {signer.label}</div>
        </>
      ) : (
        <button className="btn" onClick={async () => { setBusy("Sealing on Solana…"); try { const { tx } = await seal(envelope); location.hash = `/a/${encodeEnvelope({ ...envelope, sealTx: tx })}`; } catch (e) { setError((e as Error).message); } finally { setBusy(null); } }} disabled={!!busy}>{busy ?? "Seal on Solana"}</button>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function Payment({ envelope }: { envelope: Envelope }) {
  const { agreement: a, signatures } = envelope;
  const provider = signatures.find((s) => s.role === "provider")!;
  const signer = useSigner("client");
  const amount = (a.payment!.total * a.payment!.upfrontPercent) / 100;
  const [paidTx, setPaidTx] = useState<string | null | undefined>(undefined);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isProvider = signer.pubkey === provider.pubkey;

  useEffect(() => { void findPayment(a, provider.pubkey).then(setPaidTx); }, [a, provider.pubkey]);
  useEffect(() => { if (!isProvider) void usdcBalance(signer.pubkey).then(setBalance); }, [signer.pubkey, isProvider]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="card stack">
      <h3>Upfront payment</h3>
      <div style={{ fontFamily: "Oswald", fontSize: 30, color: "var(--ink)" }}>{amount.toLocaleString()} <span style={{ fontSize: 16 }}>USDC</span></div>
      <div className="small muted">{a.payment!.upfrontPercent}% of {a.payment!.total.toLocaleString()}, as agreed on the call · paid straight to {a.parties[0].name}'s address</div>
      {paidTx === undefined ? <div className="small muted">Checking payment status…</div>
        : paidTx ? <div className="pill ok" style={{ alignSelf: "flex-start" }}>✓ Paid · <a href={explorerTx(paidTx)} target="_blank" rel="noreferrer">view tx</a></div>
        : isProvider ? <div className="pill">Waiting for the client to pay</div>
        : (
          <>
            <div className="small">Your balance: <b>{balance === null ? "…" : `${balance.toLocaleString()} USDC`}</b> <span className="muted">(devnet test USDC)</span></div>
            {balance !== null && balance < amount && (
              <button className="btn ghost" disabled={!!busy} onClick={() => run("Minting test USDC…", async () => { await faucet(signer.pubkey); setBalance(await usdcBalance(signer.pubkey)); })}>{busy === "Minting test USDC…" ? busy : "Get 2,000 test USDC"}</button>
            )}
            <button className="btn ok" disabled={!!busy || balance === null || balance < amount} onClick={() => run("Paying…", async () => { setPaidTx(await payUpfront(a, provider.pubkey, amount, signer)); })}>
              {busy === "Paying…" ? busy : `Pay ${amount.toLocaleString()} USDC`}
            </button>
            <div className="small muted">RockSign covers the network fee. You only need the USDC.</div>
          </>
        )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

export function VerifyCard({ envelope }: { envelope: Envelope }) {
  const [v, setV] = useState<Verification | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { setV(await verifySeal(envelope.agreement, envelope.sealTx!)); } finally { setBusy(false); } };
  const item = (ok: boolean, text: string) => (
    <div className="sig" key={text}><span className={`check ${ok ? "ok" : "bad"}`}>{ok ? "✓" : "✗"}</span><div className="small">{text}</div></div>
  );
  return (
    <div className="card stack">
      <h3>Independent check</h3>
      <div className="small">Reads the Solana transaction and re-checks this document against it. Nothing is taken from RockSign's servers.</div>
      {!v ? <button className="btn dark" onClick={run} disabled={busy}>{busy ? "Checking the chain…" : "Verify on Solana"}</button> : (
        <div>
          {item(v.txFound, v.txFound ? `Transaction found${v.blockTime ? `, ${new Date(v.blockTime * 1000).toLocaleString()}` : ""}` : "Transaction not found")}
          {item(v.hashMatches, v.hashMatches ? "This text matches the hash on chain" : "This text was changed after signing")}
          {v.signatures.map((s) => item(s.valid, `${s.role === "provider" ? "Provider" : "Client"} signature valid · ${short(s.pubkey)}`))}
        </div>
      )}
    </div>
  );
}
