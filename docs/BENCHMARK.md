# Benchmark: reading plan images into planwalk JSON

**Runs A and B are a synthetic smoke test.** They check that the pipeline (prompt, JSON format, validator, scorer) works on clean generated plans whose truth is known. They are **not** evidence that planwalk reads real floor plans well. No real drawing has been measured in this repository.

In runs A and B: one reading per plan, one reader, small numbers, no repeated runs. The reader was not blind to the harness, so this is a self-check, not an independent evaluation. Read "Leaks and limits" before quoting any number.

## Result in one line

Claude Sonnet 5.5, reading by hand in an agent session, read 12 clean synthetic plans in four drawing styles (including hand-style sketches with no printed scale) with a mean composite of 99.6 out of 100 (lowest 98.3, highest 100). Synthetic plans are easy, so this shows the pipeline works and gives a baseline for catching regressions; it does not show accuracy on real plans. One-shot calls with the prompt alone, from this model and from others, score lower on the same plans: see "Runs by model".

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

## Runs by model

Runs A and B were read by one model inside an agent session. This section reads the same 12 pictures (seeds 401 to 408 and 501 to 504) with several models, one call per picture, and scores them with the same scorer. All rows are on synthetic plans and say nothing about real drawings.

**What a row measures.** One call per picture. The model gets the picture and the prompt (the text of [`PROMPT.md`](PROMPT.md) that a person pastes; the heading, the steps and the tips around it are not sent) and answers once. There are no tools except looking at the picture, no repository, no memory of the earlier pictures, no render-and-compare repair loop and no second round after validator messages. That is the plain "paste the prompt into a chat" route, not the agent route of `skill/planwalk`. The picture file is called `plan.png`, so its name does not tell the style. The answer is kept as it came (commentary and code block). The plan is taken out of it with the viewer's own extractor (`src/core/extract-json.js`, the first version of it), and two columns count what a person would meet: how often the whole answer was strict JSON as it stood ("Bare JSON") and how often the extracted plan loaded with no validator error ("Loads"). A picture whose answer gave no plan scores 0, as in `eval/report.mjs`.

Routes: Claude Sonnet 5.5 and Haiku 4.5 through the Claude Code command line in print mode with only its Read tool (to look at the picture) and no project files; `openai/gpt-6-astra` through a command line gateway to the OpenAI API with the picture attached and no tools. Gemini was not run: there are no credentials for it on the machine that ran the benchmark.

Prompt versions: v1 is the text of `PROMPT.md` in release 0.1.0. v2 is a rewrite of the text (metres for every length including furniture, one JSON object in one code block, notes about doubts in `meta.notes` and `meta.scale_note`, personal names and addresses left out, a stricter rule for furniture). The v1 rows showed a defect that v2 still had: the prompt listed `steps` of a stair under "Optional fields" although the schema requires it, which gave a validator error on the duplex plans for the models that skipped it (gpt-6-astra, Haiku 4.5). v3 fixed that and added rules against the other failures of the first rows (openings that do not fit their wall, a `name` over 120 characters). It helped gpt-6-astra and hurt Claude Sonnet 5.5 (see the rows): the rewrite of the field list no longer said that furniture and stairs are lists of the level, and "shorten the opening" was taken literally. v4 is the text that is published: it says where furniture and stairs go and what to do with an opening that runs past its wall.

