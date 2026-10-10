import { useEffect, useMemo, useState } from "react";
import { decodeEnvelope, encodeEnvelope, envelopeLink, type Envelope } from "../lib/share.ts";
import { agreementHash, milestones, verifyDelivery, verifySignature } from "../lib/agreement.ts";
import QRCode from "qrcode";
import { faucet, findPayments, payMilestone, seal, signAgreement, signDelivery, solanaPayUrl, usdcArsRate, usdcBalance, verifySeal, type Verification } from "../lib/chain.ts";
import { fmt } from "../lib/extract.ts";
import { useClipPlayer, useSigner } from "../lib/hooks.ts";
import { explorerTx, feeOf, FEE_BPS } from "../config/chain.ts";
import type { Party } from "../lib/types.ts";

// Fixed text of the agreement document, in the language of the call.
const DOC = {
  en: { eyebrow: (d: string) => `SERVICE AGREEMENT · DRAFTED FROM A RECORDED CALL ON ${d}`, provider: "Service provider", client: "Client", said: "Said on the call", rec: "Recording", agr: "Agreement",
    note: "Each party signs this agreement hash with an Ed25519 key. The two signatures and the hash are then written to Solana, which timestamps them and makes any later change to the text detectable." },
  es: { eyebrow: (d: string) => `ACUERDO DE SERVICIOS · REDACTADO A PARTIR DE UNA LLAMADA GRABADA EL ${d}`, provider: "Proveedor", client: "Cliente", said: "Dicho en la llamada", rec: "Grabación", agr: "Acuerdo",
    note: "Cada parte firma el hash de este acuerdo con una clave Ed25519. Las dos firmas y el hash se escriben en Solana, que les pone fecha y hace detectable cualquier cambio posterior al texto." },
};

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

