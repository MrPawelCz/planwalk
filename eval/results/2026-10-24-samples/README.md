# Reading check of the three sample drawings (docs/samples)

Date: 2026-10-24. One call of Claude Sonnet 5.5 per picture, with the Read tool only, in an empty folder, with the published prompt v4
(`docs/PROMPT.md`, sha256 `0d6648ee56e1649d20bd63a1448cd8d8317ad8406e3a5e667c12ae214fe6b248`). Each answer was passed through
`src/core/extract-json.js`, checked with `node tools/validate.mjs` (0 errors, 0 warnings for all three) and scored with `eval/score.mjs`
against the generator's truth (the truth stays out of the repository; the seed rebuilds it).

| file | picture code | seed | style | family | sha256 of the shipped PNG | composite |
| --- | --- | --- | --- | --- | --- | ---: |
| sample-1.png | pd63f | 605 | cad | two-bedroom | `2dcd8fe2c952bfa7e7adb47a08e42329eadb376e9eae1c28de09f2a88d543ac2` | 98.2 |
| sample-2.png | pd965 | 607 | cad | l-shaped | `7367d7632601d419c258f66032c965f200866307450d4d8f1ca0a7dabc0c8b48` | 97.7 |
| sample-3.png | pd4ac | 604 | hatched | one-bedroom | `94369f6e29ebffb980aaf0be6deda83992ced904dbc75b7dc82e8affd8a599ec` | 96.3 |

`scores.md` is the output of `eval/report.mjs`, `readings-samples/<code>.plan.json` are the extracted readings (the folder is not called `readings` because tests/eval/loads.test.mjs scores every `readings` folder against the benchmark of seeds 401 to 408).

## How the pictures were made and chosen

```
node eval/make-benchmark.mjs --seed 601 --count 6 --out <dir> --styles cad,hatched     (seeds 601 to 606)
node eval/make-benchmark.mjs --seed 607 --count 6 --out <dir> --styles cad,hatched     (seeds 607 to 612)
```

The seeds are outside the ranges of the benchmark runs (401 to 412, 501 to 504). Eleven of the twelve pictures were looked at (seed 609,
a two-level house, was not). Five were set aside before any reading because a label sits on a furniture outline or a door swing crosses
furniture (seeds 602, 606, 608, 610, 612), and one (seed 611) because the swing of the bathroom door touches the label. Five were read:
the three shipped ones and two that are not shipped, seed 603 (cad, studio) with 94.0 and seed 601 (cad, balcony) with 91.2 (in both the
swing of the bathroom door touches the label). The three shipped ones are the ones that read best and look like different flats.
So the three composites are the best of a small set. They show that the loop works on these pictures, not how a model reads a typical
drawing; the measured numbers are in `docs/BENCHMARK.md`.

In sample-3.png the swing of the bathroom door touches the first letters of the label "Bathroom"; the reading is not affected.

## How a reading was made

The picture was copied as `plan.png` into an empty folder, and from that folder (with `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`):

```
claude -p --model claude-sonnet-5-5 --system-prompt 'You are a careful assistant that reads images and answers exactly as the user asks.' \
  --tools Read --allowedTools Read --no-session-persistence --output-format json --setting-sources '' --strict-mcp-config \
  "First look at the picture in the file ./plan.png (use the Read tool). It is a floor plan picture. Then follow these instructions exactly.

$(cat docs/PROMPT.md)"
```

The `result` field of the JSON is the answer. Cost: about 0.04 to 0.05 USD and 23 to 31 seconds per reading.
