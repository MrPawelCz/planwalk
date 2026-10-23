# Textures

The viewer has two looks: **clay** (plain colours, the original) and **textured** (the default). The textures are made in code when the page loads. There are no image files, no network requests and no licences to track, and the same textures should come out on every machine (see Determinism).

```text
viewer/src/textures.js    generators: pure JavaScript, no DOM, no three.js, no imports
viewer/src/materials.js   which material name uses which texture, tint, roughness, normal strength, GLB hints
viewer/src/uv.js          boxes with texture coordinates in metres
viewer/src/soft.js        rounded and puffed boxes (cushions, bedding, rugs) and leaf blades, textured look only
viewer/src/scene.js       floors, ceilings, walls, stairs, ground: uv in metres; swaps the look
```

Switch the look with the Textures toggle in the toolbar, `window.planwalk.setMaterials('clay' | 'textured')`, `?materials=clay` in the URL, or `--materials clay` in `tools/capture.mjs` (which also decides what `--glb` exports). `state().materials` tells which look is in force.

## The textures

Every texture is a square that tiles without a seam. `world` is how many metres one repeat covers, so one pixel is `world / size` metres. Sizes only ever shrink in the contract test, `world` and the average colour never change.

| Key | Used for | Colour map | Repeat | Normal map | How it is made |
| --- | --- | --- | --- | --- | --- |
| `floor-wood` | rooms with `floor: wood` | 1024 px | 2.0 m | 512 px | 14 boards of 143 mm, two boards per row with a random joint 0.6 to 1.4 m along, neighbouring rows at least 0.3 m apart; tone per board about 5 percent, grain as stretched periodic noise, 1 px dark gaps |
| `floor-tile` | `floor: tile` | 1024 px | 1.2 m | 512 px | 2 x 2 porcelain tiles of 0.6 m, 3.5 mm grout (186, 189, 192), tone per tile about 2.5 percent, faint veins and speckle |
| `floor-carpet` | `floor: carpet` | 512 px | 1.0 m | 256 px | short wool pile: fine fibres with a little direction along x and very soft shading |
| `floor-stone` | `floor: stone` | 1024 px | 2.0 m | 512 px | travertine slabs in rows of 0.4 m, three slabs of 0.5 to 0.9 m per row, 3 mm joints, cloudy mottling, thin strata, small pits |
| `floor-concrete` | `floor: concrete` | 512 px | 2.0 m | 256 px | polished screed: cloudy patches, faint trowel smears, rare dark pores |
| `wall-plaster` | walls, ceilings, floor edges | 512 px | 1.0 m | 256 px | matt paint on plaster: a faint orange peel and a very slow drift, so a wall stays calm |
| `wood-furniture` | furniture wood, door leaves, stair steps | 512 px | 1.0 m | 256 px | oak veneer: gently wavy growth rings (an integer number per repeat), tone per ring, fine streaks, pore dashes, rays |
| `fabric` | linen cloth (`f:linen`) | 256 px | 0.5 m | 256 px | upholstery cloth in a 2/2 twill with 4 px threads of uneven thickness |
| `rug` | (no material uses it now; kept for a calmer rug) | 512 px | 1.0 m | 256 px | wool rug with soft diamonds in two close tones over the carpet pile |
| `rug-bold` | the field of a rug | 512 px | 1.2 m | 256 px | cream wool with a trellis of nested diamonds in grey (cell 0.6 m, shifted half a cell so the tile edge crosses a diamond) over the carpet pile |
| `ground` | the ground in Walk mode | 512 px | 4.0 m | none | light pavers of 1 x 1 m, 1 px joints, tone per paver about 2 percent |
| `linen` | bedding, pillows | 256 px | 0.35 m | 256 px | a plain weave of 4 px threads, a few thicker and darker threads (slubs), a very soft mottling |
| `knit` | blankets, scatter cushions | 256 px | 0.4 m | 256 px | chunky knit: columns of V stitches of 16 px (6 cm), each V two plump legs of twisted yarn |
| `boucle` | sofa frames and seat cushions | 256 px | 0.4 m | 256 px | overlapping yarn loops of about 1 cm, each in its own tone, a little darker in the gaps |
| `rug-band` | the border of a rug | 128 px | 0.5 m | 128 px | a tight twill of wool ribs (1.6 cm) over the carpet pile |
| `leaf` | plant leaves | 128 px | 0.25 m | 128 px | green with mottling, a pale midrib and lateral veins, darker edges; the uv run once across a blade |
| `wood-light` | cabinet bodies and fronts (wardrobes, counters, desks) | 512 px | 1.0 m | 256 px | pale oak veneer made like `wood-furniture`, its grain turned to run up the fronts |

