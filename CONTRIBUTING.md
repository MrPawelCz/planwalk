# Contributing

Thanks for looking. The most useful contributions, in order:

1. **Plans that break things.** If an AI misreads a drawing, or the viewer builds something wrong, open an issue with the JSON (see the templates). Redrawn or synthetic plans are welcome, please do not share drawings you are not allowed to share.
2. **Reading quality.** Better prompts, better skill instructions, new styles in `eval/` (hatched, scanned, photographed), results from other models in `docs/BENCHMARK.md`. The prompt on the page (the Copy prompt buttons) is the whole of `docs/PROMPT.md`, and of `docs/PROMPT.pl.md` when that file exists (the files hold nothing but the prompt), embedded by `npm run build`: edit the file, not the page.
3. **Viewer features.** Open an issue first for anything that changes the plan format (`schema/plan.v1.schema.json`, `docs/SPEC.md`): the format is the contract between the AI, the validator and the viewer. Textures are procedural and deterministic (`viewer/src/textures.js`, how it works and how to add one in `docs/TEXTURES.md`): a new texture is a generator and a test, not an image file.

## Setup

```bash
npm ci                # dev dependencies only (esbuild, three); the product has no runtime dependencies
npm run build:skill   # writes dist/ and the generated files in skill/planwalk/ (both committed)
npm test              # node --test; fails when a generated skill file is stale (CI also checks dist/)
```

Code is plain ES modules, Node 20 or newer (the full test suite and the capture tool need Node 22). Keep comments short and in English. Do not add runtime dependencies; a dev dependency needs a reason and a permissive licence (MIT, Apache-2.0, BSD).

## Pull requests

Small and focused. Add or update a test, run `npm run build:skill` and then `npm test`, and commit the rebuilt `dist/` and `skill/planwalk/` (`skill/planwalk/scripts/validate.mjs`, `skill/planwalk/scripts/capture.mjs` and `skill/planwalk/assets/` are generated: change the sources, not those files). Plans in `examples/` must be synthetic or CC0.

CI runs the tests on Node 20, 22 and 24 (Ubuntu) and on Windows with Node 22. The tests that start Chrome need Node 22 or newer: on 20 they skip, and where CI sets `PLANWALK_REQUIRE_CHROME=1` (Node 22 and 24, and the release) a skip fails the run instead. A Node 22 job also exports GLB files and checks them with the Khronos glTF validator (`tools/validate-glb.mjs`, errors fail, warnings are printed). `tests/tools/size-budget.test.mjs` keeps `dist/planwalk.html` under 900 KB (260 KB gzipped): raise the numbers there only on purpose.

## Releasing

Releases are cut by pushing a tag. The tag, `package.json` and `CHANGELOG.md` have to agree.

1. Move the entries under `## [Unreleased]` in `CHANGELOG.md` into a new `## [x.y.z] - YYYY-MM-DD` section (its text becomes the release notes) and update the links at the bottom of the file.
2. Set the same `x.y.z` in `package.json` and `package-lock.json` (`npm install --package-lock-only`); the viewer takes its version from `package.json` (`tests/tools/version.test.mjs` checks the lock file and that import). Run `npm run build:skill` and `npm test`, and commit the result including `dist/` and `skill/planwalk/`.
3. Tag the commit and push the tag: `git tag vX.Y.Z && git push origin main vX.Y.Z`.
4. The `release` workflow checks that the tag matches `package.json` and that `dist/` is up to date, runs the full test suite (Chrome tests required), then publishes a GitHub release with `planwalk.html`, `planwalk.html.sha256` and a build provenance attestation, using the CHANGELOG section as notes.
5. Verify a download: put `planwalk.html` and `planwalk.html.sha256` in one folder and run `sha256sum -c planwalk.html.sha256` (on macOS `shasum -a 256 -c planwalk.html.sha256`). With the GitHub CLI, `gh attestation verify planwalk.html --repo MrPawelCz/planwalk` shows that the file was built by the workflow from that tag.

The workflow files pin every third party action to a commit sha with its version in a comment, and Dependabot proposes the updates weekly in one grouped pull request per ecosystem.
