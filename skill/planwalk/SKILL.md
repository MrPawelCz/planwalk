---
name: planwalk
license: MIT
description: "Use when the user shares a floor plan (image, PDF, sketch, photo) and wants it as 3D, a dollhouse, a walkthrough or a GLB. Reads the plan into validated JSON and builds a self-contained HTML viewer."
---

# planwalk: floor plan to a walkable 3D model

You read a floor plan, write it as a small JSON file (format in `reference/plan-format.md`), validate it, check the render against the source drawing, and deliver one self-contained HTML file that opens by double click (dollhouse, exploded levels, first-person walk, GLB export). Everything is local: no server, no API keys.

This folder holds the tools (`scripts/`) and the viewer (`assets/`). Below, `<skill-dir>` is the folder that contains this SKILL.md. Node 20 or newer runs `validate` and `embed`; `capture` needs Node 22 and Chrome or Chromium. Nothing needs installing beyond those; `pdftoppm` (step 1, PDF pages) and ffmpeg (`capture --gif` only) are optional.

## Steps

1. **Look at the plan.** If it is a PDF, render the page to PNG first (`pdftoppm -r 150 -png file.pdf page`). Several levels or pages mean several `levels`. Say what you cannot read instead of guessing.
2. **Find the scale before tracing.** In order of reliability: printed lengths or dimension lines (chains of dimensions on CAD sheets are best); printed room areas (they are usually net of the walls, so polygons on the centerlines come out larger, most for small rooms: allow for that, do not squeeze the polygons); a standard door (0.8 to 0.9 m) only as a last resort. Write the source of the scale in `meta.scale_note` (up to 1000 characters). Never pick a scale silently.
3. **Set the frame.** `units: "m"`, origin at the top-left corner of the outer wall (on a cropped sheet, where no outer corner exists: the top-left corner of the walls you trace), x to the right, y downward (like the image).
4. **Trace walls as centerlines**: exterior walls first (`kind: "exterior"`), then interior ones. A wall between two drawn lines (thick wall) is traced on the middle line. Walls that meet must share exact coordinates (no gaps, no overshoot). Ids use letters, digits, `_`, `-` and `.` (1 to 40 characters).
5. **Add openings.** Door: the arc is the swing, the opening is the straight chord. Window: the triple line in an exterior wall. Passage: an opening without a leaf. `offset` is the distance along the wall from its `from` end to the near edge.
6. **Add rooms** as polygons along wall centerlines, with names exactly as printed. Copy printed areas into `area` (it lets the validator cross-check your scale; it accepts the centerline polygon within 5% or the polygon net of its walls within 10%). Rooms that are open to each other (a dashed line, or nothing, between them) get no wall: the two polygons share that edge.
7. **Stairs and furniture only if clearly drawn.** A stair is a `stairs` entry: `from` at this level's floor, `to` at the far end, `width`, `steps`. When the floor it leads to is in the file, set `to_level`. On a drawing of one floor leave `to_level` out: the stair then leaves the plan and is drawn as steps that connect to nothing (`rise` is its height, negative when it goes down from this level). A floor drawn alone above the ground gets its `elevation` (height of its floor above the ground, for example 3.0); that also tells the validator not to ask for an entrance door. Furniture symbols are never walls. Do not decorate a plan that has none.
8. **Validate:** `node <skill-dir>/scripts/validate.mjs plan.json` (add `--json` for a machine-readable list). A `note:` line says what had to be repaired to read the file (a code block taken, a trailing comma removed): save the clean JSON, not the chat answer. Fix every error and read every warning; repeat until there are no errors. The messages are written to be acted on, but a warning that the drawing contradicts (an open-plan edge, a free wall end at a column, a printed area that belongs to a space you cannot see) is not a reason to bend a correct plan: leave it and say so in `meta.notes`.
9. **Compare with the source (do not skip).** Render with `node <skill-dir>/scripts/capture.mjs plan.json --out shots/ --no-panel` (needs Chrome and Node 22; `--no-panel` keeps the issues panel off the pictures), open `shots/top.png` next to the original drawing (the floor textures follow each room's `floor` kind, so a wrong kind shows; `--materials clay` gives plain colours), and check: room count and positions, door and window positions, missing or extra walls, proportions. Fix and re-validate. Look at the images yourself; a file that exists is not a render that is right.
10. **Deliver:** `node <skill-dir>/scripts/embed.mjs plan.json planwalk-<name>.html` writes one HTML file with the plan embedded. Tell the user: what was read, the scale source, anything uncertain, and that the viewer can export GLB.

## Rules

- Be honest about uncertainty: put assumptions in `meta.notes` and in your final message. A wrong confident model is worse than a flagged approximate one.
- Never invent rooms, doors or levels that are not in the drawing. If a region is unreadable, leave it out and say so.
- Not for permits, construction or legal use. It is a visualisation of a drawing.
- Keep user plans private: do not upload them anywhere, the tools work offline.

## Common mistakes

- Dimension lines, grid lines, hatch fills or furniture mistaken for walls.
- Tracing the outer edge of a thick wall instead of its centerline (rooms look too large).
- A door placed at the arc end instead of the opening chord; `offset` measured from the wrong end of the wall.
- Mirrored plans (check against a printed label such as a room name or a stair direction).
- Two storeys drawn on one page without `levels`. A `to_level` that names a floor that is not in the file (leave it out instead).
- Stretching a room polygon to hit the printed area: printed areas are net of the walls, and a free wall end at a column is not a mistake.
- Scale taken from a bar that was resized when the image was exported: cross-check with an area label.

## Files

- `reference/plan-format.md`: the JSON format with a worked example.
- `reference/reading-plans.md`: how to read different drawing styles and photos.
- `scripts/validate.mjs`: the validator, one file without dependencies. Exit code 0 ok, 1 errors, 2 usage; `--json`, `--strict` (also fails on warnings and on repairs, and makes a property the format does not know an error instead of the warning W116). A plan in which only some elements have errors exits 1 and the last line says how many elements the viewer would skip.
- `scripts/capture.mjs`: renders the plan in headless Chrome: one PNG per view (`dollhouse`, `explode`, `top`, `walk`), `--glb FILE` for the 3D model (it carries the textures of the look in force), `--materials clay|textured` for plain colours or procedural textures (textured is the default), `--gif FILE` for a short clip (needs ffmpeg), `--start "x,y,levelId,yawDeg"` for where the walk view begins.
- `scripts/embed.mjs`: writes the single-file viewer with the plan embedded (one file without dependencies, reads the plan as the validator does).
- `assets/planwalk.html`: the viewer, one file with three.js inside, works offline.

`scripts/validate.mjs`, `scripts/embed.mjs`, `scripts/capture.mjs` and `assets/planwalk.html` are generated from the planwalk sources by `npm run build:skill`: do not edit them here.
