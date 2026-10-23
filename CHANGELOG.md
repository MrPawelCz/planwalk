# Changelog

All notable changes to planwalk are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The release workflow publishes the section of the tagged version as the release notes (`node tools/changelog-section.mjs <version>` prints it).

## [Unreleased]

### Added

- Copy link makes a short link that holds the plan (`#z=`, compressed, about 70 to 75 percent shorter than the `#plan=` form for the two examples); Copy long link makes the older `#plan=` form for browsers without compression. Older `#plan=` links keep opening. Share image hands the current view to the share sheet where the browser supports it, otherwise it downloads the PNG.
- A damaged or oversized `#z=` link gives the plain banner and leaves the model on screen; a link typed into the address bar of an open tab is now read too.
- Top view on a touch screen: one finger pans and two fingers pinch to zoom around the point between them (the mouse wheel zoomed already). The language switch (PL or EN) sits in the title row of the phone Menu.

### Changed

- Walk starts looking along the longest free view from the starting point (a ray test in 5 degree steps against walls and furniture) instead of straight at the wall opposite the door.
- Copy link and Copy long link keep the phone Menu open, so the "Copied" confirmation on the button can be seen.

## [0.1.1] - 2026-10-24

First aid for people who open the page for the first time with an answer pasted from a chat.

### Added

- Pasting a chat answer works as it comes: the viewer finds the plan in a code block, after a `json` label or among notes, and repairs typographic quotes, comments and trailing commas (it says what it repaired). When an answer holds several code blocks or two plans, the last plan is loaded and the viewer says so. A failed paste, drop, file or link keeps the model on the screen and explains in plain words what went wrong. An "Open file" button loads a `.json` file.
- A card on the first visit: three steps, a "Copy prompt" button (the prompt is built into the page from `docs/PROMPT.md`, or `docs/PROMPT.pl.md` for Polish), and a label that says the model on the screen is an example.
- Link preview tags (title, description, a 1200 by 630 image, an icon) so that a link shows a card in chats and on social sites, and one line on the first screen about privacy.
- Honest room areas: a label shows the area declared on the drawing and, when there is none, an estimate marked with `~`. An "About this model" sheet shows the scale and how it was found, the reader's notes and the version, and says that the model is a visualisation, not a measurement.
- Polish documents: `docs/PROMPT.pl.md`, `README.pl.md` and `docs/FAQ.pl.md`.
- Validator warnings for unit slips: furniture above 6 m (W112), a level height outside 2 to 6 m (W113), a stair width outside 0.5 to 3 m (W114), an implausible window width (W115). A new error, E014, for a wall end, room corner, stair end or furniture centre more than 1000 m from the origin (usually a mistyped number).
- Command line: `tools/validate.mjs` and the skill's `embed.mjs` read a whole chat answer like the viewer does and print each repair as a `note:` line (a `repairs` list with `--json`); `--strict` also fails when the text had to be repaired.
- A card that explains the problem when WebGL 2 is missing and a visible message when loading throws, instead of a blank page. The viewer also starts without `Object.hasOwn` and `CanvasRenderingContext2D.roundRect` (older Safari).
- Release hygiene: a release workflow for `v*` tags (the single file `planwalk.html`, its sha256 and a provenance attestation), this changelog, Dependabot for npm and the Actions, a size budget test, exact dependency versions, tests on Node 20, 22 and 24 and on Windows, and a Khronos glTF validator step for GLB exports.
- `docs/BENCHMARK.md` has a "Runs by model" table: the same 12 synthetic plans read in one call per picture by several models, with the prompt versions used.

### Changed

- The prompt asks for metres for every length (furniture included), one JSON object in one code block, doubts in `meta.notes` and `meta.scale_note`, no personal names or addresses in the JSON, and says that stairs need `steps`, that openings must lie inside their wall and that `name` has at most 120 characters.
- Statements about which chats work point to the measured table instead of naming one model.
- Node 20 or newer (what CI tests). `tools/capture.mjs` and the Chrome tests need Node 22. Test files run one after another by default.

### Security

- Hostile input is bounded: a plan text over 2 MB is refused (paste, drop, file, `?plan=` and `#plan=`), the number of items and the length of strings are capped in the schema and the validator, `__proto__`, `constructor` and `toString` as keys are rejected, a message repeats at most 80 characters of a value, and the work of the validator, the scale-note matching, the area estimate, the label placement, the spawn search and the furniture builder has a budget. A 10 KB plan with ids of 5,000 characters validates in under a second inside a 256 MB heap. A whole plan placed 1e15 m or more from the origin no longer freezes the page: the label and walk start searches use counted loops.

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

[Unreleased]: https://github.com/MrPawelCz/planwalk/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/MrPawelCz/planwalk/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MrPawelCz/planwalk/releases/tag/v0.1.0
