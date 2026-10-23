# FAQ

**Is this just another floor plan editor?** No. The editor problem is solved by others (for example Pascal Editor). planwalk is the missing step before it: reading an existing drawing into clean data, checking it, and turning it into something you can walk through. The JSON is the product; the viewer is one consumer of it.

**Why JSON and not a model file?** Because an AI can write it, a human can read and fix it, a validator can check it and explain errors, and any tool can consume it. The viewer exports GLB for everything else.

**How accurate is the reading?** It depends on the model and the drawing. So far there is a smoke test and nothing else: synthetic plans with known ground truth in four drawing styles, and the harness to reproduce it (`eval/`, results and every caveat in `docs/BENCHMARK.md`). On 12 clean synthetic plans Claude Sonnet 5.5 scored a mean 99.6 out of 100, but those plans are easy and the reader was not blind to the harness, so it says the pipeline works, not that real plans are read this well. Real drawings have not been benchmarked. Expect worse on sketches without a scale, scans and cluttered drawings. The validator catches structural mistakes, not misreadings: always compare with your drawing.

**Does my plan leave my machine?** planwalk never uploads anything, and the viewer makes no network requests of its own; the one exception is the optional `?plan=<url>` parameter, which downloads a plan from the address you give it. The image goes only to the AI you choose to give it to (your chat or your agent).

**Which AI do I need?** A model that can read images and write JSON. So far only Claude Sonnet 5.5 has been benchmarked (see `docs/BENCHMARK.md`); results from other models are welcome. The prompt in `docs/PROMPT.md` is meant for a plain chat; the skill in `skill/planwalk` is a standard skill folder for agents such as Claude Code, Codex and OpenClaw.

**Why no server or build step for users?** `dist/planwalk.html` is one file: double click it. Standalone export embeds your plan so you can send the 3D flat to someone as a single file.

**Does it run without a GPU?** Yes, in software rendering (we test headless Chrome with SwiftShader), just slowly. Frame rates with a real GPU have not been measured.

**Can I use it for real-estate listings?** Yes, with care: it visualises the drawing you give it and is not a survey. Say so in listings. Not for permits or construction.

**What about furniture, textures, exterior, roofs?** Furniture is decorative: simple built-in shapes chosen by type (sofa, bed, table, plant and so on), placed where the plan says, with soft rounded forms in the textured look. Textures (wood, tile, carpet, stone, plaster, fabric, linen, knit, rugs, leaves) are generated in code from each room's floor type, the furniture type and a few fixed rules, not read from your drawing; a plain clay look is one click away. No roofs and no terrain in v0.1. Stairs are straight stairs only.

**Why MIT?** So anyone can use it in products. If you do, a link back is appreciated, not required.
