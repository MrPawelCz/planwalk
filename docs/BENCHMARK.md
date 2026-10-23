# Benchmark: reading plan images into planwalk JSON

**Runs A and B are a synthetic smoke test.** They check that the pipeline (prompt, JSON format, validator, scorer) works on clean generated plans whose truth is known. They are **not** evidence that planwalk reads real floor plans well. No real drawing has been measured in this repository.

In runs A and B: one reading per plan, one reader, small numbers, no repeated runs. The reader was not blind to the harness, so this is a self-check, not an independent evaluation. Read "Leaks and limits" before quoting any number.

## Result in one line

Claude Sonnet 5.5 read 12 clean synthetic plans in four drawing styles (including hand-style sketches with no printed scale) with a mean composite of 99.6 out of 100 (lowest 98.3, highest 100). Synthetic plans are easy, so this shows the pipeline works and gives a baseline for catching regressions; it does not show accuracy on real plans.

## What was built

- `eval/gen/gen-plans.mjs`: deterministic generator, 7 families (studio, one-bedroom, two-bedroom with corridor, three-bedroom, L-shaped, flat with balcony, two-level duplex with a straight stair). Rooms are axis-aligned rectangles, 3 to 30 m2, every room reachable by doors, doors 0.8 to 0.9 m.
- `eval/draw.mjs`: four drawing styles, SVG and PNG (headless Chrome): `cad` (solid walls, door arcs, window triple lines, names with areas, one dimension line), `hatched` (hatched walls, furniture symbols), `sketch` (outlined walls shaken by a displacement filter, handwriting font, names only: no areas, no dimension line, so no printed scale), `scan` (cad rotated 1 to 3 degrees, blurred, grain; no JPEG artefacts).
- `eval/make-benchmark.mjs`: writes truth plans and drawings under opaque codes (`p69e9.cad.png`), plus `key.json` (code to seed, family, style, zoom). A file name tells nothing about the family. `--zoom LO,HI` draws every picture at its own pixel scale.
- `eval/score.mjs` and `eval/report.mjs`: the scorer (composite 0 to 100 = 30 room F1 + 20 mean IoU + 15 openings F1 + 15 connectivity F1 + 10 area accuracy + 10 valid; the prediction is aligned to the truth by uniform scale and translation of the wall bounding boxes, the scale error before alignment is reported) and a batch report.

## How the readings were made (protocol)

1. `node eval/make-benchmark.mjs ...` generated the images and the truth. Nothing was printed except code and style.
2. The reader looked at each PNG with an image viewer tool and wrote the JSON by hand following the rules in [`docs/PROMPT.md`](PROMPT.md) (scale from printed dimensions, else printed areas, else a standard 0.85 m door; walls as centerlines; skip furniture). For crowded two-level pictures it also looked at crops of the same PNG, which is what a person would do by zooming.
3. Each reading was checked once with `node tools/validate.mjs`. All 12 had 0 errors and 0 warnings on the first try, so no repair round was used. The render-and-compare step of the agent skill was not used, so this measures the plain prompt route, not the full agent route.
4. Before any truth was opened, the readings were frozen: `readings.sha256` and `FROZEN.txt` (timestamp) in the run folder. `key.json` and `truth/` were first read after that, by the scoring command.
5. The scoring output is stored unchanged: `scores.md`, `scores-sketch-zoom.md`.

All inputs and outputs of the run are in [`eval/results/2026-10-21-claude-sonnet-5-5/`](../eval/results/2026-10-21-claude-sonnet-5-5/): the readings (`readings/`, `readings-sketch-zoom/`), the hashes, the freeze timestamps and the scores. Images and truth are regenerated from the seeds (see "Reproduce").

## Results

### Run A: seeds 401 to 408, 8 plans, 4 styles (2 per style), fixed 80 px per metre

