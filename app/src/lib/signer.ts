import { Keypair, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

// Anything that can sign for one Solana address: a browser wallet, or the embedded key below.
export interface Signer {
  kind: "wallet" | "embedded";
  label: string;
  pubkey: string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  signTransaction(tx: Transaction): Promise<Transaction>;
}


// "No wallet needed": a key generated and kept in this browser. Fine for a devnet demo;
// in production this becomes an embedded wallet with recovery (passkey / email).
// One key per role, so a single browser can play both sides in a demo.
export function embeddedSigner(role: "provider" | "client"): Signer {
  const KEY = `rocksign.embeddedKey.${role}`;
  let kp: Keypair;
  try {
    const saved = localStorage.getItem(KEY);
    kp = saved ? Keypair.fromSecretKey(bs58.decode(saved)) : Keypair.generate();
    if (!saved) localStorage.setItem(KEY, bs58.encode(kp.secretKey));
  } catch {
    kp = Keypair.generate(); // storage blocked: key lives for this tab only
  }
  return {
    kind: "embedded",
    label: "RockSign key (this browser)",
    pubkey: kp.publicKey.toBase58(),
    signMessage: async (m) => nacl.sign.detached(m, kp.secretKey),
    signTransaction: async (tx) => {
      tx.partialSign(kp);
      return tx;
    },
  };
}
