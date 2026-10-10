// Records the live product (https://rocksign.vercel.app) for the demo video.
// Each scene lasts at least as long as its narration; scene starts and ▶ clip plays are
// written to build/events.json so build.sh can lay the audio over the video.
import { chromium } from "/home/marche/RockSign/node_modules/playwright/index.mjs";
import fs from "node:fs";

const URL = "https://rocksign.vercel.app";
const dur = Object.fromEntries(fs.readFileSync("durations.txt", "utf8").trim().split("\n").map((l) => l.split(" ")).map(([k, v]) => [k, Number(v)]));
fs.mkdirSync("build/raw", { recursive: true });

const browser = await chromium.launch({ executablePath: process.argv[2] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, recordVideo: { dir: "build/raw", size: { width: 1440, height: 810 } } });
const p = await ctx.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const events = [];
const wait = (s) => p.waitForTimeout(s * 1000);

// A visible cursor, since recorded video has none.
const CURSOR = `(() => { if (document.getElementById("__c")) return; const c = document.createElement("div"); c.id = "__c";
  c.style.cssText = "position:fixed;z-index:99999;left:720px;top:420px;width:22px;height:22px;border-radius:50%;background:rgba(200,30,23,.35);border:2px solid #c81e17;pointer-events:none;transition:left .55s ease,top .55s ease,transform .15s;transform:translate(-50%,-50%)";
  document.documentElement.appendChild(c); })()`;
await p.addInitScript(CURSOR);
async function moveTo(loc) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  await p.evaluate(CURSOR);
  await p.evaluate(([x, y]) => { const c = document.getElementById("__c"); c.style.left = x + "px"; c.style.top = y + "px"; }, [b.x + b.width / 2, b.y + b.height / 2]);
  await wait(0.7);
}
async function click(loc) {
  await moveTo(loc);
  await p.evaluate(() => { const c = document.getElementById("__c"); c.style.transform = "translate(-50%,-50%) scale(.7)"; setTimeout(() => (c.style.transform = "translate(-50%,-50%)"), 160); });
  await loc.click();
}
// Narration normally starts with the scene; a scene that plays call audio first starts it itself
// with narrate(), so the two voices never overlap.
let narratedAt = 0;
function narrate(id) { narratedAt = now(); events.push({ type: "scene", id, at: narratedAt }); console.log(`${narratedAt.toFixed(1)}s narration ${id}`); }
async function scene(id, fn, { defer = false } = {}) {
  narratedAt = now();
  if (!defer) narrate(id);
  await fn();
  const left = dur[id] + 0.6 - (now() - narratedAt);
  if (left > 0) await wait(left);
}
const untilNarrationEnds = async (id) => { const left = dur[id] + 0.3 - (now() - narratedAt); if (left > 0) await wait(left); };
const smoothScroll = (y) => p.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y);

await p.goto(URL);
await wait(1);
await scene("intro", async () => {
  await wait(5);
  await smoothScroll(700);
  await wait(4);
  await smoothScroll(0);
});
await scene("process", async () => {
  await click(p.getByRole("button", { name: "▶ Try a sample call" }));
  events.push({ type: "cut-start", at: now() + 9 }); // keep ~9 s of the live progress, then skip the rest
  await p.waitForURL(/#\/review/, { timeout: 300000 });
  events.push({ type: "cut-end", at: now() - 2.5 });
});
await scene("review", async () => {
  await wait(1);
  const pay = p.locator(".term").filter({ hasText: "Payment schedule" });
  await moveTo(pay);
  await untilNarrationEnds("review");
  await click(pay.locator("button.play"));
  events.push({ type: "clip", at: now(), from: 36.3, to: 43.9 });
  await wait(8);
});
await scene("sign1", async () => {
  await click(p.getByRole("button", { name: "Sign as provider" }));
  await p.waitForURL(/#\/a\//);
  await wait(1.5);
  await moveTo(p.locator(".linkbox input"));
});
let agreementUrl = "";
await scene("client", async () => {
  const rev = p.locator(".clause").filter({ hasText: "REVISIONS" }).locator("button.play");
  await click(rev);
  events.push({ type: "clip", at: now(), from: 43.9, to: 53.7 });
  await wait(10);
  narrate("client");
  await wait(5);
  await click(p.getByRole("button", { name: /^Sign as Mark/ }));
  await p.getByText(/✓ Sealed on Solana/).waitFor({ timeout: 60000 });
  agreementUrl = p.url();
  await moveTo(p.getByText(/✓ Sealed on Solana/));
}, { defer: true });
await scene("explorer", async () => {
  const href = await p.locator(".side a", { hasText: "view tx" }).first().getAttribute("href");
  await p.goto(href);
  await p.getByText(/rocksign:v1/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await p.evaluate(CURSOR);
  const memo = p.getByText(/rocksign:v1/).first();
  if (await memo.count()) await moveTo(memo);
  await wait(4);
});
await scene("pay", async () => {
  await p.goto(agreementUrl);
  await p.locator(".milestone").first().waitFor();
  await wait(1.5);
  const faucet = p.getByRole("button", { name: /test USDC/ });
  if (await faucet.count()) {
    await click(faucet);
    await p.waitForFunction(() => ![...document.querySelectorAll("button")].find((x) => x.textContent === "Pay 600 USDC")?.disabled, null, { timeout: 60000 });
  }
  await moveTo(p.locator(".milestone").first().locator(".fee-lines"));
  await wait(2.5);
  await click(p.getByRole("button", { name: "Pay 600 USDC" }).first());
  await p.locator(".milestone").first().getByText("✓ Paid").waitFor({ timeout: 60000 });
  await moveTo(p.locator(".milestone").first().getByText("✓ Paid"));
});
await scene("deliver", async () => {
  await click(p.getByRole("button", { name: "Mark work as delivered" }));
  await p.getByText(/Delivered .* signed by/).waitFor({ timeout: 20000 });
  await click(p.getByRole("button", { name: "QR" }));
  await wait(3.5);
  await click(p.getByRole("button", { name: "Pay 600 USDC" }));
  await p.waitForFunction(() => document.body.innerText.split("✓ Paid").length > 2, null, { timeout: 60000 });
});
await scene("pesos", async () => {
  await p.getByText(/You've received/).waitFor({ timeout: 20000 });
  await moveTo(p.getByText(/You've received/));
});
await scene("verify", async () => {
  await click(p.getByRole("button", { name: "Verify on Solana" }));
  await p.getByText("This text matches the hash on chain").waitFor({ timeout: 30000 });
  await moveTo(p.getByText("This text matches the hash on chain"));
});
await scene("extras", async () => {
  await p.goto(`${URL}/#/`);
  await moveTo(p.getByRole("button", { name: /español/ }));
  await wait(1.5);
  await click(p.getByRole("button", { name: /Record a call/ }));
  await wait(2.5);
  await click(p.getByRole("link", { name: "Live stats" }));
  await p.getByText("Fees collected").waitFor();
});
await scene("outro", async () => {
  await p.goto(`${URL}/#/`);
  await wait(2);
});
fs.writeFileSync("build/events.json", JSON.stringify({ total: now(), events }, null, 1));
const video = p.video();
await ctx.close();
fs.copyFileSync(await video.path(), "build/screen.webm");
await browser.close();
console.log("done", now().toFixed(1), "s");
