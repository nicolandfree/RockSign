#!/usr/bin/env python3
"""Synthesize every spoken line with Piper, lay them on one timeline and write:
  build/track.wav   - the full demo soundtrack (mono, 22.05 kHz)
  build/timeline.json - when each scene / line / replay happens, in seconds
The demo page and the video renderer both read timeline.json, so picture and
sound stay in sync by construction."""
import array, json, subprocess, wave
from pathlib import Path

HERE = Path(__file__).parent
VOICES = Path.home() / "apps/piper/voices"
PIPER = str(Path.home() / "bin/piper")
BUILD = HERE / "build"
(BUILD / "lines").mkdir(parents=True, exist_ok=True)

script = json.loads((HERE / "script.json").read_text())
RATE = 22050
# Narrator a touch slower and clearer; call voices at natural pace.
LENGTH_SCALE = {"narrator": 1.05, "lucy": 1.0, "mark": 1.0}


def synth(idx, who, text):
    out = BUILD / "lines" / f"{idx:02d}_{who}.wav"
    if not out.exists():
        subprocess.run(
            [PIPER, "--model", str(VOICES / f"{script['voices'][who]}.onnx"),
             "--length_scale", str(LENGTH_SCALE[who]), "--output_file", str(out)],
            input=text.encode(), check=True, capture_output=True)
    with wave.open(str(out)) as w:
        assert w.getframerate() == RATE and w.getsampwidth() == 2 and w.getnchannels() == 1
        return array.array("h", w.readframes(w.getnframes()))


t = 0.0
samples = array.array("h")
scenes, lines, by_id = [], [], {}


def place(pcm):
    """Append pcm at time t (timeline is strictly sequential, no overlaps)."""
    global t
    start = round(t * RATE)
    if len(samples) < start:
        samples.extend([0] * (start - len(samples)))
    samples.extend(pcm)
    dur = len(pcm) / RATE
    t += dur
    return dur


for idx, item in enumerate(script["items"]):
    if "scene" in item:
        if scenes:
            scenes[-1]["end"] = round(t, 3)
        scenes.append({"name": item["scene"], "start": round(t, 3)})
    elif "pause" in item:
        t += item["pause"]
    elif "replay" in item:
        src = by_id[item["replay"]]
        pcm = synth(src["idx"], src["who"], src["say"])
        start = t
        dur = place(pcm)
        lines.append({**{k: v for k, v in src.items() if k != "idx"}, "id": src["id"] + "-replay",
                      "replay": src["id"], "start": round(start, 3), "end": round(start + dur, 3)})
    else:
        who, text = item["who"], item["text"]
        say = item.get("say", text)
        pcm = synth(idx, who, say)
        start = t
        dur = place(pcm)
        line = {"id": item.get("id", f"N{idx}"), "who": who, "text": text, "say": say,
                "scene": scenes[-1]["name"], "start": round(start, 3), "end": round(start + dur, 3)}
        if "detect" in item:
            line["detect"] = item["detect"]
        lines.append(line)
        by_id[line["id"]] = {**line, "idx": idx}

scenes[-1]["end"] = round(t, 3)
end = round(t * RATE)
samples.extend([0] * max(0, end - len(samples)))

with wave.open(str(BUILD / "track.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes(samples.tobytes())

call = next(s for s in scenes if s["name"] == "call")
timeline = {"duration": round(t, 3), "callStart": call["start"], "callEnd": call["end"],
            "people": script["people"], "scenes": scenes, "lines": lines}
(BUILD / "timeline.json").write_text(json.dumps(timeline, indent=1))

print(f"total {t:.1f}s")
for s in scenes:
    print(f"  {s['name']:<10} {s['start']:6.1f} → {s['end']:6.1f}")
for l in lines:
    if l.get("detect"):
        c = l["start"] - call["start"]
        print(f"  {l['detect']['label']:<14} said at call {int(c//60):02d}:{int(c%60):02d}")
