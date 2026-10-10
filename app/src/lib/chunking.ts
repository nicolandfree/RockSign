// Splits mono 16 kHz audio into pieces of at most `maxSec`, cutting inside pauses.
// Whisper only sees 30 s at a time, and transformers.js drops text when it merges
// its own overlapping windows, so we cut at silences ourselves and offset each piece.

export interface AudioPiece {
  offset: number; // seconds from the start of the recording
  samples: Float32Array;
}

const RATE = 16000;
const FRAME = 320; // 20 ms

export function splitOnSilence(audio: Float32Array, maxSec = 25, minPauseSec = 0.25): AudioPiece[] {
  const frames = Math.floor(audio.length / FRAME);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i++) sum += audio[i] * audio[i];
    rms[f] = Math.sqrt(sum / FRAME);
  }
  // Silence threshold relative to the loud parts of this recording.
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const threshold = Math.max(sorted[Math.floor(frames * 0.9)] * 0.08, 1e-4);

  // Midpoints of every pause long enough to be a turn boundary.
  const cuts: number[] = [];
  const minPause = Math.round(minPauseSec / 0.02);
  let runStart = -1;
  for (let f = 0; f <= frames; f++) {
    const silent = f < frames && rms[f] < threshold;
    if (silent && runStart < 0) runStart = f;
    if (!silent && runStart >= 0) {
      if (f - runStart >= minPause) cuts.push(Math.floor((runStart + f) / 2) * FRAME);
      runStart = -1;
    }
  }

  // Greedy: take the furthest cut that keeps the piece under maxSec.
  const pieces: AudioPiece[] = [];
  const maxLen = maxSec * RATE;
  let start = 0;
  while (start < audio.length) {
    let end = audio.length;
    if (end - start > maxLen) {
      const fits = cuts.filter((c) => c > start + RATE && c <= start + maxLen);
      end = fits.length ? fits[fits.length - 1] : start + maxLen;
    }
    // Whisper's timestamp mode returns nothing when a piece opens with a long pause,
    // so each piece starts 0.2 s before its first non-silent frame.
    let first = Math.floor(start / FRAME);
    while (first < Math.floor(end / FRAME) && rms[first] < threshold) first++;
    const from = Math.max(start, first * FRAME - 10 * FRAME);
    if (end - from > RATE / 2) pieces.push({ offset: from / RATE, samples: audio.subarray(from, end) });
    start = end;
  }
  return pieces;
}
