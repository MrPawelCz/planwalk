# Contributing

Thanks for looking. The most useful contributions, in order:

1. **Plans that break things.** If an AI misreads a drawing, or the viewer builds something wrong, open an issue with the JSON (see the templates). Redrawn or synthetic plans are welcome, please do not share drawings you are not allowed to share.
2. **Reading quality.** Better prompts, better skill instructions, new styles in `eval/` (hatched, scanned, photographed), results from other models in `docs/BENCHMARK.md`. The prompt on the page (the Copy prompt buttons) is the fenced block of `docs/PROMPT.md`, and of `docs/PROMPT.pl.md` when that file exists, embedded by `npm run build`: edit the file, not the page.
3. **Viewer features.** Open an issue first for anything that changes the plan format (`schema/plan.v1.schema.json`, `docs/SPEC.md`): the format is the contract between the AI, the validator and the viewer. Textures are procedural and deterministic (`viewer/src/textures.js`, how it works and how to add one in `docs/TEXTURES.md`): a new texture is a generator and a test, not an image file.

## Setup

```bash
npm ci                # dev dependencies only (esbuild, three); the product has no runtime dependencies
npm run build:skill   # writes dist/ and the generated files in skill/planwalk/ (both committed)
npm test              # node --test; fails when a generated skill file is stale (CI also checks dist/)
```

Code is plain ES modules, Node 18 or newer. Keep comments short and in English. Do not add runtime dependencies; a dev dependency needs a reason and a permissive licence (MIT, Apache-2.0, BSD).

## Pull requests

Small and focused. Add or update a test, run `npm run build:skill` and then `npm test`, and commit the rebuilt `dist/` and `skill/planwalk/` (`skill/planwalk/scripts/validate.mjs`, `skill/planwalk/scripts/capture.mjs` and `skill/planwalk/assets/` are generated: change the sources, not those files). Plans in `examples/` must be synthetic or CC0.
