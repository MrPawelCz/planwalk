# Sample drawings

Three floor plan pictures to try planwalk when you have no plan at hand. Open the viewer, copy the prompt, give one of these pictures
and the prompt to an AI chat that reads images, and paste the answer back (the same three steps as for your own plan).

| file | what it shows | generator seed |
| --- | --- | ---: |
| `sample-1.png` | a two-bedroom flat with a corridor, solid walls | 605 |
| `sample-2.png` | an L-shaped flat, solid walls | 607 |
| `sample-3.png` | a one-bedroom flat with fixtures, hatched walls | 632 |

They are synthetic: drawn by the generator in [`eval/`](../../eval) from numbers, not copied from any real plan, and released under
CC0 (public domain). They were picked because a model read them well in one try, so they are not a measure of quality. They show the
steps, not how a model reads a typical drawing. How the readings of these pictures were checked is in
[`eval/results/2026-10-24-samples`](../../eval/results/2026-10-24-samples); what was measured on a larger set is in the
[benchmark section of the README](../../README.md#benchmark-a-synthetic-smoke-test-not-proof) and in [`docs/BENCHMARK.md`](../BENCHMARK.md).
