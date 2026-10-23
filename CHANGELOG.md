# Changelog

All notable changes to planwalk are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The release workflow publishes the section of the tagged version as the release notes (`node tools/changelog-section.mjs <version>` prints it).

## [Unreleased]

### Added

- Copy link makes a short link that holds the plan (`#z=`, compressed, about 70 to 75 percent shorter than the `#plan=` form for the two examples); Copy long link makes the older `#plan=` form for browsers without compression. Older `#plan=` links keep opening. Share image hands the current view to the share sheet where the browser supports it, otherwise it downloads the PNG.
- A damaged or oversized `#z=` link gives the plain banner and leaves the model on screen; a link typed into the address bar of an open tab is now read too.

## [0.1.0] - 2026-10-23

First public version.

### Added

- Plan format version 1: a JSON schema (`schema/plan.v1.schema.json`) and the specification in `docs/SPEC.md`. Levels hold walls, openings, rooms, stairs and furniture; units are `m`, `cm`, `mm`, `ft` and `in`.
- A validator (`src/core/validate.js`, command line `tools/validate.mjs`) that checks geometry and scale and explains each mistake in words an AI can act on, with an exit code for CI.
- A one-file viewer, `dist/planwalk.html` (with two example plans) and `dist/planwalk-empty.html` (without): dollhouse with cutaway walls and room names with areas, exploded levels, top view, free orbit, and a first-person walk with collisions, doors, stairs between levels and a minimap.
- Two looks: procedural textures (generated in code, no image files) on furniture with soft, rounded shapes, or plain clay colours (`?materials=clay`).
- Exports: GLB with named nodes for walls, rooms and openings (textures embedded), PNG snapshot, and a standalone HTML file with the plan embedded.
- A headless capture tool, `tools/capture.mjs` (Node 22 and Chrome or Chromium): screenshots of every mode, a console check, GIF and GLB output.
- An agent skill in `skill/planwalk` that carries its own validator, capture tool and viewer, so the folder can be copied alone.
- A benchmark harness in `eval/` (synthetic plan generator, four drawing styles, scorer) with the first results in `docs/BENCHMARK.md`.
- Continuous integration (tests on Node 22), deployment of the viewer to GitHub Pages, issue templates, and the MIT licence with the third-party notices in `THIRD_PARTY_LICENSES.md`.

[Unreleased]: https://github.com/MrPawelCz/planwalk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MrPawelCz/planwalk/releases/tag/v0.1.0
