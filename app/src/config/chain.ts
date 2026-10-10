// Devnet for the hackathon build. Mainnet needs only these three values changed.
// Vite inlines import.meta.env in the browser; scripts and API routes read process.env.
const env: Record<string, string | undefined> = { ...(globalThis as { process?: { env: Record<string, string> } }).process?.env, ...import.meta.env };

export const CLUSTER = "devnet" as const;
export const RPC_URL = env.VITE_RPC_URL ?? "https://api.devnet.solana.com";
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
// RockSign test USDC on devnet (6 decimals); anyone can get some from /api/faucet.
export const USDC_MINT = env.VITE_USDC_MINT ?? "";
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}?cluster=${CLUSTER}`;
