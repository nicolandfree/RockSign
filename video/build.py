# Assembles the demo video: the live-product recording with the processing wait cut out,
# the narration at each scene start, and the original call audio wherever ▶ was clicked.
import json, subprocess
ev = json.load(open("build/events.json"))
cs = next(e["at"] for e in ev["events"] if e["type"] == "cut-start")
ce = next(e["at"] for e in ev["events"] if e["type"] == "cut-end")
shift = lambda t: t if t < cs else t - (ce - cs)
end = ev["total"]
inputs, filters, mix = ["-i", "build/screen.webm", "-i", "build/badge.png"], [], []
font = "/home/marche/RockSign/assets/fonts/DMSans.woff2"
filters.append(f"[0:v]trim=0:{cs},setpts=PTS-STARTPTS[a];[0:v]trim={ce}:{end},setpts=PTS-STARTPTS[b];"
               f"[a][b]concat=n=2:v=1:a=0,fps=30,scale=1920:1080:flags=lanczos[base];"
               f"[1:v]null[badge];[base][badge]overlay=W-w-18:H-h-18[v]")
n = 2
for e in ev["events"]:
    if e["type"] == "scene":
        inputs += ["-i", f"narration/{e['id']}.wav"]
        filters.append(f"[{n}:a]aresample=48000,adelay={int(shift(e['at'])*1000)}:all=1[n{n}]")
    elif e["type"] == "clip":
        inputs += ["-i", "../app/public/sample/call.mp3"]
        filters.append(f"[{n}:a]atrim={e['from']}:{e['to']},asetpts=PTS-STARTPTS,aresample=48000,volume=1.1,adelay={int(shift(e['at'])*1000)}:all=1[n{n}]")
    else:
        continue
    mix.append(f"[n{n}]"); n += 1
filters.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0,alimiter=limit=0.95[aout]")
cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "[v]", "-map", "[aout]",
       "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest",
       "-movflags", "+faststart", "build/RockSign-Live-Demo.mp4"]
subprocess.run(cmd, check=True)
print("cut", round(cs, 1), "->", round(ce, 1), "| length ~", round(end - (ce - cs), 1), "s")
