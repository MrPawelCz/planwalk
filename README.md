<h1 align="center">planwalk</h1>
<p align="center"><b>Turn a floor plan into a 3D flat you can walk through.</b></p>
<p align="center">Give an AI that can see images a picture of a floor plan, get a small JSON file, open it in one HTML file.<br>Dollhouse view, exploded levels, first-person walk, GLB export.<br>No server. No API keys. planwalk itself uploads nothing.</p>

<p align="center"><a href="https://github.com/MrPawelCz/planwalk/actions/workflows/ci.yml"><img src="https://github.com/MrPawelCz/planwalk/actions/workflows/ci.yml/badge.svg" alt="ci"></a></p>

<p align="center"><img src="docs/demo.gif" alt="A two-level house as a dollhouse with textured furniture, the levels pull apart, then a first-person walk from the hall up the stairs" width="560"></p>

<p align="center"><img src="docs/looks.jpg" alt="The living room of the example house in the clay look (left) and the textured look (right)" width="760"><br><sub>The same room of the example house in the clay look (left) and the textured look (right).</sub></p>

<p align="center"><a href="https://mrpawelcz.github.io/planwalk/">Open the viewer</a> · <a href="docs/PROMPT.md">Use it in a chat</a> · <a href="skill/planwalk/SKILL.md">Agent skill</a> · <a href="docs/SPEC.md">Format</a></p>

<p align="center">Po polsku: <a href="README.pl.md">README.pl.md</a></p>

---

## Try it in 60 seconds

**With a chat that can read images (nothing to install)**