All seventeen together are 28.3 MB of RGBA data (the contract test keeps it under 30 MB) and take about 0.3 s to generate in Node. The viewer generates a texture the first time a material needs it, so a plan that has no stone floor never pays for stone.

## Scale and continuity

Texture coordinates are in metres, not 0 to 1 per face. A 0.6 m tile is 0.6 m wherever it appears, a floor board is 14 cm wide in every room, and a wall of any length shows the same plaster scale.

- Floors, ceilings and the ground use plan metres (`x`, `z`) times the texture scale.
- Walls, door frames, door leaves and stair steps are boxes. Their texture frame is metres along the box's own axes, measured from the plan origin, with the height taken above the floor of the level. So a pattern runs on without a seam along a wall, around the gap of a door or window (the wall is built from several pieces), and over all the steps of one stair.
- A cutaway shortens the wall boxes. Their texture coordinates are recomputed for the shorter box, so the plaster is cut, not squashed, and the height above the floor stays the same.
- Furniture boxes use the furniture's own frame, so a grain runs on across the parts of one piece. Door leaves and stair steps turn their wood a quarter, so a door has a vertical grain and the boards of a stair cross it; so do the cabinet bodies and fronts (`f:body`, `f:soft`), whose grain runs up the fronts.

`tests/viewer/scene.test.mjs` checks all of this without a GPU: the extent of every box face in texture space equals its size in metres times the scale, the floor uv are plan metres, a cutaway keeps the height of the top edge, and swapping the look gives back the same clay materials.

## Soft furnishings and plants (textured look only)

A weave on a plain box still reads as a box. In the textured look the soft pieces get a shape of their own (`viewer/src/soft.js`):

- **Rounded and puffed boxes** (`softBoxGeometry`): the edges are rounded to a radius and the top is raised in the middle like a stuffed cushion. Sofa frames, arms and backs (radius 4 to 7 cm), seat and back cushions, pillows, the duvet, the throw and the rug border are built this way. Only the top face is cut into slices of about 5 cm (the bulge needs vertices in the middle); the other faces are flat apart from their edges. The uv are metres in the furniture frame, like the boxes, so a weave runs on across the parts of one sofa.
- **Scatter cushions**: sofas wider than 1.5 m get two knit cushions leaning on the back.
- **Leaf blades** (`leafGeometry`): a plant is a stem and a spiral of 17 leaf blades, the lower ones wide and drooping, the upper ones upright. Each blade is one shared geometry (1 m long, scaled), and its uv run once across the `leaf` texture.
- **The clay look keeps its boxes and spheres.** Every soft piece has a plain box twin with the same size, and the three spheres of a plant stay. A mesh that exists in one look only carries `pw.look`, and `PlanScene.setMaterials(look)` shows it only in that look. The GLB exporter writes visible meshes only, so a clay export is the same as before and a textured export contains the soft shapes.
- **Props** (textured look only): two books and a small vase with leaves on a coffee table, a linen runner and a vase with leaves on a dining table.
- Leaf materials are double sided (a blade is a single sheet) and tinted a little more green than the clay pastel (`LOOK_COLOR` in `materials.js`); every other material keeps its clay colour.

`tests/viewer/soft.test.mjs` checks the sizes, rounded corners, puff, normals, uv, determinism, the shared leaf geometry and the one-look-only rule without a GPU.

## Colours, relief and light

