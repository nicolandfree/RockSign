// Builds the standalone pitch deck from the same slide files the online deck uses.
//   node pitch/build.mjs  →  dist/RockSign-Pitch.html (offline, single file) + dist/RockSign-Pitch.pdf
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const deck = JSON.parse(readFileSync(join(ROOT, 'pitch/project/deck.json'), 'utf8'));
const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');

// The online deck references uploaded assets by blob id; the standalone file embeds them.
const BLOBS = {
  '/_blob/a0013e913a0496b12cdff495d0fc1cac': `data:image/webp;base64,${b64('assets/wordmark.webp')}`,
  '/_blob/6286e9c32066501ff74b56f200114824': `data:image/webp;base64,${b64('assets/isotype.webp')}`,
};

const fonts = JSON.parse(readFileSync(join(ROOT, 'assets/fonts/fonts.json'), 'utf8'))
  .map((f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-display:block;src:url(data:font/woff2;base64,${b64('assets/fonts/' + f.file)}) format('woff2')}`)
  .join('\n');

// Lucide-style strokes for the three <x-icon> names the deck uses.
const ICONS = {
  Chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  Lightbulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  Verified: '<path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
};

function toStandalone(html) {
  return html
    .replace(/\/_blob\/[0-9a-f]{32}/g, (m) => BLOBS[m] ?? m)
    .replace(/<x-icon name="(\w+)" style="([^"]*)"><\/x-icon>/g, (_, name, style) =>
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style};flex:none" aria-label="${name}">${ICONS[name]}</svg>`)
    .replace(/<x-connector style="width:(\d+)px;color:([^;]+);border-width:(\d+)px"><\/x-connector>/g, (_, w, c, sw) =>
      `<svg width="${w}" height="28" viewBox="0 0 ${w} 28" style="flex:none" aria-hidden="true"><path d="M2 14H${w - 6}M${w - 16} 4L${w - 4} 14L${w - 16} 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`)
    // The online format puts one cell padding on <table>; plain HTML wants it on the cells.
    .replace(/<table style="([^"]*?);padding:([^"]+)">/g, (_, s, pad) => `<table style="${s}" data-pad="${pad}">`)
    .replace(/<aside>/g, '<aside class="notes">');
}

const slides = deck.order.map((id) => toStandalone(readFileSync(join(ROOT, `pitch/project/slides/${id}.html`), 'utf8').trim()));

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RockSign — Pitch Deck</title>
<style>
${fonts}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#0d0b09;height:100%}
body{overflow:hidden;font-family:'DM Sans',Arial,sans-serif}
section{width:1920px;height:1080px;position:absolute;left:0;top:0;overflow:hidden;transform-origin:0 0}
section b{font-weight:700}
hr{border:none;width:100%}
table{border-collapse:collapse;width:100%}
td,th{padding:20px 24px;border-bottom:1px solid rgba(243,238,231,.16);font-weight:400}
th{font-weight:600}
aside.notes{display:none}
#ui{position:fixed;right:20px;bottom:16px;font:600 14px 'DM Sans',sans-serif;color:#9A9088;letter-spacing:.06em;user-select:none;display:flex;gap:14px;align-items:center;z-index:9}
#ui button{all:unset;cursor:pointer;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,.06);color:#CFC6BC}
#ui button:hover{background:rgba(255,255,255,.14)}
#notes{position:fixed;left:0;right:0;bottom:0;max-height:30vh;overflow:auto;background:rgba(13,11,9,.94);color:#F3EEE7;font:18px/1.5 'DM Sans',sans-serif;padding:18px 28px 52px;display:none;z-index:8}
body.show-notes #notes{display:block}
@media print{
  @page{size:1920px 1080px;margin:0}
  html,body{height:auto;overflow:visible;background:none}
  section{position:relative;visibility:visible !important;transform:none !important;break-after:page}
  #ui,#notes{display:none !important}
}
</style></head>
<body>
${slides.join('\n')}
<div id="notes"></div>
<div id="ui"><button id="prev" aria-label="Previous slide">‹</button><span id="count"></span><button id="next" aria-label="Next slide">›</button><button id="nb" title="Speaker notes (N)">Notes</button><button id="fs" title="Fullscreen (F)">Fullscreen</button></div>
<script>
const S=[...document.querySelectorAll('section')];
S.forEach(s=>{const t=s.querySelector('table[data-pad]');if(t)t.querySelectorAll('td,th').forEach(c=>c.style.padding=t.dataset.pad)});
let i=Math.max(0,Math.min(S.length-1,(parseInt(location.hash.slice(1))||1)-1));
function fit(){const k=Math.min(innerWidth/1920,innerHeight/1080),x=(innerWidth-1920*k)/2,y=(innerHeight-1080*k)/2;S.forEach(s=>s.style.transform='translate('+x+'px,'+y+'px) scale('+k+')')}
function show(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach((s,j)=>s.style.visibility=j===i?'visible':'hidden');count.textContent=(i+1)+' / '+S.length;history.replaceState(null,'','#'+(i+1));const a=S[i].querySelector('aside');notes.textContent=a?a.textContent:''}
addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();show(i+1)}else if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();show(i-1)}else if(e.key==='Home')show(0);else if(e.key==='End')show(S.length-1);else if(e.key==='n'||e.key==='N')document.body.classList.toggle('show-notes');else if(e.key==='f'||e.key==='F')toggleFs()});
function toggleFs(){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}
prev.onclick=()=>show(i-1);next.onclick=()=>show(i+1);nb.onclick=()=>document.body.classList.toggle('show-notes');fs.onclick=toggleFs;
let x0=null;addEventListener('touchstart',e=>x0=e.touches[0].clientX,{passive:true});addEventListener('touchend',e=>{if(x0===null)return;const d=e.changedTouches[0].clientX-x0;if(Math.abs(d)>40)show(i+(d<0?1:-1));x0=null});
addEventListener('resize',fit);fit();show(i);
</script>
</body></html>`;

const htmlPath = join(ROOT, 'dist/RockSign-Pitch.html');
writeFileSync(htmlPath, page);
console.log('wrote', htmlPath, (page.length / 1024).toFixed(0) + ' KB');

const browser = await chromium.launch({ channel: 'chrome' });
const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await tab.goto('file://' + htmlPath);
await tab.evaluate(() => document.fonts.ready);
await tab.pdf({ path: join(ROOT, 'dist/RockSign-Pitch.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
// Preview PNGs of every slide, for a quick visual check.
for (let n = 0; n < deck.order.length; n++) {
  await tab.evaluate((n) => show(n), n);
  await tab.screenshot({ path: join(ROOT, `dist/preview/slide-${String(n + 1).padStart(2, '0')}.png`) });
}
await browser.close();
console.log('wrote dist/RockSign-Pitch.pdf and dist/preview/*.png');
