# Changelog

All notable changes to planwalk are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The release workflow publishes the section of the tagged version as the release notes (`node tools/changelog-section.mjs <version>` prints it).

## [Unreleased]

## [0.2.0] - 2026-10-24

### Added

- Copy link makes a short link that holds the plan (`#z=`, compressed, about 70 to 76 percent shorter than the `#plan=` form for the two examples); Copy long link makes the older `#plan=` form for browsers without compression. Older `#plan=` links keep opening. Share image hands the current view to the share sheet where the browser supports it, otherwise it downloads the PNG. On a page opened from a file (or from any address that is not http or https) the link starts with the public page address, the Polish page for a Polish interface, so it never carries a local path.
- A damaged or oversized `#z=` link gives the plain banner and leaves the model on screen; a link typed into the address bar of an open tab is now read too.
- Top view on a touch screen: one finger pans and two fingers pinch to zoom around the point between them (the mouse wheel zoomed already). The language switch (PL or EN) sits in the title row of the phone Menu.
- Polish interface for the whole page: toolbar, dialogs, issues panel, room labels (decimal comma) and the Copy fix request text follow the language. The browser language decides, `?lang=pl` or `?lang=en` overrides it, and a PL | EN switch in Help changes it at once and keeps the plan you loaded, the camera and your choices (the bundled example is loaded again in the other language, so its camera and view options start over). The validator's own messages stay in English.
- Phone layout for a window 700 px wide or less, or 450 px high or less (a phone on its side): a bar of one row with a Menu that holds the other controls, a bottom bar with the four modes (on its side they stay in the top bar), issues behind a badge that opens a sheet (on a desktop the issues panel gets a close cross and a badge to bring it back), the first visit card folded to one line until tapped, 44 px touch targets and a close cross in the dialogs.
- The first view, Orbit, Top and the PNG export frame the whole model inside the area that no bar or card covers, with a small margin; turning the phone frames it again until you move the camera.
- Walk on a touch screen in the phone layout shows two shaded halves and a one line hint ("Drag the left half to walk, the right half to look") for 4 seconds after you enter it.
- A status line, "Loaded: name, 4 rooms" ("Wczytano: nazwa, 4 pomieszczenia" in Polish), shows for about 5 seconds under the toolbar after a paste, a dropped or opened file or a `?plan=` download. It takes no taps and screen readers announce it politely; links (`#plan=`, `#z=`) and the embedded plan stay quiet.
- Tolerant reading in the validator: an unknown property is warning W116 and is ignored instead of error E002 (`$schema` and `x-` keys pass without a word), and `{ strict: true }` keeps E002. The result lists the elements that were left out (`skipped`: kind, id, path, reason) and sets `partial` when a model can be built from the rest.
- A plan in which only some elements have errors opens without them: a banner says how many were skipped, lists the first ten and offers Copy fix request. With no wall left nothing opens and the model on screen stays. `window.planwalk.load` returns `partial` and `skipped`. A stair that leads to a skipped level is skipped and counted too, and `partial` is set only when at least one element was skipped. Properties the viewer ignores do not count toward the limit of 1000 schema violations (they have their own limit), so a plan with many extras still opens. A `units` value that is not understood (such as "feet") is still refused with a fix request, not shown at the wrong scale.
- Command line (`tools/validate.mjs` and the skill's copy): an unknown property is a warning that does not fail the check and `--strict` fails on it; a last line says how many elements the viewer would skip, when there are any; `--json` adds `partial` and `skipped`.
- A Polish landing page at `/pl/` with its own link preview image (`docs/social-preview-pl.jpg`). `tools/localize-page.mjs` derives it from the built demo page (Polish title, description and preview tags, `lang="pl"`, Polish as the default interface language, `?lang=en` still wins); the Pages workflow publishes both pages and both images, and the English page links to the Polish one with canonical and hreflang tags.
- `tools/make-social-preview.mjs` renders the link preview images (1200 by 630 JPEG, each under 150 KB, `--lang en,pl`) from the viewer; it needs Node 22 and Chrome.
- `README.pl.md` and `docs/FAQ.pl.md` rewritten against the Polish interface: buttons and windows are named as the page spells them, jargon is explained at first use, the FAQ says how to send a model to a phone, and a test checks every quoted name against the interface strings.
- `docs/BENCHMARK.md` has a second table, "Loads in the viewer", next to the strict "Loads" column: clean, warnings only, errors listed, partial and skipped elements for every stored run. `node eval/loads.mjs` prints it (`--json` for each plan); a test checks that the table equals the output and that every stored score file is still reproduced, because the scorer stays strict.
- A row in "Runs by model" for the small model read with the current prompt (v4): mean composite 50.3 against 34.4 with the first prompt, and 9 of 12 plans load against 4 (the run is stored in `eval/results/`). README and both FAQs quote the two rows.
- The two bundled examples have Polish names (plan, levels, rooms, notes) on the Polish page and in a Polish browser; the PL | EN switch reloads an untouched example in the other language, and a plan you loaded yourself is never renamed.
- When a plan opens whole but carries properties the viewer ignores (a `furniture` list inside a room is the usual one), a one line banner says which, with the Copy fix request button (the validator result lists them in `ignored`).

### Changed

- Walk starts looking along the longest free view from the starting point (a ray test in 5 degree steps against walls and furniture) instead of straight at the wall opposite the door.
- Copy link and Copy long link keep the phone Menu open, so the "Copied" confirmation on the button can be seen.
- Export file names (GLB, PNG, standalone HTML) turn Polish letters into plain letters instead of dropping them: "Żółta kuchnia 2" is saved as `zolta-kuchnia-2` (it was `ta-kuchnia-2`), and a name longer than 48 characters is cut between words, not inside one.
- The "Scale estimated" badge appears only when the scale note says the scale itself is a guess, in English or Polish. A printed basis such as "scale from the printed dimension" cancels a note that only says the scale is missing, and words about other things ("wall thickness estimated") no longer raise it.
- The first visit card opens with one sentence on what planwalk does, says what to do next after Copy prompt (open a chat, add the picture, paste the prompt), and its privacy line says that the picture of the plan goes only to the chat you choose, so names and addresses should be cropped out first. Copy prompt copies the Polish prompt on a Polish page, and also when the browser lists Polish anywhere and the language was not picked by hand.
- README and FAQ describe Copy link (the plan is stored inside the link) and say that a plan with a few mistakes still opens (a `units` value the viewer does not understand is the exception: such a plan is refused and the fix request names it).

### Fixed

- In browsers that support `overscroll-behavior` (Chrome, Firefox, Safari 16 or newer) pulling down on a bar or a sheet no longer reloads the page, and a quick second tap on a button no longer zooms it (`touch-action: manipulation`). Set in the page's CSS; not yet tried on a real phone.
- Help, About, the paste dialog and the share dialog open and close in Safari before 15.4, which has no `showModal`: one helper (`viewer/src/dialogs.js`) opens every dialog and Escape closes it.

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

[Unreleased]: https://github.com/MrPawelCz/planwalk/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/MrPawelCz/planwalk/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/MrPawelCz/planwalk/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MrPawelCz/planwalk/releases/tag/v0.1.0
