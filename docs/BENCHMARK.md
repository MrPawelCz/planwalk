# Benchmark: reading plan images into planwalk JSON

**Runs A and B are a synthetic smoke test.** They check that the pipeline (prompt, JSON format, validator, scorer) works on clean generated plans whose truth is known. They are **not** evidence that planwalk reads real floor plans well. A first, small measurement on real plans from public listings is reported separately in [Real listing plans](#real-listing-plans); its result is mixed (most readings needed corrections), and the plans and readings behind it are not in this repository.

In runs A and B: one reading per plan, one reader, small numbers, no repeated runs. The reader was not blind to the harness, so this is a self-check, not an independent evaluation. Read "Leaks and limits" (synthetic runs) and "Limits of this measurement" (real plans) before quoting any number.

## Result in one line

Claude Sonnet 5.5, reading by hand in an agent session, read 12 clean synthetic plans in four drawing styles (including hand-style sketches with no printed scale) with a mean composite of 99.6 out of 100 (lowest 98.3, highest 100). Synthetic plans are easy, so this shows the pipeline works and gives a baseline for catching regressions; it does not show accuracy on real plans. One-shot calls with the prompt alone, from this model and from others, score lower on the same plans: see "Runs by model". On 20 real plans from public listings (a first, hand-picked set), one call with the prompt gave 3 of 30 readings by Claude Sonnet 5.5 that needed no change and 12 that needed at most three small corrections (30 readings of 20 plans: it read the 10 Polish plans twice, with the Polish and the English prompt); Claude Haiku 4.5 gave 0 of 20 on either count (see "Real listing plans").

## What was built

- `eval/gen/gen-plans.mjs`: deterministic generator, 7 families (studio, one-bedroom, two-bedroom with corridor, three-bedroom, L-shaped, flat with balcony, two-level duplex with a straight stair). Rooms are axis-aligned rectangles, 3 to 30 m2, every room reachable by doors, doors 0.8 to 0.9 m.
- `eval/draw.mjs`: four drawing styles, SVG and PNG (headless Chrome): `cad` (solid walls, door arcs, window triple lines, names with areas, one dimension line), `hatched` (hatched walls, furniture symbols), `sketch` (outlined walls shaken by a displacement filter, handwriting font, names only: no areas, no dimension line, so no printed scale), `scan` (cad rotated 1 to 3 degrees, blurred, grain; no JPEG artefacts).
- `eval/make-benchmark.mjs`: writes truth plans and drawings under opaque codes (`p69e9.cad.png`), plus `key.json` (code to seed, family, style, zoom). A file name tells nothing about the family. `--zoom LO,HI` draws every picture at its own pixel scale.
- `eval/score.mjs` and `eval/report.mjs`: the scorer (composite 0 to 100 = 30 room F1 + 20 mean IoU + 15 openings F1 + 15 connectivity F1 + 10 area accuracy + 10 valid; the prediction is aligned to the truth by uniform scale and translation of the wall bounding boxes, the scale error before alignment is reported) and a batch report.

## How the readings were made (protocol)

1. `node eval/make-benchmark.mjs ...` generated the images and the truth. Nothing was printed except code and style.
2. The reader looked at each PNG with an image viewer tool and wrote the JSON by hand following the rules in [`docs/PROMPT.md`](PROMPT.md) (scale from printed dimensions, else printed areas, else a standard 0.85 m door; walls as centerlines; skip furniture). For crowded two-level pictures it also looked at crops of the same PNG, which is what a person would do by zooming.
3. Each reading was checked once with `node tools/validate.mjs`. All 12 had 0 errors and 0 warnings on the first try, so no repair round was used. The render-and-compare step of the agent skill was not used, so this measures a reading by hand in an agent session, not the full agent route and not one pasted call (see "Runs by model" for one call).
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
- **Scale from doors in sketches (run B).** 1.3 to 3.6 percent error. This works here because the generator makes every door 0.8 to 0.9 m and a plan has five to eight doors, so the average is stable. Real plans have doors from 0.7 to 1.0 m and sometimes none that are drawn to standard; expect worse. On real plans (see "Real listing plans") a main room was more than about 20 percent off in width or depth against the printed numbers in 6 of the 17 judged primary readings by Claude Sonnet 5.5, according to the AI judge.
- **Unlabeled balcony (p7035, pc9c8).** The balcony is a box with thin walls and no printed name. The reader named it "Balcony" because a door leads to it; the prompt says to use printed names and not invent rooms, so this was a judgement call. In p7035 (run A) the call was made blind and matched the truth. In pc9c8 (run B) it was not blind: run A had been scored by then and had shown that the unlabeled box counts as a room. A stricter reading would lose one room of six in both.
- **Mean IoU 97 on p7035 and pc9c8, 98 on pd4cd:** small boundary offsets from reading coordinates off pixels. In pc9c8 the balcony came out 3.0 m wide against 3.2 m in the truth (the scale was a 3.5 percent guess); the other rooms were not analysed one by one.
- Nothing scored below 98 because the plans are easy (see below), not because the reading was careful in a way that would carry over.

## Runs by model

Runs A and B were read by one model inside an agent session. This section reads the same 12 pictures (seeds 401 to 408 and 501 to 504) with several models, one call per picture, and scores them with the same scorer. All rows are on synthetic plans and say nothing about real drawings (see "Real listing plans" for those).

**What a row measures.** One call per picture. The model gets the picture and the prompt (the text of [`PROMPT.md`](PROMPT.md) that a person pastes; the heading, the steps and the tips around it are not sent) and answers once. There are no tools except looking at the picture, no repository, no memory of the earlier pictures, no render-and-compare repair loop and no second round after validator messages. That is the plain "paste the prompt into a chat" route, not the agent route of `skill/planwalk`. The picture file is called `plan.png`, so its name does not tell the style. The answer is kept as it came (commentary and code block). The plan is taken out of it with the viewer's own extractor (`src/core/extract-json.js`, the first version of it), and two columns count what a person would meet: how often the whole answer was strict JSON as it stood ("Bare JSON") and how often the extracted plan loaded with no validator error ("Loads"). A picture whose answer gave no plan scores 0, as in `eval/report.mjs`.

Routes: Claude Sonnet 5.5 and Haiku 4.5 through the Claude Code command line in print mode with only its Read tool (to look at the picture) and no project files; `openai/gpt-6-astra` through a command line gateway to the OpenAI API with the picture attached and no tools. Gemini was not run: there are no credentials for it on the machine that ran the benchmark.

Prompt versions: v1 is the text of `PROMPT.md` in release 0.1.0. v2 is a rewrite of the text (metres for every length including furniture, one JSON object in one code block, notes about doubts in `meta.notes` and `meta.scale_note`, personal names and addresses left out, a stricter rule for furniture). The v1 rows showed a defect that v2 still had: the prompt listed `steps` of a stair under "Optional fields" although the schema requires it, which gave a validator error on the duplex plans for the models that skipped it (gpt-6-astra, Haiku 4.5). v3 fixed that and added rules against the other failures of the first rows (openings that do not fit their wall, a `name` over 120 characters). It removed the missing `steps` defect for gpt-6-astra (with v4, for Haiku 4.5 as well) and hurt Claude Sonnet 5.5 (see the rows): the rewrite of the field list no longer said that furniture and stairs are lists of the level, and "shorten the opening" was taken literally. v4 is the text that is published: it says where furniture and stairs go and what to do with an opening that runs past its wall.

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
| OpenAI gpt-6-astra | v4 | one call, picture attached | 7/12 | 98.4 on the 7 plans read | 91.7 | 100 | 0/7 | 7/7 | Incomplete: seven of the eight plans of run A were read (p74ee was not) and none of the four plans of run B (all sketches), because the planned budget of about 30 OpenAI calls was used up (31 calls were answered in all: 12 with v1, 12 with v3 and 7 with v4). The unread plans have no score and no file here. On these seven plans v4 averages 98.4, the same as v3 (98.4) and above v1 (80.3, which includes the p6b7c failure). Not comparable with the 12 plan rows. |
| Claude Haiku 4.5 | v4 | one call, Read tool | 12/12 | 50.3 | 10 | 82.2 | 0/12 | 9/12 | Prompt v4 against v1 on the same plans: +15.9 in the mean, and 9 of 12 plans load (4 with v1). Every answer was again one code block plus notes, taken out with no change to the JSON. One cause is named: every stair now has `steps` (v1 had four stairs without it), so the two duplexes load and score 52.2 and 33.6 instead of 0 and 0, about 7 of the 15.9 points. Openings that do not fit their wall or overlap (E006) are down from six plans to three (p66c3, p74ee, pc9c8). The rest is four plans up by 34.5 to 48.9 and six down by 2.9 to 25.7, from one run per prompt, so how much of it is the prompt and how much chance is not known (two runs of one prompt differed by 25 points on one plan for Claude Sonnet 5.5). Still wrong: 54 of 78 rooms matched (37 with v1); the scanned L-shaped plan p6ea2 matched 0 of 6 rooms (10, the lowest: the width is right, 11.7 m, but the depth is 6.77 m against 7.8 m and the partition walls are in the wrong places); the openings are mostly wrong (mean openings F1 6 percent on the eight plans of run A, 11 with v1); the six sketches average 46.9 (23.3 with v1) with scale 2.9 to 72.3 percent off (pc9c8 is 72.3 and scores 12.8). With this prompt and this route the small model is still not good enough to read drawings: use a stronger model. |
| Gemini | n/a | not run | 0/12 | n/a | n/a | n/a | n/a | n/a | There are no credentials for it on the machine that ran the benchmark. No statement about it is made here. |

"Plans read" is pictures with an answer out of 12. "Bare JSON" is answers that were strict JSON and nothing else; the prompt asks for a code block, so 0 is what it asks for, and the notes say whether the JSON inside needed any change. "Loads" is plans with no validator error. Run folders (`eval/results/<date>-<model>-<prompt>/`) hold the prompt as sent (`prompt.txt`), the answers as received (`raw/`), the extracted plans, `readings*.sha256` and `FROZEN*.txt` (written before `key.json` and `truth/` were opened), the scores and the validator counts.

**Loads in the viewer.** The "Loads" column above counts plans with no validator error under the strict rule: a property that the schema does not know (for example a `furniture` list inside a room) is an error. That is what a perfect answer achieves, and it is the rule that `eval/score.mjs` uses for the 10 "valid" points, so no composite score in this document has changed. The viewer is more forgiving, and what a person meets is whether a model appears on the screen. The table below counts that. "Loads in the viewer" is the plans for which the viewer shows a model. They split into four kinds:

- Clean: a model, no errors, no warnings.
- Warnings only: a model and warnings, no errors. This includes a property that the schema does not know: it is now warning W116 and is left out of the model.
- Errors listed: a model with the errors listed next to it. The geometry could still be built, for example with two windows that overlap (E006) or a root `name` of more than 120 characters (E002).
- Partial: some elements fail the schema (an opening of width 0, stairs without `steps`), so no whole plan can be built. The viewer builds the model from the rest and shows a banner that lists the skipped elements, which are counted in the last column. Before the validator change named below, such a plan was not shown at all.

| Model, prompt | Run folder | Plans read | Loads (strict) | Loads in the viewer | Clean | Warnings only | Errors listed | Partial | Skipped elements |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Claude Sonnet 5.5, v1 (agent session, runs A and B, 21.10) | `2026-10-21-claude-sonnet-5-5` | 12 | 12/12 | 12/12 | 12 | 0 | 0 | 0 | 0 |
| Claude Sonnet 5.5, v1, run 1 | `2026-10-23-claude-sonnet-5-5-v1-run1` | 12 | 11/12 | 12/12 | 9 | 2 | 1 | 0 | 0 |
| Claude Sonnet 5.5, v1, run 2 | `2026-10-23-claude-sonnet-5-5-v1-run2` | 12 | 12/12 | 12/12 | 10 | 2 | 0 | 0 | 0 |
| OpenAI gpt-6-astra, v1 | `2026-10-23-gpt-6-astra-v1` | 12 | 11/12 | 12/12 | 10 | 1 | 0 | 1 | 2 (stair 2) |
| Claude Haiku 4.5, v1 | `2026-10-23-claude-haiku-4-5-v1` | 12 | 4/12 | 12/12 | 0 | 4 | 6 | 2 | 4 (stair 4) |
| Claude Sonnet 5.5, v2 | `2026-10-23-claude-sonnet-5-5-v2` | 12 | 10/12 | 12/12 | 9 | 1 | 2 | 0 | 0 |
| OpenAI gpt-6-astra, v3 | `2026-10-23-gpt-6-astra-v3` | 12 | 12/12 | 12/12 | 11 | 1 | 0 | 0 | 0 |
| Claude Sonnet 5.5, v3 | `2026-10-23-claude-sonnet-5-5-v3` | 12 | 9/12 | 12/12 | 7 | 3 | 1 | 1 | 1 (opening 1) |
| Claude Sonnet 5.5, v4 | `2026-10-23-claude-sonnet-5-5-v4` | 12 | 11/12 | 12/12 | 9 | 2 | 1 | 0 | 0 |
| OpenAI gpt-6-astra, v4 (7 plans read) | `2026-10-23-gpt-6-astra-v4` | 7 | 7/7 | 7/7 | 6 | 1 | 0 | 0 | 0 |
| Claude Haiku 4.5, v4 | `2026-10-23-claude-haiku-4-5-v4` | 12 | 9/12 | 12/12 | 1 | 8 | 3 | 0 | 0 |

The rows where the two columns differ, and why:

- Claude Sonnet 5.5, v3 (9/12 strict, 12/12 in the viewer): p6530 had four unknown property errors (a `furniture` list inside four rooms); they are now four W116 warnings and the model shows with no error. p6b7c had an opening of width 0 (E002): the plan now shows as a partial model with that one opening (p9) skipped. pc9c8 (two overlapping windows, E006) shows with the error listed.
- Claude Haiku 4.5, v1 (4/12 against 12/12): six plans have E006 and show with the errors listed. Both duplexes (p6b7c, pd4cd) have stairs without `steps` and show as partial models without their stairs (4 stairs skipped).
- Claude Haiku 4.5, v4 (9/12 against 12/12): p66c3, p74ee and pc9c8 have E006 (a window that overlaps another window and a door, a window 0.15 m past the end of its wall, two doors that overlap by 0.05 m) and show with the errors listed. No stair lacks `steps` any more, so no plan is partial.
- OpenAI gpt-6-astra, v1 (11/12 against 12/12): p6b7c has stairs without `steps` and shows as a partial model without its 2 stairs.
- Claude Sonnet 5.5, v1 run 1 (p6b7c), v2 (p6b7c, pd4cd) and v4 (p74ee): the plans with an error that leaves the geometry buildable show with the error listed.
- The other rows (the agent session, v1 run 2, gpt-6-astra v3 and v4) are the same in both columns.

A model on the screen is not a right model. In every row the viewer shows a model for every plan that was read, so this column cannot tell a good answer from a bad one; the composite score and the strict column can. What it adds is what a person meets: for an answer with a problem they get a model and a list of what is wrong, not an empty screen.

**Scores are unchanged.** `eval/score.mjs` calls the validator with `{ strict: true }`, which keeps the rule under which every stored score was made. Each stored run folder was scored again with the current code: the 11 folders hold 21 score files (`scores.md` and `scores-sketch-zoom.md`; the gpt-6-astra v4 folder has the first only) and all 21 came out identical to the stored files, to the byte. Without the flag one stored plan score would have moved: Claude Sonnet 5.5, v3, p6530, from 85.5 to 95.5, because its four stray properties would be warnings and the 10 validity points would be given.

**Validator used for the counts above:** the validator of this release, `src/core/validate.js` with the `strict` option, warning W116 and partial plans. `node --test tests/eval/loads.test.mjs` checks every row against the validator in the repository, so a change of the validator that moves a count fails that test. To reproduce: `node eval/loads.mjs` prints these counts for every folder in `eval/results/` (add `--json` for the detail of each plan, or give one run folder to count that run only). `node --test tests/eval/loads.test.mjs` checks that the strict counts equal the "Loads" column, that this table equals the output of the script, and that the stored score files are reproduced by the current scorer.

Limits of these rows:

- 12 plans and one run per row (two for Sonnet 5.5 with prompt v1, to show how far two runs of the same model differ: 2.9 points in the mean and 25 points on one plan). Differences of a few points between rows are not evidence of a better model; only the v3 row of Sonnet 5.5 (7 to 10 points lower, with three named causes) and the v4 row of Haiku 4.5 (15.9 points above its v1 row, of which about 7 have one named cause, the missing `steps`) are outside that spread, and the spread of Haiku 4.5 itself is not known: it was run once per prompt.
- Haiku 4.5 was read with prompts v1 and v4 only (v2 and v3 were not run for it), and gpt-6-astra with v4 on 7 plans only (see the rows). Gemini was not run.
- Prompts v2 to v4 were rewritten after the scores of these same 12 plans were seen, so a later row is not a blind test of its prompt. A single plan can swing by about 25 points between two runs of the same prompt (p7035, Claude Sonnet 5.5, run 1 against run 2): of the 10.5 points that v3 gained over v1 for gpt-6-astra, 8.3 come from p6b7c (the missing `steps` defect, a real one) and 2.1 from p7035, which is inside that swing.
- `raw/` holds the answers exactly as the models wrote them, typographic characters included.
- The same easy synthetic plans as runs A and B (see below). A model that reads these well can still fail on real drawings.
- The calls ran in an empty folder that held only the picture, and `key.json` and `truth/` stayed closed until the readings were frozen. The generator, the drawer and the prompt are public in this repository, which a model with that in its training data could have seen.
- The pictures were drawn again from the seeds when these rows were made. The truth is the same as in runs A and B; PNG pixels can differ slightly between Chrome versions.

## Real listing plans

This section reports one measurement on real floor plans from public property listings. It is a first look with a small, hand-picked set, not a benchmark, and it says nothing about drawings that look different from these 20.

### What was measured

- **The set:** 20 floor plan images from public property listings, 10 in Poland and 10 in the UK, 187 printed rooms and spaces in total (186 are scored; one printed loft is left out of the room counts). The plans were picked by hand to cover different drawing styles, not drawn at random. 7 of the 10 Polish plans are developer unit cards; the UK plans all come from estate agents. 10 of the 20 show more than one floor. 9 of the 10 Polish plans print the area of every room; none of the 10 UK plans does (10 of 10 print room dimensions instead, in metres and feet).
- **The readers:** Claude Sonnet 5.5 and Claude Haiku 4.5, one call per plan with the published prompt (version 4: [`PROMPT.md`](PROMPT.md) for the UK plans, [`PROMPT.pl.md`](PROMPT.pl.md) for the Polish plans; Sonnet also read the Polish plans with the English prompt, so it has 30 readings of the 20 plans). Each reading was one call with the picture and the prompt only, like pasting into a chat. No corrections and no second try for a poor answer; the only repeat was one call of Claude Haiku 4.5 on a Polish plan that returned nothing within 6 minutes.
- **Not measured:** Gemini (no credentials on the machine that ran the test, so it was not run) and gpt-6-astra (the login of the provider had expired when the run started, so it was not run). Nothing is claimed about them on real plans.
- **The truth:** what is printed on each image (room labels, printed areas or dimensions, printed total area), transcribed by an AI reader that saw only the image, then a second time by another independent AI reader (three readers shared the plans). The AI session that ran the test also compared the transcription with the images on 5 of the 20 plans (4 without remarks, 1 with a correction of 0.7 percent of one room area). No human has checked it. Nothing was measured from the drawing geometry. The two transcriptions paired 178 room labels; of the 179 printed labels the first reader recorded, 1 was spelled differently by the second reader and was not paired, and the second reader also noted 16 abbreviations of cupboards, fireplaces and eaves in 3 UK plans, which this set does not count as rooms. They agree on 75 of 75 room areas that both recorded (only the Polish plans print room areas and the UK plans print dimensions, so for 103 of the 178 paired rooms no area was printed), on 92 of 92 room dimensions that both recorded, and on 17 of 17 printed total areas (3 plans print none; for 1 plan the two readers named the kind of the total (net, gross or not stated) differently). Of the 100 paired rooms with printed dimensions, 8 were recorded by one reader only: in 7 (Polish plans) the second reader also copied dimensions from dimension chains that the first reader had left out (the scores of the Polish plans use the printed areas, so this does not change them), and in 1 (a UK plan) one reader recorded a partial dimension of an outdoor area; the two readers also count the floors of a sheet differently on some plans. This agreement catches random slips, not a systematic misreading that both readers share.
- **Frozen first:** all readings were saved and fingerprinted (SHA-256) before any comparison with the truth, and the scoring is a script that gives the same numbers from the same inputs. The scoring was corrected once after a first run over the frozen readings (a printed loft is no longer counted as a room, and a read room that matches a printed room without a name by its area is no longer counted as an extra room); this moved the two label columns by about 3 percentage points and no other column.

### How the readings did, by script

"Loads" means the validator reports no errors (warnings are allowed; this is the validator's default mode, as in the viewer, so a property the schema does not know is a warning here, while the strict "Loads" column of "Runs by model" counts it as an error). "Labels found" is the mean over plans of the share of printed indoor room labels that a read room matches one to one by name (exact, a close spelling or a synonym); the figure in brackets pools all labels instead of averaging per plan; it does not check where the room is, and balconies, terraces and gardens are scored separately and are not in this column (see below the table). "Matching rooms" is the mean over plans of the share of read rooms that match a printed room. "Area error" is the median absolute difference, in percent of the printed area, between the area of the read room (the polygon net of the walls) and the printed area; where a plan prints only dimensions (the UK plans), the printed width times depth is used, which overstates rooms that are not rectangles. "Rooms within 10%" counts the rooms whose area is within 10 percent of the printed one. "Total vs printed" is the median of the read total area divided by the printed total, which is sometimes a gross figure that includes walls.

| Reading | Readings | Loads | Labels found (mean over plans; pooled in brackets) | Matching rooms | Median area error | Rooms within 10% | Total vs printed |
|---|---:|---:|---:|---:|---:|---:|---:|
| Claude Haiku 4.5, Polish listings, Polish prompt | 10 | 6 of 10 (60%) | 96.5% (95.9%) | 91.1% | 19.1% (63 rooms) | 37% | 0.74 |
| Claude Haiku 4.5, UK listings, English prompt | 10 | 3 of 10 (30%) | 94.1% (88.4%) | 86.8% | 11.2% (71 rooms) | 41% | 0.81 |
| Claude Sonnet 5.5, Polish listings, English prompt | 10 | 10 of 10 (100%) | 100.0% (100.0%) | 100.0% | 5.9% (66 rooms) | 67% | 1.02 |
| Claude Sonnet 5.5, Polish listings, Polish prompt | 10 | 9 of 10 (90%) | 100.0% (100.0%) | 100.0% | 4.8% (66 rooms) | 73% | 1.03 |
| Claude Sonnet 5.5, UK listings, English prompt | 10 | 8 of 10 (80%) | 87.0% (79.1%) | 97.1% | 5.9% (63 rooms) | 59% | 0.74 |
| **Claude Sonnet 5.5, all readings** | 30 | 27 of 30 (90%) | 95.7% (92.3%) | 99.0% | 5.4% (195 rooms) | 66% | 1.00 |
| **Claude Haiku 4.5, all readings** | 20 | 9 of 20 (45%) | 95.3% (91.9%) | 89.0% | 12.8% (134 rooms) | 39% | 0.78 |

Balconies, terraces and gardens, which the label columns leave out: Claude Sonnet 5.5 found 14 of 29 printed ones and Claude Haiku 4.5 15 of 18. A high "Labels found" therefore does not mean that the outdoor spaces were read.

### Would the reading be useful, as judged by an AI judge

A judge that is a separate Claude Sonnet 5.5 instance, in a clean context, saw the printed plan and a top-down picture of each reading that loads (rooms, doors, windows and stairs, with little or no furniture), with the readings of all models mixed under random letters, and gave one verdict per picture. **usable** means nothing needs changing: someone looking round the flat would not notice an error (the judge was told to pick small-fixes when in doubt). **small-fixes** means at most three separate corrections would make it usable. **wrong** means more than three corrections, a missing or merged main room, a missing floor or a wrong overall shape. A reading that does not load has no picture and counts here as "does not load", never as usable.

| Reading | Readings | usable | small-fixes | wrong | Does not load |
|---|---:|---:|---:|---:|---:|
| Claude Haiku 4.5, Polish listings, Polish prompt | 10 | 0 | 0 | 6 | 4 |
| Claude Haiku 4.5, UK listings, English prompt | 10 | 0 | 0 | 3 | 7 |
| Claude Sonnet 5.5, Polish listings, English prompt | 10 | 1 | 5 | 4 | 0 |
| Claude Sonnet 5.5, Polish listings, Polish prompt | 10 | 2 | 5 | 2 | 1 |
| Claude Sonnet 5.5, UK listings, English prompt | 10 | 0 | 2 | 6 | 2 |
| **Claude Sonnet 5.5, all readings** | 30 | 3 | 12 | 12 | 3 |
| **Claude Haiku 4.5, all readings** | 20 | 0 | 0 | 9 | 11 |

Claude Sonnet 5.5 read the 10 Polish plans twice, once per prompt, so it has 30 readings of the 20 plans. Of the 30 Claude Sonnet 5.5 readings, 3 (10%) were usable as they came, 12 (40%) needed at most three corrections, 12 (40%) were wrong and 3 (10%) did not load. The Polish listings, mostly developer unit cards, did better than the UK agent drawings (drawing type and country are mixed in this set): usable or small-fixes for 13 of 20 readings against 2 of 10 (the first count covers 10 plans, each read twice). Of the 20 Claude Haiku 4.5 readings, 0 were usable, 0 needed small fixes, 9 were wrong and 11 did not load.

How far to trust the judge: a second, independent pass by three other judge instances, on the same pictures with the same letters, gave the same verdict for 30 of 36 pictures (83%; Cohen's kappa 0.71), the same answer to "wrong or not" for 32 of 36, and never called one picture usable and the other wrong (6 disagreements were one step apart). The second pass counted 5 usable, 12 small-fixes and 10 wrong among the Claude Sonnet 5.5 pictures where the first pass counted 3, 12 and 12, so read "usable" as 3 to 5 of 30 readings. That measures repeatability, not correctness: both judges are AI, and a human may see more or fewer errors, especially in doors and windows, which are thin in the pictures.

### What went wrong most often

Counted from the judges' notes on the 17 judged primary readings (Claude Sonnet 5.5 on the Polish plans with the Polish prompt and on the UK plans with the English prompt; the readings that do not load have no picture) and from the validator results:

- stairs missing, incomplete or misplaced (6 of the 17 judged readings);
- a hallway, landing or corridor without a printed name drawn as an empty area instead of a room (4 of the 17);
- a main room more than about 20 percent off in width or depth against the printed numbers, according to the AI judge (6 of the 17);
- a wall too short for its own thickness, which the validator rejects as a block rather than a wall (error E004; 3 of the 30 Claude Sonnet 5.5 readings), and stairs too short for their number of steps (error E012; 5 of the 10 Claude Haiku 4.5 readings of the UK plans);
- sheets that show several buildings or several drawings on one image, where the reading keeps only part of them (seen in the judges' notes, not counted).

None of these was fixed in the prompt or the validator for this release. The prompt describes stairs in detail, so a missing staircase looks like a model omission rather than a missing instruction (this was not tested), and changing the published prompt would change what every other number in this file refers to; a change needs its own before and after measurement, which is left for a later release.

### Limits of this measurement

- 20 plans, two countries, picked by hand; 7 of the 10 Polish plans are developer cards, probably the easiest kind (this set does not separate the drawing type from the country). No hand sketches, one photo of a paper plan, no plans from other countries.
- One reading per plan, model and prompt, one prompt version (v4). Readings of the same plan vary from call to call; with one reading each, differences of a few percentage points between rows cannot be told apart from noise.
- The truth is what is printed, transcribed by AI readers and compared with the images by an AI session on 5 plans; no human checked it. A printed number that is itself wrong, or a misreading shared by every reader, would not be caught.
- The judge is an AI that sees a top-down picture only; it cannot walk the model. The labels metric ignores where a room is and leaves outdoor spaces out.
- Only Claude Sonnet 5.5 and Claude Haiku 4.5 were measured on real plans. Nothing here applies to other models, other chats or other versions of these models.
- Measured on 24 October 2026. The readings, scores and verdicts are kept outside this repository, because the images come from third-party listings; only the summary figures above are published.

## Leaks and limits

- **Not independent.** The reader is Claude Sonnet 5.5 and it had seen the generator, the drawer, the prompt and the scorer before the run. A self-check, not an independent evaluation.
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
node eval/loads.mjs                                                                         # strict and viewer load counts of every folder in eval/results/
```

PNG rendering needs Chrome or Chromium; SVG output does not, and `--no-png` skips the PNGs (enough to regenerate the truth and the keys). The generator, drawings and scores are deterministic for a given seed; PNG pixels can differ between Chrome versions and platforms (the sketch style names handwriting fonts that ship with macOS, so the pictures look different elsewhere). `eval/out/` is git-ignored.

To benchmark another model or your own prompt, give it only the images and the prompt, write one `<code>.plan.json` per image into a new folder, and run `eval/report.mjs`. Freeze the folder (for example with `shasum -a 256`) before you open `key.json` or `truth/`.

## What would make this a real benchmark

The "Real listing plans" section is a first step, not that: 20 plans picked by hand, a truth transcribed from printed numbers by AI readers, one reading per plan, one prompt version, and the readings kept outside this repository because the images belong to third parties. What would make it a benchmark: more real plans, contributed with consent so that they and their readings can be published and rerun, with a hand-checked truth; several readers (other models, other prompts) in separate processes that cannot see this repository; repeated runs for variance; a harder generator (diagonal and curved walls, dimension clutter, resized scale bars, photos); a published leaderboard of `eval/report.mjs` output. Plans that break the reading are exactly the contribution we want most (see [`CONTRIBUTING.md`](../CONTRIBUTING.md)); the "Report a bad reading" button in the viewer opens a prefilled issue for that.
