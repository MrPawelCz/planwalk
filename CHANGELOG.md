# Changelog

All notable changes to planwalk are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The release workflow publishes the section of the tagged version as the release notes (`node tools/changelog-section.mjs <version>` prints it).

## [Unreleased]

### Changed

- Walk goes through furniture. Only walls, windows, stairs with their rails (and the steps of a stair that leaves the plan) and shut doors stop the player; a sofa, a table, a wardrobe, a fridge or a bathtub no longer do. Furniture is still drawn, the start of Walk still keeps clear of it, and the longest view that decides which way Walk starts to look still counts it as an obstacle (`docs/SPEC.md`, section 3, item 5).
- The key hint at the bottom of Walk and the Help text name the space bar and say what stops you and what does not (English and Polish). The hint now fits on one line when the window is wide enough instead of wrapping at half its width.

### Added

- Walk: the space bar jumps (keyboard only). Launch speed 3.0 m/s and gravity 9.8 m/s2 give a jump 0.46 m high that lasts 0.61 s; walking goes on in the air, there is no second jump in the air, a held key does not repeat, and a jump works on stairs and on every level. The camera follows (`state().camera.y`, `state().jump`).
- Walk: doors can be shut and opened. Every door that can be walked through starts open, as it is drawn. The space bar shuts or opens the nearest door within 1.3 m that you are looking at (within 70 degrees, in plain sight), or the door you stand in; away from doors it jumps. The leaf swings about its hinge in 0.45 s and a shut door stops you. A door does not shut while you stand in the doorway (nothing happens). Doors are open again after leaving Walk and after a new plan is loaded, a GLB shows every door open whatever its state (the door itself stays as it was), and the minimap draws a shut door as a wall. Passages have no leaf and are not switched. Touch screens have no jump and no doors (the doors stay open).
- `window.planwalk`: `walkInput({ jump: true })` makes one jump, `walkUse()` does what the space bar does and tells what it did, and `state()` reports `jump` and `doors` (`docs/SPEC.md`).
- `tests/viewer/walk-furniture.test.mjs`, `walk-jump.test.mjs` and `walk-doors.test.mjs` (Node only): the walk through furniture on both examples and on a small plan, what still stops the player, the height and duration of the jump, no double jump, the same result at 60 and 30 steps a second, jumps on stairs and the upper floor, which door the space bar works, the door that never shuts on the player, and the swing of the leaf. `tests/viewer/walk-keys-e2e.test.mjs` (Chrome) presses the space bar as a real key: it jumps, shuts and opens the door, does not press the button that has the focus after a click on Walk or scroll the page, leaves the space bar to a text field that has the focus and to the browser when Ctrl, Alt or Meta is down, and does not let a jump that leaving Walk cut short go on when the player is back. `tests/viewer/walk-examples.test.mjs` (Node only) keeps the layout of both bundled examples walkable between the pieces of furniture: every room can be reached from where Walk starts, or from where the stair arrives on the level above, every door can be walked up to from both sides (the street side of the front door apart), a coffee table keeps at least 50 cm from a sofa or an armchair, and on the one-bedroom flat a simulated route goes along the front of the sofa, between it and the table, round the end of the sofa and through the door of the study.

### Fixed

- The layout of the bundled examples. In the one-bedroom flat (`examples/flat-1.plan.json`) the coffee table stood 15 cm from the sofa and the end of the sofa left 34 cm to the wall at the door of the study; the player is 40 cm wide, so while furniture still stopped the player the study could not be reached from where Walk starts. The sofa is now 1.6 m long and the table stands 60 cm from it, which also leaves 64 cm between the end of the sofa and the wall at the door of the study. The coffee table of the two-level house (`examples/duplex-1.plan.json`) moves 20 cm away from its sofa, from 40 to 60 cm. Walk no longer stops at furniture (see Changed), so the layout is now about how the rooms look: a person could walk between the pieces.

## [0.3.1] - 2026-10-25

### Changed

- The Dollhouse camera no longer moves while the levels pull apart. The view is framed once for the whole range of the Explode slider (the box around the house at rest joined with the box around it at full explode), when a plan is loaded (a bundled example that is loaded again after a change of language included), when the window changes (as long as the camera has not been moved by hand) and when Walk is left, and nothing is fitted again during the move. The ground floor stays where it is on the screen, the box around the house keeps at least 5 percent of margin inside the free area (the part of the window that no bar or card covers) at every step, and the same view comes back when the levels close. The sun and its shadow frame follow the same extent and stay put.
- What this replaces: the view used to be fitted again on every animation step. On plans of two levels in a 1280 by 720 window the ground floor slid by up to 118 px (median 51) and shrank by up to 18 percent (median 12) while the levels rose and closed, the box around the house went past the edge of the free area on 9 of 13 plans, and after the levels closed the view was left up to 118 px off its starting place.
- A plan of one level no longer jumps when the Explode slider is touched. Nothing rises on such a plan, yet the view was fitted again and slid by a median of 84 px (up to 140 px; 27 plans, 1280 by 720), with the box around the house past the edge of the free area on 26 of the 27, and it stayed off its place when the slider went back.
- Measured in Chrome with the new tool below, on 42 plans (the two bundled examples, two test plans, 36 of the 50 readings of the real listing plans of `docs/BENCHMARK.md` that load without errors, and two synthetic stacks of three and four levels) in 72 pairs of plan and window size (1280 by 720, 1440 by 900, and 390 by 844 on a phone held upright): with the new frame the ground floor does not move (0.00 px) and the margin stays at 5 percent or more in every one of the 72 runs. The readings of the real listing plans are not part of this repository.
- The price of a view that holds still is a smaller house at rest on a plan of two or more levels, because the frame has to hold the exploded house: the ground floor is 15 to 23 percent narrower in a 1280 by 720 window (median 19, 13 plans), 3 to 6 percent on a phone held upright (median 5), and 30 and 35 percent for synthetic stacks of three and four levels (about 10 and 13 percent on the phone). A plan of one level looks as before.
- Orbit turns around the target of that frame. The frame is made for the whole range of the slider, so on a plan of two or more levels that target lies higher than the middle of the house at rest. The limit that keeps the camera above the horizon of its target is widened by that height, so the camera still goes down to the middle of the house at rest.
- `?framing=live` in the address brings back the earlier behaviour (see `docs/SPEC.md`).

