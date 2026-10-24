# Reading check of the three sample drawings (docs/samples)

Date: 2026-10-24. One call of Claude Sonnet 5.5 per picture, with the Read tool only, in an empty folder, with the published prompt v4
(`docs/PROMPT.md`, sha256 `0d6648ee56e1649d20bd63a1448cd8d8317ad8406e3a5e667c12ae214fe6b248`). Each answer was passed through
`src/core/extract-json.js`, checked with `node tools/validate.mjs` (0 errors, 0 warnings for all three) and scored with `eval/score.mjs`
against the generator's truth (the truth stays out of the repository; the seed rebuilds it).

| file | picture code | seed | style | family | sha256 of the shipped PNG | composite |
| --- | --- | --- | --- | --- | --- | ---: |
| sample-1.png | pd63f | 605 | cad | two-bedroom | `2dcd8fe2c952bfa7e7adb47a08e42329eadb376e9eae1c28de09f2a88d543ac2` | 98.2 |
| sample-2.png | pd965 | 607 | cad | l-shaped | `7367d7632601d419c258f66032c965f200866307450d4d8f1ca0a7dabc0c8b48` | 97.7 |
| sample-3.png | p7321 | 632 | hatched | one-bedroom | `9d78b6d1a75342f60a94c66a7fab749f4b862248e9daca8664da2a058f5195ef` | 99 |

`scores.md` is the output of `eval/report.mjs` for the three shipped pictures, `readings-samples/<code>.plan.json` are the extracted readings (the folder is not called `readings` because tests/eval/loads.test.mjs scores every `readings` folder against the benchmark of seeds 401 to 408).

## How the pictures were made and chosen

First round (sample-1, sample-2 and a first sample-3, seed 604):

```
node eval/make-benchmark.mjs --seed 601 --count 6 --out <dir> --styles cad,hatched     (seeds 601 to 606)
node eval/make-benchmark.mjs --seed 607 --count 6 --out <dir> --styles cad,hatched     (seeds 607 to 612)
```

The seeds are outside the ranges of the benchmark runs (401 to 412, 501 to 504). Eleven of the twelve pictures were looked at (seed 609,
a two-level house, was not). Five were set aside before any reading because a label sits on a furniture outline or a door swing crosses
furniture (seeds 602, 606, 608, 610, 612), and one (seed 611) because the swing of the bathroom door touches the label. Five were read:
sample-1 (seed 605), sample-2 (seed 607) and three that are not shipped, seed 604 (hatched, one-bedroom, 96.3), seed 603 (cad, studio) with
94.0 and seed 601 (cad, balcony) with 91.2. In all three of these the swing of the bathroom door touches the label. Sample-1 and sample-2
are the two that read best of those five.

Second round (a cleaner sample-3, hatched walls, seeds from 613 on). Seed 604 was taken out because the swing of its bathroom door touches
the label "Bathroom":

```
node eval/make-benchmark.mjs --seed 613 --count 8 --out <dir> --styles hatched          (seeds 613 to 620)
node eval/make-benchmark.mjs --seed <s> --count 1 --out <dir> --styles hatched          (once for each s = 622, 624, 625, 631, 632, 638, 639, 646, 653, 660)
```

The family repeats every seventh seed in this range (613 three-bedroom, 614 l-shaped, 615 balcony, 616 two-level house, 617 studio,
618 one-bedroom, 619 two-bedroom, 620 three-bedroom, and 624 studio, 625, 632 and 639 one-bedroom, 631 studio), so the seeds of
families other than those of sample-1 and sample-2 could be aimed at. Eighteen pictures were made and eleven looked at; seven were not
(614 and 619 repeat the families of sample-2 and sample-1; 622, 638, 646, 653 and 660 were made in the same batch and not looked at
once seed 632 was found to be good). Of the eleven, ten were set
aside before any reading, each because a label sits on or touches a furniture outline (the coffee table in the middle of the living room
or studio in 613, 615, 617, 618, 620 and 639, the stairs and the table in the two-level house 616) or because the swing of the bathroom
door touches the label "Bathroom" or crosses the bath (613, 620, 624, 625, 631). Seed 632 was chosen by looking, before any reading,
and read once: composite 99, 5 of 5 rooms, 0 validator errors and warnings. It is the only one of the second round that was read, so
the reading was not chosen by its score. In sample-3.png no label touches a line; the swing of the bedroom door crosses the left edge of
the bed outline, and the label "Bedroom" sits inside the outline of the bed.

The three composites are not a measure of quality: sample-1 and sample-2 are the best of five readings and sample-3 is one reading of
a picture picked by eye. They show that the loop works on these pictures, not how a model reads a typical drawing; the measured numbers
are in `docs/BENCHMARK.md`. The earlier sample-3 (seed 604) is no longer shipped and its reading is not kept.

## How a reading was made

The picture was copied as `plan.png` into an empty folder, and from that folder (with `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`):

```
claude -p --model claude-sonnet-5-5 --system-prompt 'You are a careful assistant that reads images and answers exactly as the user asks.' \
  --tools Read --allowedTools Read --no-session-persistence --output-format json --setting-sources '' --strict-mcp-config \
  "First look at the picture in the file ./plan.png (use the Read tool). It is a floor plan picture. Then follow these instructions exactly.

$(cat docs/PROMPT.md)"
```

The `result` field of the JSON is the answer. Cost: about 0.04 to 0.06 USD and 23 to 34 seconds per reading. Six readings were made in
all: five in the first round and one (sample-3, 33 seconds, 0.056 USD) in the second.