1. Open the [live viewer](https://mrpawelcz.github.io/planwalk/), or download `planwalk.html` from the [latest release](https://github.com/MrPawelCz/planwalk/releases/latest) and double click it (it works offline, straight from the file). From a clone, `npm start` serves it at http://127.0.0.1:8080/planwalk.html.
2. Give your floor plan image and the prompt from [`docs/PROMPT.md`](docs/PROMPT.md) ([`docs/PROMPT.pl.md`](docs/PROMPT.pl.md) for Polish drawings) to a chat that can read images. Cover names, addresses and phone numbers on the drawing first. The prompt is designed for chats that can read images. The English prompt was measured on the models listed in the Runs by model table of [`docs/BENCHMARK.md`](docs/BENCHMARK.md) (Claude Haiku 4.5 only with the first prompt version, gpt-6-astra with the current one on 7 of 12 plans); the Polish prompt and Polish drawings have not been measured. Other chats that read images are expected to work, but that is an expectation, not a result (results are welcome).
3. Paste the JSON it returns into the viewer ("Paste JSON"). If the viewer lists problems, press "Copy fix request", paste that back into the same chat, repeat.

**With an agent that loads skill folders**

Give the agent the folder [`skill/planwalk`](skill/planwalk) (copy it into your agent's skills directory, for Claude Code that is `~/.claude/skills/`, or just point the agent at it) and say: "Turn this floor plan into a 3D walkthrough." The skill reads the plan, validates it, renders it, compares the render with your drawing, and hands you one HTML file. The folder is self-contained: the validator, the screenshot tool and the viewer are inside it, so no clone of this repository is needed. It needs Node 20 or newer; the render check also needs Node 22 and Chrome or Chromium. The skill is a standard `SKILL.md` folder, but this route has not been benchmarked: the benchmark below measures a reading by hand and one call with the plain prompt, not the agent route.

**Just look around**

Pick an example from the menu: a one-bedroom flat and a two-level house with a stair.

## What you get

- **Dollhouse** with cutaway walls and room names with areas (the area your drawing declares, otherwise an estimate net of the walls, marked with ~), **exploded levels**, top view, free orbit
- **First-person walk** with collisions, doors you can pass through, stairs between levels, a minimap
- **Two looks**: procedural textures (wood boards, tile, carpet, stone, plaster, fabric, linen, knit, rugs, leaves; generated in code, no image files, in real-world scale, details in [`docs/TEXTURES.md`](docs/TEXTURES.md)) on furniture with soft, rounded shapes, or plain clay colours, one click or `?materials=clay`
- **GLB export** (named nodes for walls, rooms, openings, with the textures embedded), PNG snapshot, and a **standalone HTML file** with your plan embedded: send a 3D flat as a single file
- A **validator** that explains each structural mistake it finds in words an AI can act on (the repair loop; it cannot tell whether the plan matches your drawing)

## How it works

```text
floor plan image / PDF / sketch
          |   an AI that reads images (chat or agent), with the prompt or the skill
          v
      plan.json   <-- validator: geometry checks, scale cross-check, readable fixes
          v
planwalk viewer (one HTML file): dollhouse, explode, walk, GLB
```

The JSON is the product. An AI can write it, you can read and fix it, and any tool can consume it. The format is in [`docs/SPEC.md`](docs/SPEC.md) and [`schema/plan.v1.schema.json`](schema/plan.v1.schema.json).

## The format at a glance

```json
{
  "version": 1, "units": "m",
  "levels": [{
    "id": "L0",
    "walls":    [{ "id": "w1", "from": [0, 0], "to": [6, 0], "kind": "exterior" }],
    "openings": [{ "id": "d1", "wall": "w1", "type": "door", "offset": 1.0, "width": 0.9 }],
    "rooms":    [{ "id": "r1", "name": "Studio", "polygon": [[0, 0], [6, 0], [6, 4], [0, 4]], "area": 24 }]
  }]
}
```

Walls are centerlines with a thickness, openings sit on walls, rooms are polygons, levels stack. Optional: stairs, furniture, units (`m`, `cm`, `mm`, `ft`, `in`). Full reference: [`docs/SPEC.md`](docs/SPEC.md).

## Command line

```bash
node tools/validate.mjs plan.json                 # check a plan, readable errors, exit code for CI
node tools/capture.mjs plan.json --out shots/     # headless Chrome (Node 22+): screenshots, console check, --gif (--gif-width, --gif-fps), --glb, --materials clay|textured, --no-panel
node tools/serve.mjs dist 8080                    # serve the viewer locally
node eval/score.mjs truth.plan.json reading.plan.json   # score an AI reading against the known truth (composite 0 to 100)
node eval/make-benchmark.mjs --seed 401 --count 8 --out eval/out/bench   # synthetic plans, 4 drawing styles, truth under opaque codes
node eval/report.mjs eval/out/bench readings/            # score a folder of readings
npm run build                                     # rebuild dist/planwalk.html
npm run build:skill                               # build, then regenerate the tools and the viewer inside skill/planwalk/
```

The validator and the build are plain ES modules that need Node 20 or newer (CI runs Node 20, 22 and 24); `tools/capture.mjs` and the full test suite need Node 22 or newer, and capture needs Chrome. The product has no runtime dependencies (three.js is bundled into the viewer; esbuild is a dev dependency).

## Benchmark (a synthetic smoke test, not proof)

`eval/` generates synthetic plans with a known truth, draws them in four styles (clean CAD, hatched, hand-style sketch without any scale, scan) and scores how well an AI read the image back into the JSON (rooms, areas, openings, connectivity; composite 0 to 100).

First run: Claude Sonnet 5.5 read 12 clean synthetic plans with a mean composite of **99.6 out of 100** (lowest 98.3). That was a reading by hand in an agent session. Reading the same plans in one call with the first prompt version, the way a person uses a chat, gave 92.4 and 95.3 (two runs of Claude Sonnet 5.5), 87.8 (gpt-6-astra) and 34.4 (Claude Haiku 4.5, where 4 of 12 answers loaded); every run and the later prompt versions are in the Runs by model table. The 99.6 shows the pipeline works. It does **not** show that real floor plans are read this well: the plans are easy, the reader was not blind to the harness, and it was one pass with no repeats. Every known leak and weak case is in [`docs/BENCHMARK.md`](docs/BENCHMARK.md), together with the readings, hashes and commands to reproduce or to run your own model.

Real drawings have not been benchmarked yet: expect worse on sketches without a scale, scans and cluttered drawings. Plans that break the reading are the most useful contribution.

## Limits (v0.1)

- Reading quality depends on the model and the drawing. Clean CAD drawings with printed dimensions work best; sketches without any scale are a guess. The About sheet shows the scale note the reader wrote, and a "Scale estimated" badge appears when that note says so (it looks for phrases such as "a guess", "standard door" or "scale estimated", and their Polish equivalents). The viewer does not measure anything itself: the validator only checks that the size is plausible and that declared room areas fit the polygons.
- Straight stairs only; on a drawing of one floor a stair leaves the plan (drawn as steps, not walkable). No roofs, terrain or exterior. Textures follow the room `floor` kind and a few fixed rules, not your drawing. Furniture is decorative.
- It visualises the drawing you give it. It is not a survey and not for permits or construction.
- Your plan never leaves your machine through planwalk; the image goes only to the AI you choose to give it to.

## FAQ

See [`docs/FAQ.md`](docs/FAQ.md) for the longer list. Short version: the JSON is the contract between the AI, the validator and the viewer; the viewer works offline and without a GPU (slowly); the code is MIT and the example plans are CC0.

## Development

```bash
npm ci                # dev dependencies only
npm run build:skill   # writes dist/ and regenerates skill/planwalk/ (commit both)
npm test              # node --test, fails when a generated skill file is stale (CI also checks dist/)
```

Layout: `schema/` the format, `src/core/` units, geometry and validator, `viewer/` the viewer source, `tools/` command line tools, `eval/` the benchmark harness (generator, drawing styles, scorer, results), `skill/` the agent skill (its `scripts/validate.mjs`, `scripts/embed.mjs`, `scripts/capture.mjs` and `assets/planwalk.html` are generated), `examples/` plans (synthetic, CC0), `docs/` specification and prompt. Contributions that help most: plans that break things, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Author

Paweł Czerwiński ([@MrPawelCz](https://github.com/MrPawelCz)).

## License

MIT, see [`LICENSE`](LICENSE). Third-party licences: [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