export default function AgreementView({ data }: { data: string }) {
  const envelope = useMemo(() => decodeEnvelope(data), [data]);
  const [hash, setHash] = useState("");
  useEffect(() => { if (envelope) void agreementHash(envelope.agreement).then(setHash); }, [envelope]);
  const player = useClipPlayer(envelope?.agreement.audioUrl);
  const [sealQr, setSealQr] = useState("");
  useEffect(() => { if (envelope?.sealTx) void QRCode.toDataURL(explorerTx(envelope.sealTx), { margin: 1, width: 160 }).then(setSealQr); }, [envelope?.sealTx]);
  if (!envelope) return <div className="error">This agreement link is damaged. Ask the sender for a new one.</div>;
  const { agreement: a, signatures } = envelope;
  const party = (role: Party["role"]) => a.parties.find((p) => p.role === role)!;
  const sigOf = (role: Party["role"]) => signatures.find((s) => s.role === role);
  const t = DOC[a.language ?? "en"];

  return (
    <div className="layout">
      <article className="doc">
        <div className="eyebrow">{t.eyebrow(a.createdAt)}</div>
        <h1>{a.title}</h1>
        <div className="parties">
          {(["provider", "client"] as const).map((r) => (
            <div key={r}>
              <h3>{r === "provider" ? t.provider : t.client}</h3>
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
              <div className="quote">{DOC[a.language ?? "en"].said}: "{t.quote}"</div>
            </div>
            <button className={`play${player.playing === `c${i}` ? " on" : ""}`} onClick={() => player.play(`c${i}`, t.start, t.end)} disabled={!player.available} title={player.available ? "Hear it from the call" : "The recording stays with the provider"}>
              {player.playing === `c${i}` ? "■" : "▶"} {fmt(t.start)}
            </button>
          </div>
        ))}
        <div className="small muted" style={{ marginTop: 18 }}>
          {t.rec} SHA-256 <span className="mono">{a.recordingSha256}</span><br />
          {t.agr} SHA-256 <span className="mono">{hash}</span><br />
          {t.note}
        </div>
        {envelope.sealTx && (
          <div className="print-only seal-block">
            {sealQr && <img src={sealQr} alt="" />}
            <div className="small">
              <b>{a.language === "es" ? "Sellado en Solana" : "Sealed on Solana"}</b> · {signatures.map((s) => `${a.parties.find((p) => p.role === s.role)!.name}: ${s.pubkey}`).join(" · ")}<br />
              Tx <span className="mono">{envelope.sealTx}</span><br />
              {a.language === "es" ? "Verificá este documento en" : "Verify this document at"} {location.origin}/#/verify
            </div>
          </div>
        )}
      </article>

      <aside className="side">
        <Signatures envelope={envelope} hash={hash} />
        {sigOf("provider") && sigOf("client") && envelope.sealTx && a.payment && <Payments envelope={envelope} hash={hash} />}
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
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="pill ok">✓ Sealed on Solana · <a href={explorerTx(envelope.sealTx)} target="_blank" rel="noreferrer">view tx</a></div>
          <button className="btn ghost small" onClick={() => window.print()}>Download PDF</button>
        </div>
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

const usd = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function Payments({ envelope, hash }: { envelope: Envelope; hash: string }) {
  const { agreement: a, signatures, delivered } = envelope;
  const provider = signatures.find((s) => s.role === "provider")!;
  const client = signatures.find((s) => s.role === "client")!;
  const providerSigner = useSigner("provider");
  const clientSigner = useSigner("client");
  const isProvider = providerSigner.pubkey === provider.pubkey;
  const isClient = clientSigner.pubkey === client.pubkey;
  const plan = milestones(a);
  const deliveredOk = !!delivered && !!hash && verifyDelivery(hash, a.title, delivered);
  const [paid, setPaid] = useState<Record<number, string | null> | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [ars, setArs] = useState<{ rate: number; venue: string } | null>(null);
  const [qr, setQr] = useState<{ n: number; img: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => void findPayments(a, provider.pubkey).then(setPaid);
  useEffect(refresh, [a, provider.pubkey]);
  useEffect(() => { if (isClient) void usdcBalance(clientSigner.pubkey).then(setBalance); }, [clientSigner.pubkey, isClient, paid]);
  useEffect(() => { if (isProvider) void usdcArsRate().then(setArs); }, [isProvider]);
  // Payments made from another wallet via the QR show up here on their own.
  useEffect(() => { if (!qr) return; const t = setInterval(refresh, 4000); return () => clearInterval(t); });

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const received = plan.filter((m) => paid?.[m.n]).reduce((t, m) => t + m.amount - feeOf(m.amount), 0);
  const due = (m: (typeof plan)[number]) => m.due === "signing" || deliveredOk;

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Getting paid</h3>
        <span className="small muted">{usd(a.payment!.total)} USDC total</span>
      </div>

      {plan.map((m) => {
        const tx = paid?.[m.n];
        const fee = feeOf(m.amount);
        return (
          <div key={m.n} className="milestone">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b style={{ color: "var(--ink)" }}>{m.label}</b>
              {paid === null ? <span className="small muted">checking…</span>
                : tx ? <span className="pill ok">✓ Paid · <a href={explorerTx(tx)} target="_blank" rel="noreferrer">tx</a></span>
                : due(m) ? <span className="pill red">Due now</span> : <span className="pill">Due on delivery</span>}
            </div>
            <div className="fee-lines small">
              <span>Client pays</span><span>{usd(m.amount)} USDC</span>
              <span>{a.parties[0].name} receives</span><span>{usd(m.amount - fee)} USDC</span>
              <span className="muted">RockSign fee ({FEE_BPS / 100}%)</span><span className="muted">{usd(fee)} USDC</span>
            </div>
            {isClient && !tx && due(m) && paid !== null && (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn ok" style={{ flex: 1 }} disabled={!!busy || balance === null || balance < m.amount}
                    onClick={() => run(`pay${m.n}`, async () => { await payMilestone(a, provider.pubkey, m.n, m.amount, clientSigner); refresh(); })}>
                    {busy === `pay${m.n}` ? "Paying…" : `Pay ${usd(m.amount)} USDC`}
                  </button>
                  <button className="btn ghost" title="Pay from any Solana wallet app" disabled={!!busy}
                    onClick={() => run("qr", async () => { setQr(qr?.n === m.n ? null : { n: m.n, img: await QRCode.toDataURL(await solanaPayUrl(a, provider.pubkey, m.n, m.amount), { margin: 1, width: 220 }) }); })}>QR</button>
                </div>
                {qr?.n === m.n && (
                  <div className="qr"><img src={qr.img} alt="Solana Pay QR code" /><div className="small muted">Scan with Phantom, Solflare or any Solana Pay wallet. RockSign pays the network fee.</div></div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {isClient && balance !== null && plan.some((m) => !paid?.[m.n] && due(m) && balance < m.amount) && (
        <div className="row small" style={{ justifyContent: "space-between" }}>
          <span>Your balance: <b>{usd(balance)} USDC</b> <span className="muted">(devnet test)</span></span>
          <button className="btn ghost small" disabled={!!busy} onClick={() => run("faucet", async () => { await faucet(clientSigner.pubkey); setBalance(await usdcBalance(clientSigner.pubkey)); })}>{busy === "faucet" ? "Minting…" : "Get 2,000 test USDC"}</button>
        </div>
      )}

      {isProvider && plan.some((m) => m.due === "delivery") && !delivered && (
        <button className="btn dark" disabled={!!busy} onClick={() => run("deliver", async () => {
          const sig = await signDelivery(a, providerSigner);
          location.hash = `/a/${encodeEnvelope({ ...envelope, delivered: sig })}`;
        })}>{busy === "deliver" ? "Signing…" : "Mark work as delivered"}</button>
      )}
      {delivered && (
        <div className={`pill ${deliveredOk ? "ok" : "red"}`} style={{ alignSelf: "flex-start" }}>
          {deliveredOk ? `✓ Delivered ${new Date(delivered.signedAt).toLocaleDateString()} · signed by ${a.parties[0].name}` : "Delivery notice signature is invalid"}
        </div>
      )}
      {isProvider && delivered && plan.some((m) => m.due === "delivery" && !paid?.[m.n]) && (
        <div className="small">Send the updated link to {a.parties[1].name} to request the final payment.</div>
      )}

      {isProvider && received > 0 && (
        <div className="ars small">
          You've received <b>{usd(received)} USDC</b>
          {ars && <> ≈ <b>ARS {Math.round(received * ars.rate).toLocaleString("es-AR")}</b> <span className="muted">at {ars.venue} ({ars.rate.toLocaleString("es-AR")} ARS/USDC, live)</span></>}
        </div>
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
