import { useState } from "react";
import { decodeEnvelope } from "../lib/share.ts";
import { VerifyCard } from "./AgreementView.tsx";

// Paste an agreement link: checks its text and signatures against the Solana record.
export default function Verify() {
  const [link, setLink] = useState("");
  const envelope = decodeEnvelope(link.split("#/a/")[1] ?? "");
  return (
    <div className="stack" style={{ maxWidth: 640, margin: "20px auto" }}>
      <h1 style={{ fontSize: 36 }}>Verify an agreement</h1>
      <p>Paste a RockSign agreement link. We recompute its hash in your browser and compare it with the signatures sealed on Solana.</p>
      <input className="text mono" placeholder="https://…/#/a/…" value={link} onChange={(e) => setLink(e.target.value.trim())} />
      {link && !envelope && <div className="error">That doesn't look like a RockSign agreement link.</div>}
      {envelope && !envelope.sealTx && <div className="error">This agreement hasn't been sealed on Solana yet.</div>}
      {envelope?.sealTx && <><div className="card"><b style={{ color: "var(--ink)" }}>{envelope.agreement.title}</b><div className="small muted">{envelope.agreement.parties.map((p) => p.name).join(" · ")}</div></div><VerifyCard envelope={envelope} /></>}
    </div>
  );
}
