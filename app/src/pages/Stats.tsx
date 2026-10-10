import { useEffect, useState } from "react";
import { chainStats, type Stats as S } from "../lib/chain.ts";
import { CLUSTER, FEE_BPS, explorerAddress, explorerTx } from "../config/chain.ts";

// Traction, verifiable: nothing here comes from a RockSign database.
export default function Stats() {
  const [s, setS] = useState<S | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { chainStats().then(setS).catch((e) => setError((e as Error).message)); }, []);
  const tile = (label: string, value: string, note: string) => (
    <div className="card"><span className="small muted">{label}</span><b className="big">{value}</b><span className="small">{note}</span></div>
  );
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="stack" style={{ gap: 6 }}>
        <h3>Live on Solana {CLUSTER}</h3>
        <h1 style={{ fontSize: 40 }}>RockSign in numbers</h1>
        <p>Read directly from the chain when you open this page. Anyone can check them in the explorer.</p>
      </div>
      {error && <div className="error">{error}</div>}
      {!s && !error && <div className="muted">Reading the chain…</div>}
      {s && (
        <>
          <div className="pricing">
            {tile("Agreements sealed", s.agreementsSealed.toLocaleString(), "Both parties signed; hash and signatures written on chain")}
            {tile("Paid through RockSign", `${s.volumeUsdc.toLocaleString()} USDC`, `Derived from fees at ${FEE_BPS / 100}%`)}
            {tile("Fees collected", `${s.feesUsdc.toLocaleString()} USDC`, "RockSign's revenue, 1% of each payment")}
          </div>
          <div className="small muted">
            Seals are memo transactions paid by <a href={explorerAddress(s.sponsor)} target="_blank" rel="noreferrer" className="mono">{s.sponsor}</a>
            {s.lastSealTx && <> · latest: <a href={explorerTx(s.lastSealTx)} target="_blank" rel="noreferrer">view tx</a></>}. Devnet test USDC.
          </div>
        </>
      )}
    </div>
  );
}