| code | style | family | composite | rooms matched | room F1 | mean IoU | area error % | openings F1 | connectivity F1 | valid | scale error % |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| p69e9 | cad | one-bedroom | 100 | 5/5 | 100 | 100 | 0 | 100 | 100 | yes | 0 |
| p6530 | hatched | two-bedroom | 100 | 7/7 | 100 | 100 | 0 | 100 | 100 | yes | 0 |
| p66c3 | sketch | three-bedroom | 100 | 8/8 | 100 | 100 | 0 | 100 | 100 | yes | 0 |
| p6ea2 | scan | l-shaped | 100 | 6/6 | 100 | 100 | 0 | 100 | 100 | yes | 0 |
| p7035 | cad | balcony | 99.5 | 6/6 | 100 | 97 | 0 | 100 | 100 | yes | 0 |
| p6b7c | hatched | duplex | 100 | 9/9 | 100 | 100 | 0 | 100 | 100 | yes | 0 |
| p6d0f | sketch | studio | 98.3 | 3/3 | 100 | 100 | 0 | 89 | 100 | yes | 0 |
| p74ee | scan | one-bedroom | 100 | 5/5 | 100 | 100 | 0 | 100 | 100 | yes | 0 |

Mean composite 99.7 (min 98.3, max 100). Per style, n=2 each: cad 99.8, hatched 100, sketch 99.2, scan 100. With two plans per style and a different family in each, differences between styles cannot be told apart from differences between plans.

**Run A did not test the "no scale" case.** The two sketches have no printed scale, but every picture in run A is drawn at the same 80 pixels per metre, and the reader had already learned that from the printed dimension lines of the pictures read earlier (two before the first sketch, five before the second). The scale error of 0 on the sketches is that leak, not skill. Run B was added to remove it.

### Run B: seeds 501 to 504, 4 sketches, every picture at its own zoom (0.76 to 1.39)

| code | style | family | composite | rooms matched | room F1 | mean IoU | area error % | openings F1 | connectivity F1 | valid | scale error % |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| pccee | sketch | three-bedroom | 99.5 | 8/8 | 100 | 99 | 1 | 100 | 100 | yes | 3.6 |
| pcb5b | sketch | l-shaped | 99.7 | 6/6 | 100 | 100 | 0.8 | 100 | 100 | yes | 1.3 |
| pc9c8 | sketch | balcony | 98.8 | 6/6 | 100 | 97 | 1.8 | 100 | 100 | yes | 3.5 |
| pd4cd | sketch | duplex | 99.5 | 9/9 | 100 | 98 | 0.5 | 100 | 100 | yes | 2.2 |

Mean composite 99.4 (min 98.8, max 99.7). Here the scale really was a guess from door widths (no printed dimensions, no areas, a different pixel scale per picture): it was off by 1.3 to 3.6 percent.

Both runs together: 12 plans, mean 99.6, lowest 98.3, highest 100.

## Weak cases, honestly

- **p6d0f (sketch, studio), openings F1 89.** One of nine openings was missed by the matching tolerance: the left window was read 1.7 m wide, the truth is 1.2 m (centre 0.2 m off, width 0.5 m off). In a wobbly sketch the window ends are ambiguous. Window extents are the least reliable part of a sketch reading; the rooms were right.
- **Scale from doors in sketches (run B).** 1.3 to 3.6 percent error. This works here because the generator makes every door 0.8 to 0.9 m and a plan has five to eight doors, so the average is stable. Real plans have doors from 0.7 to 1.0 m and sometimes none that are drawn to standard; expect worse.
- **Unlabeled balcony (p7035, pc9c8).** The balcony is a box with thin walls and no printed name. The reader named it "Balcony" because a door leads to it; the prompt says to use printed names and not invent rooms, so this was a judgement call. In p7035 (run A) the call was made blind and matched the truth. In pc9c8 (run B) it was not blind: run A had been scored by then and had shown that the unlabeled box counts as a room. A stricter reading would lose one room of six in both.
- **Mean IoU 97 on p7035 and pc9c8, 98 on pd4cd:** small boundary offsets from reading coordinates off pixels. In pc9c8 the balcony came out 3.0 m wide against 3.2 m in the truth (the scale was a 3.5 percent guess); the other rooms were not analysed one by one.
- Nothing scored below 98 because the plans are easy (see below), not because the reading was careful in a way that would carry over.