| Model | Prompt | Route | Plans read | Mean composite | Lowest | Highest | Bare JSON | Loads | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Claude Sonnet 5.5 (runs A and B, 21.10) | v1 | agent session: image viewer, crops, JSON written by hand | 12/12 | 99.6 | 98.3 | 100 | n/a | 12/12 | Different route from the rows below: not comparable. Not blind to the harness (see "Leaks and limits"). |
| Claude Sonnet 5.5, run 1 | v1 | one call, Read tool | 12/12 | 92.4 | 66.3 | 99.8 | 0/12 | 11/12 | Every answer was one code block plus notes, taken out with no change to the JSON. Both balcony plans (p7035, pc9c8) lost a room: the unlabeled balcony box was not made a room, which follows the prompt (use printed names, do not invent rooms); p7035 is the lowest (66.3, openings F1 0, scale 6.8 percent off). p6b7c has four overlapping window pairs (validator error E006) and needs a repair round. The six sketches, with no printed scale, were 0.2 to 7.7 percent off in scale. |
| Claude Sonnet 5.5, run 2 | v1 | one call, Read tool | 12/12 | 95.3 | 91.3 | 99.9 | 0/12 | 12/12 | Same prompt and route as run 1, a different result: the mean differs by 2.9 points and one plan by 25. p7035 went from 66.3 to 91.3: the balcony box was again not made a room (5 of 6), but the scale was right this time (0.1 percent off against 6.8) and the openings matched. p6b7c went from 84.1 to 94.3: no overlapping windows this time. The six sketches average 94.5. |
| OpenAI gpt-6-astra | v1 | one call, picture attached | 12/12 | 87.8 | 0 | 100 | 0/12 | 11/12 | Every answer was one code block, taken out with no change to the JSON. p6b7c scored 0: its stairs have no `steps`, which the schema requires (validator error E002), so the plan is invalid; the prompt lists the stair fields under "Optional fields". The other 11 plans average 95.7. Same balcony result as Sonnet 5.5 (p7035 66.1, pc9c8 92.0, one room of six lost in both). The six sketches average 98.4 with scale 4.2 to 6.6 percent off. |
| Claude Haiku 4.5 | v1 | one call, Read tool | 12/12 | 34.4 | 0 | 73 | 0/12 | 4/12 | Every answer was one code block, taken out with no change to the JSON. Eight of 12 plans have validator errors: six have openings that do not fit their wall or overlap (E006), both duplexes have stairs without `steps` (E002) and score 0. Rooms are often missed (the scanned L-shaped plan matched 1 of 6 rooms, 16.8) and the openings are mostly wrong (mean openings F1 11 percent on the eight plans of run A). The six sketches average 23.3, with scale 3.3 to 20.5 percent off where it could be measured. With this prompt and this route the small model is not good enough to read drawings: use a stronger model. |
| Claude Sonnet 5.5 | v2 | one call, Read tool | 12/12 | 93.9 | 84.3 | 100 | 0/12 | 10/12 | Prompt v2 (metres for furniture too, one JSON block, notes fields, names and addresses left out, a clearer furniture rule) against the two v1 runs: +1.5 and -1.4 in the mean, which is inside the spread between those two runs, so no measurable change on these plans. Two plans have a validator error: p6b7c (a door 0.01 m longer than its wall, E006) and pd4cd (a root `name` of 130 characters, the limit is 120, E002); each is a small fix. |
| OpenAI gpt-6-astra | v3 | one call, picture attached | 12/12 | 98.3 | 91.7 | 100 | 0/12 | 12/12 | Prompt v3 added three rules (stairs need `steps`, openings fit their wall, `name` at most 120 characters). All 12 plans load. p6b7c, which scored 0 with v1 because of the missing `steps`, scores 100 (the schema was the only problem), and p7035 went from 66.1 to 91.7 (5 of 6 rooms matched, scale 0.0 percent off). The other plans are within 1 point of the v1 run. The six sketches average 98.5. |
| Claude Sonnet 5.5 | v3 | one call, Read tool | 12/12 | 85.0 | 0 | 100 | 0/12 | 9/12 | The same v3 text made this model worse: 85.0 against 92.4 to 95.3 for v1 and 93.9 for v2. Three plans have validator errors. In p6530 the model wrote a `furniture` list inside four rooms (the schema has furniture only on the level; v3 had dropped the plain mention of the level lists, so four rooms got an E002 error for the unknown property and the plan did not load clean; it scored 85.5). In p6b7c it wrote an opening of width 0 (E002, the plan is invalid and scores 0): the rule "shorten the opening rather than let it run past the wall" was followed to the letter. In pc9c8 two windows overlap (E006, 75.1). This run caught a regression that reading the prompt had not shown. |
| Claude Sonnet 5.5 | v4 | one call, Read tool | 12/12 | 94.2 | 87.0 | 98.3 | 0/12 | 11/12 | Prompt v4 says that furniture and stairs are lists of the level and never entries inside a room, and that an opening that runs past its wall belongs on the wall that really carries it and is never shrunk to nothing. Back in the range of v1 and v2 (92.4 to 95.3 and 93.9): no measurable gain for this model, and the one error left is two overlapping windows in p74ee (E006, 87.0). |
| OpenAI gpt-6-astra | v4 | one call, picture attached | 7/12 | 98.4 on the 7 plans read | 91.7 | 100 | 0/7 | 7/7 | Incomplete: seven of the eight plans of run A were read (p74ee was not) and none of the four sketch plans, because the planned budget of 30 OpenAI calls was used up. On these seven plans v4 averages 98.4, the same as v3 (98.4) and above v1 (80.3, which includes the p6b7c failure). Not comparable with the 12 plan rows. |