### Added

- `tools/measure-explode-frame.mjs` measures from outside the page, in Chrome, how the ground floor moves on the screen while the levels pull apart: the screen position of the corners of the plan at the elevation of the first level in five steady states and, frame by frame, over the animation in both directions, its width and the smallest margin of the whole house, for any plan and window size (`--query ?framing=live` for the earlier behaviour).
- Tests: `tests/viewer/explode-range.test.mjs` (the range extent for one, two, three, four and twelve levels), a test of the sun frame in `tests/viewer/scene.test.mjs`, a test of the orbit limit in `tests/viewer/framing.test.mjs`, and `tests/viewer/explode-frame-e2e.test.mjs` (in Chrome: the camera does not move, the ground floor stays within 2 px and the box around the house keeps its margin, on two levels in a desktop window and on three levels in a desktop window and on a phone held upright, after a change of window, after Walk, after a second plan is loaded and in Orbit; Orbit goes down to the middle of the house at rest with a finger on a phone; `?framing=live` keeps the earlier behaviour; a plan of one level is framed the same either way).

## [0.3.0] - 2026-10-25

### Added

- Three sample floor plan drawings in `docs/samples` (synthetic, CC0; the page publishes the three PNG files) and a line on the first-visit card, "No floor plan at hand? Try a sample:" ("Nie masz rzutu pod ręką? Przykłady:" in Polish) with three links that open or download a drawing, with larger touch areas (44 px wide, clear of the buttons below) and links that open with `noopener noreferrer`, so a visitor without a plan can try the whole loop: drawing, AI chat, paste, model. The drawings were picked because a model read them well, so they show the loop, not how a model reads a typical drawing; the readings that were checked are in `eval/results/2026-10-24-samples`.
- A "Report a bad reading" button (in the menu, on a phone in the Menu sheet, and in the issues panel next to "Copy fix request"): it copies the plan to the clipboard and opens a prefilled GitHub issue (the report opens in a new tab with `noopener noreferrer`); the address holds only the version, the languages and the validator codes with their counts (never the plan, names, ids or messages) and stays under 6000 characters, and the page itself sends nothing. When the clipboard is not available, the plan is shown in a box you can select.
- The banner shown when a reading cannot be turned into any model has a "Report a bad reading" button too, and after a tap a short message says that the plan is on the clipboard and the report opens in a new tab (allow pop-ups if nothing opened).
- An issue template, `.github/ISSUE_TEMPLATE/bad-reading.md`, with the same fields, for a report opened by hand.
- A first measurement on real plans: `docs/BENCHMARK.md` has a "Real listing plans" section with 20 floor plans from public listings (10 Polish, 10 UK), read in one call per plan and prompt by Claude Sonnet 5.5 and by Claude Haiku 4.5 with the published prompt (Claude Sonnet 5.5 read the 10 Polish plans twice, with the Polish and with the English prompt, so there are 30 readings of 20 plans), scored against the numbers printed on the drawings and judged by an AI judge. The result is mixed, most readings needed corrections: of 30 readings by Claude Sonnet 5.5, 3 needed no change and 12 needed at most three small corrections; none of the 20 readings by Claude Haiku 4.5 was usable. The Polish plans, mostly developer unit cards, read better than the UK agent drawings (drawing type and country are mixed in this set), and the section lists what went wrong most often and the limits of the measurement. The plans and the readings stay outside the repository, because the images come from third-party listings. README, README.pl.md and both FAQs state the measured result instead of saying that real plans have not been measured, and name the models it covers.

### Changed

- The open first-visit card on a phone stays under 35 percent of the window height with the sample line added, with at least 12 px to spare in English and Polish; the folded card is unchanged.

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

[Unreleased]: https://github.com/MrPawelCz/planwalk/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/MrPawelCz/planwalk/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/MrPawelCz/planwalk/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MrPawelCz/planwalk/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/MrPawelCz/planwalk/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MrPawelCz/planwalk/releases/tag/v0.1.0