## Leaks and limits

- **Not independent.** The reader is Claude Sonnet 5.5 and it had worked with the generator, the drawer, the prompt and the scorer before the run. A self-check, not an independent evaluation.
- **Not blind to the harness.** The reader knew the seven families, the drawing conventions and how the scorer works (it had read the generator's furniture code and the drawer). It did not see the truth, `key.json` or any drawing of the benchmark seeds before reading them. The seed to family arithmetic is guessable from the tests; it was not computed for the benchmark seeds, and the layouts are plainly visible in the pictures anyway.
- **Fixed scale in run A** (above). Run B fixes this for sketches only; the other three styles print their scale.
- **Run B was read after run A had been scored.** The reader had seen run A's scores and truth before it opened any run B picture, so lessons carry over (the balcony above is the one known case). Run B's own seeds, truth and key were not opened before its readings were frozen (`FROZEN-sketch-zoom.txt`).
- **One reader, one pass, small n.** 12 readings, no repeats, no variance estimate, no other models. Per-style numbers are anecdotes.
- **Easy plans.** Rectangles only, perfectly clear drawings, exact printed areas, doors always 0.8 to 0.9 m. A near-ceiling score cannot separate good readers from very good ones; it can only catch breakage and weak models. Real drawings have title blocks, grids, dimension clutter, curved and diagonal walls, scale bars that were resized, photos and perspective.
- **Lenient scorer.** Rooms match at IoU 0.5, openings within 0.4 m of the centre and 0.3 m of the width, after the best uniform scale. That is deliberate (the viewer needs usable geometry, not survey grade), but it flatters small errors.
- **Scan style is mild** (rotation, blur, grain; no JPEG artefacts, no skew, no shadows).
- **Self-scored.** The party that read the plans also ran the scorer. The freeze hashes show the readings were not edited afterwards; they cannot show what the reader remembered.

## Reproduce

```bash
node eval/make-benchmark.mjs --seed 401 --count 8 --out eval/out/bench-401              # run A images, truth, key
node eval/make-benchmark.mjs --seed 501 --count 4 --styles sketch --zoom 0.7,1.4 --out eval/out/bench-501   # run B
# give the images in eval/out/<bench>/images/ (and nothing else from that folder) to the reader, with docs/PROMPT.md
node eval/report.mjs eval/out/bench-401 eval/results/2026-10-21-claude-sonnet-5-5/readings
node eval/report.mjs eval/out/bench-501 eval/results/2026-10-21-claude-sonnet-5-5/readings-sketch-zoom
node eval/score.mjs <truth.json> <reading.json>                                             # one plan, readable output
```

PNG rendering needs Chrome or Chromium; SVG output does not, and `--no-png` skips the PNGs (enough to regenerate the truth and the keys). The generator, drawings and scores are deterministic for a given seed; PNG pixels can differ between Chrome versions and platforms (the sketch style names handwriting fonts that ship with macOS, so the pictures look different elsewhere). `eval/out/` is git-ignored.

To benchmark another model or your own prompt, give it only the images and the prompt, write one `<code>.plan.json` per image into a new folder, and run `eval/report.mjs`. Freeze the folder (for example with `shasum -a 256`) before you open `key.json` or `truth/`.

## What would make this a real benchmark

Real plans, contributed with consent and with a hand-checked truth; several readers (other models, other prompts) in separate processes that cannot see this repository; repeated runs for variance; a harder generator (diagonal and curved walls, dimension clutter, resized scale bars, photos); a published leaderboard of `eval/report.mjs` output. Plans that break the reading are exactly the contribution we want most (see [`CONTRIBUTING.md`](../CONTRIBUTING.md)).
