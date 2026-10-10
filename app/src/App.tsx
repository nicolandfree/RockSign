import { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useApiKey, useHashRoute } from "./lib/hooks.ts";
import { CLUSTER } from "./config/chain.ts";
import Home from "./pages/Home.tsx";
import Process from "./pages/Process.tsx";
import Review from "./pages/Review.tsx";
import AgreementView from "./pages/AgreementView.tsx";
import Verify from "./pages/Verify.tsx";
import Stats from "./pages/Stats.tsx";

export default function App() {
  const route = useHashRoute();
  const [apiKey, setApiKey] = useApiKey();
  const [showKey, setShowKey] = useState(false);

  let page;
  if (route.startsWith("/a/")) page = <AgreementView data={route.slice(3)} />;
  else if (route.startsWith("/process/")) page = <Process source={route.slice(9)} apiKey={apiKey} onNeedKey={() => setShowKey(true)} />;
  else if (route === "/review") page = <Review />;
  else if (route === "/verify") page = <Verify />;
  else if (route === "/stats") page = <Stats />;
  else page = <Home apiKey={apiKey} onKey={() => setShowKey(true)} />;

  return (
    <>
      <header className="top">
        <a className="brand" href="#/"><img src="/brand/wordmark.webp" alt="RockSign" /></a>
        <nav>
          <a className="btn ghost small" href="#/stats">Live stats</a>
          <span className="net">Solana {CLUSTER}</span>
          <button className="btn ghost small" onClick={() => setShowKey(true)}>{apiKey ? "Claude key ✓" : "Claude key"}</button>
          <WalletMultiButton style={{ height: 34, fontSize: 13, borderRadius: 8, background: "#171310", fontFamily: "DM Sans" }} />
        </nav>
      </header>
      <main>{page}</main>
      <div className="foot">RockSign · hackathon build on Solana {CLUSTER} · audio is transcribed in your browser and never uploaded</div>
      {showKey && <KeyModal value={apiKey} onSave={(k) => { setApiKey(k); setShowKey(false); }} onClose={() => setShowKey(false)} />}
    </>
  );
}

function KeyModal({ value, onSave, onClose }: { value: string; onSave: (k: string) => void; onClose: () => void }) {
  const [k, setK] = useState(value);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h2>Your Claude API key</h2>
        <p className="small">RockSign reads the agreed terms with Claude. Your key stays in this browser and is sent only to api.anthropic.com. Without a key you can still run the sample call.</p>
        <input className="text mono" type="password" placeholder="sk-ant-..." value={k} onChange={(e) => setK(e.target.value.trim())} autoFocus />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {value && <button className="btn ghost" onClick={() => onSave("")}>Remove key</button>}
          <button className="btn" onClick={() => onSave(k)} disabled={!k.startsWith("sk-")}>Save</button>
        </div>
      </div>
    </div>
  );
}