"Plans read" is pictures with an answer out of 12. "Bare JSON" is answers that were strict JSON and nothing else; the prompt asks for a code block, so 0 is what it asks for, and the notes say whether the JSON inside needed any change. "Loads" is plans with no validator error. Run folders (`eval/results/<date>-<model>-<prompt>/`) hold the prompt as sent (`prompt.txt`), the answers as received (`raw/`), the extracted plans, `readings*.sha256` and `FROZEN*.txt` (written before `key.json` and `truth/` were opened), the scores and the validator counts.

Limits of these rows:

- 12 plans and one run per row (two for Sonnet 5.5 with prompt v1, to show how far two runs of the same model differ: 2.9 points in the mean and 25 points on one plan). Differences of a few points between rows are not evidence of a better model; only the v3 row of Sonnet 5.5 (7 to 10 points lower, with three named causes) is outside that spread.
- Haiku 4.5 was read with prompt v1 only, and gpt-6-astra with v4 on 7 plans only (see the rows). Gemini was not run.
- The same easy synthetic plans as runs A and B (see below). A model that reads these well can still fail on real drawings.
- The calls ran in an empty folder that held only the picture, and `key.json` and `truth/` stayed closed until the readings were frozen. The generator, the drawer and the prompt are public in this repository, which a model with that in its training data could have seen.
- The pictures were drawn again from the seeds when these rows were made. The truth is the same as in runs A and B; PNG pixels can differ slightly between Chrome versions.

## Leaks and limits

- **Not independent.** The reader is Claude Sonnet 5.5 and it had worked with the generator, the drawer, the prompt and the scorer before the run. A self-check, not an independent evaluation.
- **Not blind to the harness.** The reader knew the seven families, the drawing conventions and how the scorer works (it had read the generator's furniture code and the drawer). It did not see the truth, `key.json` or any drawing of the benchmark seeds before reading them. The seed to family arithmetic is guessable from the tests; it was not computed for the benchmark seeds, and the layouts are plainly visible in the pictures anyway.
- **Fixed scale in run A** (above). Run B fixes this for sketches only; the other three styles print their scale.
- **Run B was read after run A had been scored.** The reader had seen run A's scores and truth before it opened any run B picture, so lessons carry over (the balcony above is the one known case). Run B's own seeds, truth and key were not opened before its readings were frozen (`FROZEN-sketch-zoom.txt`).
- **One reader, one pass, small n (runs A and B).** 12 readings, no repeats, no variance estimate, no other models. Per-style numbers are anecdotes. "Runs by model" above adds other models and a repeat run, with the limits listed there.
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