- **Same colours as clay.** A textured material is tinted by its clay colour divided by the texture's average colour (never above 1), so a model stays close to the colours of its clay version and the texture only adds structure. The cap means a palette colour lighter than the texture average cannot be reached: white bedding, pillows and the inner rug panel come out as the light grey of the fabric and rug textures, and door leaves and stairs are oak on purpose. The test checks the main surfaces (wall, wood floor, tile, furniture wood), not every name. The average of every texture is held at its target by the generator, and a test checks it.
- **Richer than clay where it pays.** The textured look is meant to sell, so a few materials have their own colour there (`LOOK_COLOR` in `materials.js`): walnut furniture (`f:wood`), a taupe sofa with camel scatter cushions and throws, a charcoal rug border, terracotta pots, green leaves. Clay keeps its calm pastel palette.
- **Dark wall caps, stronger sun.** In the textured look every solid wall piece gets a charcoal cap of up to 4 cm while the walls are cut (dollhouse, orbit, top), so the cutaway reads like an architectural drawing; a full height wall (Walk) has none, and the clay look never shows them. The sun is stronger (2.1 against 1.55) and the ambient light weaker (1.4 against 1.85), which gives more contrast between lit and shaded surfaces.
- **Normal maps** give boards, grout, plaster and weave a faint relief. They follow the glTF convention: tangent space, green points to the top of the image, row 0 is the top. three.js reads that convention with a negative `y` normal scale, which is what `materials.js` sets (the exporter then writes the map unchanged). A test pins the sign on the tile map: the grout row is recessed in the normal map (the green channel falls into the groove and rises out of it).
- **Surfaces** differ only in roughness: tile 0.42, wood 0.62, stone 0.72, plaster 0.95, textiles 1.0.
- **Ceilings** get a little emissive light (15 percent of their colour) in the textured look: a ceiling only sees the floor colour of the hemisphere light and would turn muddy brown without it.
- Image based lighting was tried and dropped: at full strength it washed the scene out, and at low strength it changed nothing you could see.

## Determinism

`textures.js` uses an integer hash seeded from the texture key and only `+ - * /`, `floor`, `sqrt`, `abs`, `min` and `max` on floats, so the result should be the same on every engine and platform (not pinned by a hash: the tests only prove two runs in one process agree). `Math.random`, trigonometry, `exp`, `pow`, `log` and `Date` are forbidden, and a test scans the source for them. A second test generates every texture twice and compares SHA-256 hashes of the two runs. A third checks that the tile edge matches the opposite edge as well as neighbouring lines inside the tile do, so there is no seam on either axis.

## GLB export

The textured look exports its colour maps as JPEG (repeating samplers, `TEXCOORD_0` in metres). Normal maps are left out by default because they are large and compress badly; `exportGLB({ normalMaps: true })` adds them as PNG. The clay look embeds no images. Boxes without a texture share one unit box geometry again during the export, so a clay GLB stays as small as it was before textures existed.

Measured on the two examples (exported from the built viewer in headless Chrome):

| File | Look | Size |
| --- | --- | --- |
| `duplex-1` (two levels, 115 m2) | clay | 120 KB |
| `duplex-1` | textured, colour maps only (default) | 1.2 MB |
| `duplex-1` | textured with normal maps (`normalMaps: true`) | 1.8 MB before the soft shapes, not measured since |
| `flat-1` (one level, 48 m2) | textured, colour maps only | 812 KB |

Before the soft shapes were added, the default exports passed the Khronos glTF validator with no errors and no warnings (only "unused object" notes for uv on untextured parts); the exports with the soft shapes have not been run through it yet. With normal maps the validator reports no errors but warns, once per mesh, that a tangent space is generated at runtime: glTF viewers compute it themselves, and results can differ slightly between them.

## Adding a texture

1. Add a key to `TEXTURE_SPECS` in `textures.js` with `size`, `world`, `normalSize`, `mime` and the target average colour `avg`.
2. Write its generator, add it to `GENERATORS`, and give it a strength in `NORMAL_STRENGTH` if it has a normal map. Use only the allowed operations, make every pattern periodic over the tile, and place joints so the tile edge never lies on one.
3. Add it to `CONTRACT` and `MAX_WINDOW_STD` in `tests/viewer/textures.test.mjs`. The same tests then check size, opacity, average colour, determinism, seams, normal vectors, calmness (local contrast) and purity, and the file's total size and time budget (30 MB, 3 s) tells you when to shrink something.
4. Map a material name to it in `materials.js` (`TEXTURED`, roughness and normal strength in `SURFACE`), and add the material to `PALETTE` if it is new, with the colour the clay look should show.
5. Look at it: `node tools/capture.mjs examples/flat-1.plan.json --out shots/` renders both views, and `--views walk --start "x,y,levelId,yawDeg"` puts the camera where you want it.

## Limits

- Textures follow the room's `floor` kind and a few fixed rules. They are not read from your drawing, and the plan format has no fields for wall finishes or colours.
- A 2 m repeat can show in a very large wood room as a faint pattern of darker boards.
- Fabric and carpet shimmer a little from far away; mipmaps and anisotropic filtering keep it in check.
- No tiles on bathroom walls, no skirting boards, no per-room paint.
