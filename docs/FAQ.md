# FAQ

**Is this just another floor plan editor?** No. The editor problem is solved by others (for example Pascal Editor). planwalk is the missing step before it: reading an existing drawing into clean data, checking it, and turning it into something you can walk through. The JSON is the product; the viewer is one consumer of it.

**Why JSON and not a model file?** Because an AI can write it, a human can read and fix it, a validator can check it and explain errors, and any tool can consume it. The viewer exports GLB for everything else.

**How accurate is the reading?** It depends on the model and the drawing. So far there is a smoke test and nothing else: synthetic plans with known ground truth in four drawing styles, and the harness to reproduce it (`eval/`, results and every caveat in `docs/BENCHMARK.md`). On 12 clean synthetic plans Claude Sonnet 5.5, reading by hand in an agent session, scored a mean 99.6 out of 100; read in one call with the first prompt version, the way a person uses a chat, the same plans scored 92.4 and 95.3 (two runs of Claude Sonnet 5.5), 87.8 (gpt-6-astra) and 34.4 (Claude Haiku 4.5, which scored 50.3 with the current prompt version). Those plans are easy and the reader was not blind to the harness, so it says the pipeline works, not that real plans are read this well. Real drawings have not been benchmarked. Expect worse on sketches without a scale, scans and cluttered drawings. The validator catches structural mistakes, not misreadings: always compare with your drawing.

**Does my plan leave my machine?** planwalk never uploads anything, and the viewer makes no network requests of its own; the one exception is the optional `?plan=<url>` parameter, which downloads a plan from the address you give it. The image goes only to the AI you choose to give it to (your chat or your agent), so cover names, addresses and phone numbers on the drawing first (cropping is enough).

**Which AI do I need?** One that can read images and write JSON. What is measured: the models listed in the Runs by model table of `docs/BENCHMARK.md`, with the caveats of each run. Other chats that read images are expected to work, but that is an expectation, not a result; results are welcome. The prompt in `docs/PROMPT.md` is meant for a plain chat (`docs/PROMPT.pl.md` for Polish drawings). The skill in `skill/planwalk` is a standard skill folder for agents that load skills; it has not been benchmarked.

**The result looks wrong. What can I try?** Crop the image to the plan (keep a room table if the drawing has one), cover names and addresses in the title block, and send one floor per image if the drawing is busy. If the viewer lists problems, press "Copy fix request" and paste it back into the same chat. If walls do not meet or rooms look too big, tell the chat: "trace the centerline of the thick wall strips and make walls meet at shared corner points". Compare the result with your drawing: planwalk shows what the JSON says, not what the drawing meant.

**Why no server or build step for users?** `dist/planwalk.html` is one file: double click it. Standalone export embeds your plan in one HTML file, to open on a computer; to send the flat to someone's phone use Copy link (the plan is stored inside the link, so whoever gets the link, and the app you send it through, can read it; a link copied from a downloaded file points to the live page, so opening it needs a connection).

**Does it run without a GPU?** Yes, in software rendering (we test headless Chrome with SwiftShader), just slowly. Frame rates with a real GPU have not been measured.

**Can I use it for real-estate listings?** Yes, with care: it visualises the drawing you give it and is not a survey. Say so in listings. Not for permits or construction.

**What about furniture, textures, exterior, roofs?** Furniture is decorative: simple built-in shapes chosen by type (sofa, bed, table, plant and so on), placed where the plan says, with soft rounded forms in the textured look. Textures (wood, tile, carpet, stone, plaster, fabric, linen, knit, rugs, leaves) are generated in code from each room's floor type, the furniture type and a few fixed rules, not read from your drawing; a plain clay look is one click away. No roofs and no terrain in v0.1. Stairs are straight stairs only.

**Why MIT?** So anyone can use it in products. If you do, a link back is appreciated, not required.
