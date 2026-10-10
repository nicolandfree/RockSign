# RockSign

**What's said gets signed. And paid.** RockSign turns the call where a freelancer and a client agree on a job into an agreement both sign. Every clause links to the moment it was said. The signatures are sealed on Solana, and the agreed upfront payment is a one-tap USDC transfer.

- **Live app:** https://rocksign.vercel.app (Solana devnet)
- **Product code:** [`app/`](app/). This is a working web app on Solana devnet. See [app/README.md](app/README.md) for how it works and how to run it.
- **Pitch and the first concept video:** the rest of this repo (below).

---

## Pitch deck + concept demo

Everything is in English. The finished files are in `dist/`:

| File | What it is | How to share |
|---|---|---|
| `dist/RockSign-Pitch.pdf` | 12-slide deck, 16:9 | Email it or upload it anywhere |
| `dist/RockSign-Pitch.html` | The same deck as one offline file (fonts and logos embedded) | Open in any browser. ← → or click to navigate, `N` = speaker notes, `F` = fullscreen |
| `dist/RockSign-Demo.mp4` | 2:12 product demo video, 1080p, with voices | YouTube/Loom/Drive, or play it from the deck |
| `dist/RockSign-Demo.html` | The same demo, playable in a browser (audio embedded) | Open it, press Play. Space = pause, ← → = seek |

Online, editable version of the deck (exports to PDF/PPTX from its menu):
https://claude.ai/artifact/RKDxnGDTiG1BNzmXSL8PtC

## Fill in before presenting

- Slide 7 (Market): TAM / SAM / SOM numbers and their source.
- Slide 8 (Business model): free-tier limit, Pro and Studio prices.
- Slide 10 (Roadmap): quarter for each phase.
- Slide 11 (Team): empty on purpose.
- Slide 12 (Ask): amount, goal, contact.
- Slide 9: check each competitor's current features.
- Slides 4 and 6: have a lawyer check the recording-consent and e-signature claims.

## What the demo shows

This video was made before the product existed (see `app/` for the working product). It is a scripted simulation, labelled
"Concept prototype" on the first and last screens. Keep that label when you show
it to investors.

1. **Intro** (0:00): logo and narrator.
2. **Call** (0:10): freelance designer Lucy Parker and client Mark Ellis (Northside
   Studio) agree on a job. RockSign announces that it's recording. Its side panel
   picks up seven terms as they're said, each with its minute in the call.
3. **Hang up** (1:21): RockSign drafts the agreement.
4. **Inbox** (1:34): Mark receives the email. No account needed.
5. **Agreement** (1:41): every clause has a ▶ timestamp. A click on "Payment"
   replays Lucy's own words from the call.
6. **Sign** (1:56): Mark draws his signature. Both signatures complete and the
   signed PDF is ready.
7. **Outro** (2:06): "What's said gets signed."

All names, amounts and dates are fictional. The voices are synthetic (Piper TTS).

### Call script

| Who | Line | Detected term |
|---|---|---|
| Lucy | Hi Mark! Thanks for jumping on. Quick heads-up: I use RockSign, so this call is recorded, and you'll get the agreement to sign when we hang up. Is that okay? | |
| Mark | Sure, that works for me. | |
| Lucy | Great. So, what do you need? | |
| Mark | We're launching a new product next month. We need our landing page redesigned, plus three social media pieces for the launch. | Deliverables |
| Lucy | Got it. The landing page plus three social pieces. When do you need them? | |
| Mark | Ideally by Friday, October 23rd. | Deadline |
| Lucy | That works. For that scope, my fee is $1,200. | Fee |
| Mark | $1,200 is fine. How do you want to get paid? | |
| Lucy | 50% upfront, and the other 50% when I deliver the final files. | Payment terms |
| Mark | Deal. What about changes? Our CEO always has opinions. | |
| Lucy | I include two rounds of revisions. Anything beyond that is $60 an hour. | Revisions |
| Mark | Fair enough. Oh, and we'll need the source files too. The Figma file and all the exports. | |
| Lucy | Of course. You'll get the Figma file and every exported asset. | Handoff |
| Mark | Perfect. Let's do it. | |
| Lucy | Awesome. I'll start on Monday, October 5th. Talk soon! | Start date |

## Changing and rebuilding

All text lives in these source files:

- Deck slides: `pitch/project/slides/*.html` (the same files as the online deck)
- Call and narration: `demo/script.json`
- Demo screens: `demo/demo.html`

```bash
npm install                       # once: Playwright
node pitch/build.mjs              # → dist/RockSign-Pitch.html + .pdf

python3 demo/build_audio.py       # voices + timeline (delete demo/build/lines/ after editing script.json)
node demo/build.mjs               # → dist/RockSign-Demo.html
node demo/build.mjs --stills 15,90  # check frames at those seconds → dist/stills/
node demo/build.mjs --render      # → dist/RockSign-Demo.mp4 (about 5–10 min)
```

The demo's picture is computed from the soundtrack's clock, so after you edit the
script, the timings, captions and clause timestamps all update on their own. If
the timestamps change, also update the ▶ times on slide 5
(`pitch/project/slides/borrador.html`).

**Using real voices instead of TTS:** record the call with two people reading the
script, cut one WAV file per line (22.05 kHz, mono, 16-bit), and replace the files
in `demo/build/lines/` with the same names. Then run `build_audio.py` again.
