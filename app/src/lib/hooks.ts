import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { Transaction } from "@solana/web3.js";
import { embeddedSigner, type Signer } from "./signer.ts";

export function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => { setHash(location.hash.slice(1) || "/"); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}
export const go = (path: string) => { location.hash = path; };

// Plays [start, end] of one recording; returns which clip key is playing.
export function useClipPlayer(src: string | undefined) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!src) return;
    const a = new Audio(src);
    a.preload = "auto";
    const tick = () => {
      setTime(a.currentTime);
      if (a.currentTime >= stopAt.current) { a.pause(); setPlaying(null); }
    };
    a.addEventListener("timeupdate", tick);
    a.addEventListener("ended", () => setPlaying(null));
    audio.current = a;
    return () => { a.pause(); a.removeEventListener("timeupdate", tick); audio.current = null; };
  }, [src]);
  const play = useCallback((key: string, start: number, end: number) => {
    const a = audio.current;
    if (!a) return;
    if (playing === key) { a.pause(); setPlaying(null); return; }
    a.currentTime = Math.max(0, start - 0.15);
    stopAt.current = end + 0.25;
    void a.play();
    setPlaying(key);
  }, [playing]);
  return { play, playing, time, available: !!src };
}

// The signer to use: the connected browser wallet if there is one, else the embedded key.
export function useSigner(role: "provider" | "client"): Signer {
  const wallet = useWallet();
  return useMemo(() => {
    if (wallet.connected && wallet.publicKey && wallet.signMessage && wallet.signTransaction) {
      const signTx = wallet.signTransaction;
      return {
        kind: "wallet" as const,
        label: wallet.wallet?.adapter.name ?? "Wallet",
        pubkey: wallet.publicKey.toBase58(),
        signMessage: wallet.signMessage,
        signTransaction: (tx: Transaction) => signTx(tx),
      };
    }
    return embeddedSigner(role);
  }, [role, wallet.connected, wallet.publicKey, wallet.signMessage, wallet.signTransaction, wallet.wallet]);
}

export function useApiKey(): [string, (k: string) => void] {
  const [key, setKey] = useState(() => { try { return localStorage.getItem("rocksign.anthropicKey") ?? ""; } catch { return ""; } });
  const save = (k: string) => { setKey(k); try { localStorage.setItem("rocksign.anthropicKey", k); } catch { /* storage blocked */ } };
  return [key, save];
}
