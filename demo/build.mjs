// Builds the demo from demo.html + build/timeline.json + build/track.wav (run build_audio.py first).
//   node demo/build.mjs                 → dist/RockSign-Demo.html (single file, plays in any browser)
//   node demo/build.mjs --stills 12,40  → dist/stills/*.png at those seconds (quick visual check)
//   node demo/build.mjs --render        → dist/RockSign-Demo.mp4 (1080p30, frame-exact, with the soundtrack)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FPS = 30;
const args = process.argv.slice(2);
const b64 = (p) => readFileSync(p).toString('base64');

// Loudness envelope at FPS, 0–100, so speaking indicators follow the real voices.
function envelope(wavPath) {
  const buf = readFileSync(wavPath);
  const dataAt = buf.indexOf('data') + 8, rate = buf.readUInt32LE(24);
  const pcm = new Int16Array(buf.buffer, buf.byteOffset + dataAt, (buf.length - dataAt) >> 1);
  const hop = Math.round(rate / FPS), out = [];
  for (let i = 0; i < pcm.length; i += hop) {
    let s = 0;
    for (let j = i; j < Math.min(i + hop, pcm.length); j++) s += pcm[j] * pcm[j];
    out.push(Math.sqrt(s / hop));
  }
  const peak = Math.max(...out) || 1;
  return out.map((v) => Math.round(Math.min(1, (v / peak) * 1.6) * 100));
}

const timeline = JSON.parse(readFileSync(join(HERE, 'build/timeline.json'), 'utf8'));
const wav = join(HERE, 'build/track.wav');
const mp3 = join(HERE, 'build/track.mp3');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '96k', mp3]);

const fonts = JSON.parse(readFileSync(join(ROOT, 'assets/fonts/fonts.json'), 'utf8'))
  .map((f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-display:block;src:url(data:font/woff2;base64,${b64(join(ROOT, 'assets/fonts', f.file))}) format('woff2')}`)
  .join('\n');

const html = readFileSync(join(HERE, 'demo.html'), 'utf8')
  .replace('__FONTS__', () => fonts)
  .replace('__TIMELINE__', () => JSON.stringify(timeline))
  .replace('__ENV__', () => JSON.stringify(envelope(wav)))
  .replace('__AUDIO__', () => `data:audio/mpeg;base64,${b64(mp3)}`)
  .replaceAll('__WORDMARK__', () => `data:image/webp;base64,${b64(join(ROOT, 'assets/wordmark.webp'))}`)
  .replaceAll('__ISO__', () => `data:image/webp;base64,${b64(join(ROOT, 'assets/isotype.webp'))}`);

const out = join(ROOT, 'dist/RockSign-Demo.html');
writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024 / 1024).toFixed(1) + ' MB');

if (!args.includes('--render') && !args.includes('--stills')) process.exit(0);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('file://' + out + '?record');
await page.waitForFunction(() => window.READY === true);

if (args.includes('--stills')) {
  const times = args[args.indexOf('--stills') + 1].split(',').map(Number);
  mkdirSync(join(ROOT, 'dist/stills'), { recursive: true });
  for (const t of times) {
    await page.evaluate((t) => window.renderAt(t), t);
    await page.screenshot({ path: join(ROOT, `dist/stills/t${String(t).padStart(6, '0')}.png`) });
  }
  console.log('stills:', times.join(', '));
} else {
  const frames = Math.ceil(timeline.duration * FPS);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', join(ROOT, 'dist/RockSign-Demo.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.renderAt(t), f / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log(`frame ${f}/${frames} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('wrote dist/RockSign-Demo.mp4');
}
await browser.close();
