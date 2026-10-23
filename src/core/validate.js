// planwalk plan validator (docs/SPEC.md section 5).
// Isomorphic ES module: no Node-only APIs, no DOM, no network.
//   validatePlan(planObjectOrJsonText) -> { ok, errors: Issue[], warnings: Issue[], normalized }
//   Issue = { code, path, id?, message, fix }  (message and fix are written to be pasted back into an AI chat)
// Extra exports for tools: PLAN_SCHEMA, analyzePlan (adds `salvaged`), roomGraph, checkSchema.
import { normalizePlan } from './defaults.js';
import { UNIT_TO_M } from './units.js';
import { polygonArea, pointInPolygon, distancePointToSegment, polygonSelfIntersection, distinctPointCount } from './geom2d.js';

// Embedded copy of schema/plan.v1.schema.json (a test keeps it identical to the file).
export const PLAN_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "planwalk.plan.v1",
  "title": "planwalk plan v1",
  "description": "A floor plan as data: levels with walls, openings, rooms, optional stairs and furniture. 2D plan space: x to the right, y downward (like an image).",
  "type": "object",
  "required": ["version", "levels"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": 1 },
    "name": { "type": "string", "maxLength": 120 },
    "units": { "enum": ["m", "cm", "mm", "ft", "in"], "default": "m" },
    "levels": { "type": "array", "minItems": 1, "maxItems": 12, "items": { "$ref": "#/$defs/level" } },
    "meta": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "source": { "enum": ["image", "pdf", "sketch", "synthetic", "manual"] },
        "scale_note": { "type": "string", "maxLength": 1000 },
        "notes": { "type": "string", "maxLength": 2000 },
        "generator": { "type": "string", "maxLength": 200 }
      }
    }
  },
  "$defs": {
    "point": { "type": "array", "prefixItems": [{ "type": "number" }, { "type": "number" }], "minItems": 2, "maxItems": 2 },
    "id": { "type": "string", "pattern": "^[A-Za-z0-9_.-]{1,40}$" },
    "level": {
      "type": "object",
      "required": ["id", "walls"],
      "additionalProperties": false,
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "name": { "type": "string", "maxLength": 80 },
        "elevation": { "type": "number", "description": "Floor height above ground in plan units. Default: sum of the heights (plus slab) of the levels listed before this one." },
        "height": { "type": "number", "exclusiveMinimum": 0, "description": "Floor to ceiling. Default 2.7 m." },
        "slab": { "type": "number", "minimum": 0, "description": "Floor slab thickness. Default 0.2 m." },
        "walls": { "type": "array", "minItems": 3, "items": { "$ref": "#/$defs/wall" } },
        "openings": { "type": "array", "items": { "$ref": "#/$defs/opening" } },
        "rooms": { "type": "array", "items": { "$ref": "#/$defs/room" } },
        "stairs": { "type": "array", "items": { "$ref": "#/$defs/stair" } },
        "furniture": { "type": "array", "items": { "$ref": "#/$defs/furniture" } }
      }
    },
    "wall": {
      "type": "object",
      "required": ["id", "from", "to"],
      "additionalProperties": false,
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "from": { "$ref": "#/$defs/point" },
        "to": { "$ref": "#/$defs/point" },
        "thickness": { "type": "number", "exclusiveMinimum": 0, "description": "Default by kind: exterior 0.30 m, interior 0.12 m, partition 0.08 m." },
        "kind": { "enum": ["exterior", "interior", "partition"], "default": "interior" },
        "height": { "type": "number", "exclusiveMinimum": 0, "description": "Override of the level height (e.g. a parapet)." }
      }
    },
    "opening": {
      "type": "object",
      "required": ["id", "wall", "type", "offset", "width"],
      "additionalProperties": false,
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "wall": { "$ref": "#/$defs/id" },
        "type": { "enum": ["door", "window", "passage"] },
        "offset": { "type": "number", "minimum": 0, "description": "Distance along the wall, from its 'from' end to the near edge of the opening." },
        "width": { "type": "number", "exclusiveMinimum": 0 },
        "height": { "type": "number", "exclusiveMinimum": 0, "description": "Defaults: door 2.05 m, window 1.2 m, passage 2.1 m." },
        "sill": { "type": "number", "minimum": 0, "description": "Height of the lower edge. Defaults: window 0.9 m, door and passage 0." },
        "hinge": { "enum": ["start", "end"], "default": "start", "description": "Doors only: which end of the opening carries the hinge (start = near the wall's 'from' end)." },
        "opens_to": { "enum": ["left", "right"], "default": "left", "description": "Doors only: side of the wall the leaf swings toward, looking from 'from' to 'to' on the plan seen from above (y down)." }
      }
    },
    "room": {
      "type": "object",
      "required": ["id", "polygon"],
      "additionalProperties": false,
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "name": { "type": "string", "maxLength": 80 },
        "polygon": { "type": "array", "minItems": 3, "items": { "$ref": "#/$defs/point" }, "description": "Vertices along the wall centerlines, closed implicitly, any orientation." },
        "use": { "enum": ["living", "bedroom", "kitchen", "bathroom", "hall", "balcony", "storage", "office", "dining", "other"] },
        "floor": { "enum": ["wood", "tile", "carpet", "stone", "concrete", "none"], "default": "wood" },
        "ceiling": { "type": "boolean", "default": true },
        "area": { "type": "number", "exclusiveMinimum": 0, "description": "Declared area in plan units squared (for cross-checking against the polygon)." }
      }
    },
    "stair": {
      "type": "object",
      "required": ["id", "from", "to", "width", "steps"],
      "additionalProperties": false,
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "from": { "$ref": "#/$defs/point", "description": "Centre of the step line at this level's floor (the lowest step line when the stair goes up)." },
        "to": { "$ref": "#/$defs/point", "description": "Centre of the step line at the far end (the highest step line when the stair goes up)." },
        "width": { "type": "number", "exclusiveMinimum": 0 },
        "steps": { "type": "integer", "minimum": 2, "maximum": 40 },
        "to_level": { "$ref": "#/$defs/id", "description": "Level the far end of the stair reaches. Omit it when the stair leads to a floor that is not part of this plan (a drawing of one floor): the stair is then drawn as steps that connect to nothing." },
        "rise": { "type": "number", "description": "Only without to_level: height from the first to the last step line, in plan units; negative when the stair goes down from this level. Not 0. Default: the level height plus the slab, upward." }
      }
    },
    "furniture": {
      "type": "object",
      "required": ["id", "type", "center"],
      "additionalProperties": false,
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "type": { "enum": ["bed-double", "bed-single", "sofa", "armchair", "table-dining", "table-coffee", "chair", "desk", "wardrobe", "kitchen-counter", "fridge", "stove", "sink", "bathtub", "shower", "toilet", "basin", "tv-unit", "bookshelf", "plant", "rug"] },
        "center": { "$ref": "#/$defs/point" },
        "size": { "type": "array", "prefixItems": [{ "type": "number", "exclusiveMinimum": 0 }, { "type": "number", "exclusiveMinimum": 0 }], "minItems": 2, "maxItems": 2, "description": "[width along local x, depth along local y]. Defaults by type." },
        "rotation": { "type": "number", "default": 0, "description": "Degrees, clockwise on the plan seen from above." },
        "height": { "type": "number", "exclusiveMinimum": 0 }
      }
    }
  }
};

const ID_PATTERN = PLAN_SCHEMA.$defs.id.pattern;
const ID_RULE = 'letters, digits, "_", "-" and "."';

// ---------------------------------------------------------------------------------------------
// Minimal JSON Schema validator (the subset used by PLAN_SCHEMA)
// ---------------------------------------------------------------------------------------------
const IGNORED_KEYWORDS = ['$schema', '$id', '$defs', 'title', 'description', 'default'];
export const SUPPORTED_KEYWORDS = new Set([
  ...IGNORED_KEYWORDS, '$ref', 'type', 'enum', 'const', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'minLength', 'maxLength', 'required', 'properties', 'additionalProperties', 'prefixItems', 'items', 'minItems', 'maxItems',
]);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const r3 = (x) => (Number.isFinite(x) ? Number(x.toFixed(3)) : x);

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref "${ref}"`);
  let node = root;
  for (const part of ref.slice(2).split('/')) node = node[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  return node;
}

function typeOk(v, t) {
  switch (t) {
    case 'integer': return typeof v === 'number' && (Number.isInteger(v) || !Number.isFinite(v));
    case 'number': return typeof v === 'number';
    case 'object': return isObj(v);
    case 'array': return Array.isArray(v);
    case 'null': return v === null;
    default: return typeof v === t;
  }
}

const article = (t) => (t === 'array' || t === 'object' || t === 'integer' ? `an ${t}` : `a ${t}`);

function describeValue(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `an array of ${v.length} items`;
  if (isObj(v)) return 'an object';
  if (typeof v === 'string') return `the string ${JSON.stringify(v.length > 40 ? `${v.slice(0, 37)}...` : v)}`;
  return `${typeof v === 'number' ? 'the number' : 'the value'} ${String(v)}`;
}

function formatPath(segs) {
  let s = '';
  for (const seg of segs) {
    if (typeof seg === 'number') s += `[${seg}]`;
    else if (/^[A-Za-z_$][\w$]*$/.test(seg)) s += s ? `.${seg}` : seg;
    else s += `[${JSON.stringify(seg)}]`;
  }
  return s;
}

const jsonPointer = (segs) => `/${segs.map((s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`.replace(/\/$/, '') || '/';

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

// Closest candidate to `word` when it is plausibly a typo, else null.
function closest(word, candidates) {
  const w = String(word).toLowerCase();
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const d = editDistance(w, String(c).toLowerCase());
    if (d < bestD) { bestD = d; best = c; }
  }
  return best !== null && bestD <= Math.max(2, Math.floor(w.length / 3)) ? best : null;
}

function schemaHint(s, root) {
  let node = s;
  if (node.$ref) node = { ...resolveRef(node.$ref, root), ...node };
  if (node.enum) return `one of ${node.enum.map((e) => JSON.stringify(e)).join(', ')}`;
  if (node.const !== undefined) return JSON.stringify(node.const);
  if (node.type === 'array' && node.prefixItems && node.prefixItems.length === 2) return 'a [x, y] pair of numbers';
  if (node.type === 'array') return 'an array';
  if (node.pattern === ID_PATTERN) return `a string id (${ID_RULE}, 1 to 40 characters)`;
  if (node.type) return article(Array.isArray(node.type) ? node.type[0] : node.type);
  return 'a valid value';
}

// Collects violations as { segs, rule, detail, fix }. Never throws on bad data.
export function checkSchema(value, schema, root = schema, segs = [], out = []) {
  const push = (rule, detail, fix, at = segs) => out.push({ segs: at.slice(), rule, detail, fix });
  const where = segs.length ? formatPath(segs) : 'the plan';
  if (schema.$ref) checkSchema(value, resolveRef(schema.$ref, root), root, segs, out);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(value, t))) {
      push('type', `${where} must be ${types.map(article).join(' or ')} but is ${describeValue(value)}`, `Replace the value at ${where} with ${schemaHint(schema, root)}.`);
      return out;
    }
  }
  if ('const' in schema && value !== schema.const) {
    push('const', `${where} must be ${JSON.stringify(schema.const)} but is ${describeValue(value)}`, `Set ${where} to ${JSON.stringify(schema.const)}.`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    const near = typeof value === 'string' ? closest(value, schema.enum.filter((e) => typeof e === 'string')) : null;
    push('enum', `${where} is ${describeValue(value)} but must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`,
      `Use one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}${near ? ` (closest: ${JSON.stringify(near)})` : ''} at ${where}.`);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const lim = (rule, bad, text, hint) => bad && push(rule, `${where} is ${value} but must be ${text}`, `Use a value ${hint} at ${where}.`);
    if (schema.minimum !== undefined) lim('minimum', value < schema.minimum, `at least ${schema.minimum}`, `of at least ${schema.minimum}`);
    if (schema.maximum !== undefined) lim('maximum', value > schema.maximum, `at most ${schema.maximum}`, `of at most ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined) lim('exclusiveMinimum', value <= schema.exclusiveMinimum, `greater than ${schema.exclusiveMinimum}`, `greater than ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined) lim('exclusiveMaximum', value >= schema.exclusiveMaximum, `less than ${schema.exclusiveMaximum}`, `less than ${schema.exclusiveMaximum}`);
  }
  if (typeof value === 'string') {
    const n = [...value].length;
    if (schema.minLength !== undefined && n < schema.minLength) push('minLength', `${where} has ${n} characters but needs at least ${schema.minLength}`, `Make the text at ${where} at least ${schema.minLength} characters long.`);
    if (schema.maxLength !== undefined && n > schema.maxLength) push('maxLength', `${where} has ${n} characters but allows at most ${schema.maxLength}`, `Shorten the text at ${where} to ${schema.maxLength} characters or fewer.`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      const isId = schema.pattern === ID_PATTERN;
      push('pattern', isId ? `${where} is ${JSON.stringify(value)} but ids may only contain ${ID_RULE} (1 to 40 characters)` : `${where} is ${JSON.stringify(value)} which does not match the pattern ${schema.pattern}`,
        isId ? `Rename ${JSON.stringify(value)} to something like ${JSON.stringify(value.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'id1')} (update every reference to it).` : `Change the text at ${where} to match ${schema.pattern}.`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) push('minItems', `${where} has ${value.length} items but needs at least ${schema.minItems}`, `Add items so that ${where} has at least ${schema.minItems}.`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) push('maxItems', `${where} has ${value.length} items but allows at most ${schema.maxItems}`, `Remove items so that ${where} has at most ${schema.maxItems}.`);
    const prefix = schema.prefixItems || [];
    for (let i = 0; i < Math.min(prefix.length, value.length); i++) checkSchema(value[i], prefix[i], root, [...segs, i], out);
    if (schema.items) for (let i = prefix.length; i < value.length; i++) checkSchema(value[i], schema.items, root, [...segs, i], out);
  }
  if (isObj(value)) {
    const props = schema.properties || {};
    for (const k of schema.required || []) {
      if (!(k in value)) {
        const near = Object.keys(value).find((key) => !(key in props) && closest(key, [k]));
        push('required', `${where} is missing the required property ${JSON.stringify(k)}${near ? ` (found ${JSON.stringify(near)}, probably a typo)` : ''}`,
          `Add ${JSON.stringify(k)} (${props[k] ? schemaHint(props[k], root) : 'a value'}) to ${where}${near ? ` or rename ${JSON.stringify(near)} to ${JSON.stringify(k)}` : ''}.`);
      }
    }
    for (const k of Object.keys(value)) {
      if (k in props) checkSchema(value[k], props[k], root, [...segs, k], out);
      else if (schema.additionalProperties === false) {
        const near = closest(k, Object.keys(props));
        push('additionalProperties', `${where} has the unknown property ${JSON.stringify(k)}${near ? ` (did you mean ${JSON.stringify(near)}?)` : ''}`,
          `${near ? `Rename ${JSON.stringify(k)} to ${JSON.stringify(near)} or delete it` : `Delete ${JSON.stringify(k)}`} in ${where}. Allowed properties: ${Object.keys(props).join(', ')}.`);
      } else if (isObj(schema.additionalProperties)) checkSchema(value[k], schema.additionalProperties, root, [...segs, k], out);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Helpers for the semantic checks
// ---------------------------------------------------------------------------------------------
const TOL = 0.001; // 1 mm, in metres
const ENTITY_ARRAYS = ['walls', 'openings', 'rooms', 'stairs', 'furniture'];
const COSMETIC_KEYS = new Set(['name', 'use', 'floor', 'ceiling', 'area', 'hinge', 'opens_to', 'kind']);
const FATAL_RULES = new Set(['type', 'required', 'const', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems']);

function scanNonFinite(v, segs, out, seen) {
  if (typeof v === 'number') { if (!Number.isFinite(v)) out.push({ segs: segs.slice(), value: v }); return; }
  if (v === null || typeof v !== 'object' || seen.has(v) || segs.length > 12) return;
  seen.add(v);
  if (Array.isArray(v)) v.forEach((x, i) => scanNonFinite(x, [...segs, i], out, seen));
  else for (const k of Object.keys(v)) scanNonFinite(v[k], [...segs, k], out, seen);
}

function entityIdAt(plan, segs) {
  let node = plan, id;
  for (const seg of segs) {
    node = node === null || typeof node !== 'object' ? undefined : node[seg];
    if (isObj(node) && typeof node.id === 'string') id = node.id;
  }
  return id;
}

function suggestUnits(rawW, rawH, current) {
  let best = null, bestScore = Infinity;
  for (const u of ['m', 'cm', 'mm', 'ft', 'in']) {
    if (u === current) continue;
    const d = Math.max(rawW, rawH) * UNIT_TO_M[u];
    if (d < 2 || d > 200) continue;
    const score = Math.abs(Math.log10(d / 10));
    if (score < bestScore - 1e-9) { bestScore = score; best = { unit: u, w: rawW * UNIT_TO_M[u], h: rawH * UNIT_TO_M[u] }; }
  }
  return best;
}

function bboxOf(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { minX, minY, maxX, maxY };
}

// Overlap area of two simple polygons by cell-centre sampling (accurate enough for the 5% rule).
function overlapArea(A, B, areaA, areaB) {
  const a = bboxOf(A), b = bboxOf(B);
  const x0 = Math.max(a.minX, b.minX), x1 = Math.min(a.maxX, b.maxX), y0 = Math.max(a.minY, b.minY), y1 = Math.min(a.maxY, b.maxY);
  if (x1 - x0 <= 1e-9 || y1 - y0 <= 1e-9) return 0;
  let step = Math.min(0.1, Math.max(0.01, Math.sqrt(Math.min(areaA, areaB) / 4000)));
  while (((x1 - x0) / step) * ((y1 - y0) / step) > 250000) step *= 1.5;
  const nx = Math.max(1, Math.ceil((x1 - x0) / step)), ny = Math.max(1, Math.ceil((y1 - y0) / step));
  const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny;
  let count = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const p = [x0 + (i + 0.5) * dx, y0 + (j + 0.5) * dy];
      if (pointInPolygon(p, A) && pointInPolygon(p, B)) count++;
    }
  }
  return count * dx * dy;
}

function distToPolygonBoundary(p, poly) {
  let best = { dist: Infinity, closest: poly[0] };
  for (let i = 0; i < poly.length; i++) {
    const r = distancePointToSegment(p, poly[i], poly[(i + 1) % poly.length]);
    if (r.dist < best.dist) best = r;
  }
  return best;
}

// Tolerances of the semantic checks (fractions of an area, or metres).
const AREA_TOL = 0.05; // W102: declared area against the polygon along the wall centerlines
const NET_AREA_TOL = 0.1; // W102: against the polygon net of the walls (printed areas are net and wall thickness is only read off the drawing)
const GAP_MAX = 0.5; // W106: a free wall end this close to another wall is probably a corner that was meant to close
const OPEN_MIN = 0.7; // roomGraph: shared boundary without a wall that counts as an opening between two rooms
const wallReach = (w) => w.thickness + 0.02; // a point this close to a wall centerline counts as on that wall (W101, net areas, open edges)

// Mean half thickness of the wall that runs along each edge of a room polygon (0 where no wall does: an open edge).
function edgeInsets(poly, walls) {
  return poly.map((p0, i) => {
    const p1 = poly[(i + 1) % poly.length];
    const el = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (el < 1e-9) return 0;
    const ux = (p1[0] - p0[0]) / el, uy = (p1[1] - p0[1]) / el;
    const steps = Math.min(200, Math.max(2, Math.ceil(el / 0.05)));
    let sum = 0;
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const q = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
      let best = null;
      for (const w of walls) {
        if (Math.abs(ux * w.dir[1] - uy * w.dir[0]) > 0.17) continue; // not along the edge (more than about 10 degrees)
        const r = distancePointToSegment(q, w.from, w.to);
        if (r.dist <= wallReach(w) && (!best || r.dist < best.dist)) best = { dist: r.dist, half: w.thickness / 2 };
      }
      if (best) sum += best.half;
    }
    return sum / steps;
  });
}

// Area of a room polygon net of its walls: an edge that runs along a wall moves inward by half that wall's thickness,
// an open edge stays. Printed room areas are net, polygons run along the wall centerlines. Where the moved polygon
// degenerates (a room thinner than its walls) a first-order estimate is returned; null only for an empty polygon.
export function netArea(polygon, walls) {
  const poly = polygon.filter((p, i) => { const q = polygon[(i + polygon.length - 1) % polygon.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9; });
  const n = poly.length;
  const signed = polygonArea(poly);
  const centre = Math.abs(signed);
  if (n < 3 || centre < 1e-9) return null;
  const d = edgeInsets(poly, walls);
  if (d.every((x) => x < 1e-9)) return centre;
  const side = signed > 0 ? 1 : -1;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const el = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const ux = (q[0] - p[0]) / el, uy = (q[1] - p[1]) / el;
    const nx = -uy * side, ny = ux * side;
    return { ux, uy, nx, ny, d: d[i], el, px: p[0] + nx * d[i], py: p[1] + ny * d[i] };
  });
  const inner = [];
  for (let j = 0; j < n; j++) {
    const a = lines[(j + n - 1) % n], b = lines[j];
    const den = a.ux * b.uy - a.uy * b.ux;
    if (Math.abs(den) < 0.05) inner.push([poly[j][0] + a.nx * a.d, poly[j][1] + a.ny * a.d], [poly[j][0] + b.nx * b.d, poly[j][1] + b.ny * b.d]); // straight on (under 3 degrees): keep both offsets, no spike
    else {
      const t = ((b.px - a.px) * b.uy - (b.py - a.py) * b.ux) / den;
      inner.push([a.px + a.ux * t, a.py + a.uy * t]);
    }
  }
  const innerSigned = polygonArea(inner);
  const net = Math.abs(innerSigned);
  if (net > 0 && net <= centre + 1e-9 && innerSigned * signed > 0 && !polygonSelfIntersection(inner)) return net;
  return Math.max(0, centre - lines.reduce((sum, l) => sum + l.el * l.d, 0));
}

// Points along a room boundary that no wall runs along: [{ q, w }] where w is the boundary length the sample stands for.
function unwalledSamples(poly, walls, step = 0.1) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i], p1 = poly[(i + 1) % poly.length];
    const el = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (el < 1e-9) continue;
    const n = Math.max(1, Math.ceil(el / step)), w = el / n;
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const q = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
      if (!walls.some((k) => distancePointToSegment(q, k.from, k.to).dist <= wallReach(k))) out.push({ q, w });
    }
  }
  return out;
}

// Room adjacency through doors and passages, stair links, and entrance rooms (rooms behind an exterior door, or around the
// top of a stair that comes up from a floor that is not in the plan).
// With { open: true } rooms that share at least OPEN_MIN metres of boundary with no wall along it (open plan) are linked too
// (via "open"); the benchmark scorer leaves this off so that its connectivity metric keeps counting doors and passages only.
// Works on a normalized plan (metres). Returns { edges: [{ a: {l, r}, b: {l, r}, via, opening? }], entrances: [{ l, r, opening }] }.
export function roomGraph(norm, { open = false } = {}) {
  const edges = [], entrances = [];
  norm.levels.forEach((L, l) => {
    const wallById = new Map(L.walls.map((w) => [w.id, w]));
    const roomAt = (p) => L.rooms.findIndex((room) => room.polygon.length >= 3 && pointInPolygon(p, room.polygon));
    L.openings.forEach((o, oi) => {
      if (o.type === 'window') return;
      const w = wallById.get(o.wall);
      if (!w || w.length < 1e-9) return;
      const t = o.offset + o.width / 2;
      const c = [w.from[0] + w.dir[0] * t, w.from[1] + w.dir[1] * t];
      const n = [-w.dir[1], w.dir[0]];
      const d = w.thickness / 2 + 0.1;
      const a = roomAt([c[0] + n[0] * d, c[1] + n[1] * d]);
      const b = roomAt([c[0] - n[0] * d, c[1] - n[1] * d]);
      if (a >= 0 && b >= 0 && a !== b) edges.push({ a: { l, r: a }, b: { l, r: b }, via: o.type, opening: oi });
      else if ((a >= 0) !== (b >= 0) && o.type === 'door' && w.kind === 'exterior') entrances.push({ l, r: a >= 0 ? a : b, opening: oi });
    });
  });
  norm.levels.forEach((L, l) => {
    for (const s of L.stairs) {
      const dl = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
      if (s.to_level === undefined) {
        // A stair that comes up from a floor below that is not in the plan: whoever arrives is in the room around its top.
        if (!(s.rise < 0) || dl < 1e-9) continue;
        for (const k of [0, 0.3, 0.6, 1.0, 1.5]) {
          const q = [s.from[0] - ((s.to[0] - s.from[0]) / dl) * k, s.from[1] - ((s.to[1] - s.from[1]) / dl) * k];
          const r = L.rooms.findIndex((room) => room.polygon.length >= 3 && pointInPolygon(q, room.polygon));
          if (r >= 0) { entrances.push({ l, r, stair: s.id }); break; }
        }
        continue;
      }
      const tl = norm.levels.findIndex((x) => x.id === s.to_level);
      if (tl < 0 || tl === l || dl < 1e-9) continue;
      const dir = [(s.to[0] - s.from[0]) / dl, (s.to[1] - s.from[1]) / dl];
      const find = (lev, p, sign) => {
        for (const k of [0, 0.3, 0.6, 1.0, 1.5]) {
          const q = [p[0] + sign * dir[0] * k, p[1] + sign * dir[1] * k];
          const r = norm.levels[lev].rooms.findIndex((room) => room.polygon.length >= 3 && pointInPolygon(q, room.polygon));
          if (r >= 0) return r;
        }
        return -1;
      };
      const rb = find(l, s.from, -1), rt = find(tl, s.to, 1);
      if (rb >= 0 && rt >= 0) edges.push({ a: { l, r: rb }, b: { l: tl, r: rt }, via: 'stairs' });
    }
  });
  if (open) {
    norm.levels.forEach((L, l) => {
      const walls = L.walls.filter((w) => w.length > 1e-9);
      const usable = L.rooms.map((room, r) => ({ r, poly: room.polygon })).filter(({ poly }) => poly.length >= 3 && distinctPointCount(poly) >= 3 && !polygonSelfIntersection(poly));
      const loose = usable.map(({ poly }) => unwalledSamples(poly, walls));
      for (let x = 0; x < usable.length; x++) {
        for (let y = x + 1; y < usable.length; y++) {
          let shared = 0;
          for (const s of loose[x]) if (distToPolygonBoundary(s.q, usable[y].poly).dist <= 0.15) shared += s.w;
          if (shared >= OPEN_MIN) edges.push({ a: { l, r: usable[x].r }, b: { l, r: usable[y].r }, via: 'open' });
        }
      }
    });
  }
  return { edges, entrances };
}

// ---------------------------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------------------------
function parseText(text) {
  try {
    return { value: JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    const pos = /position (\d+)/.exec(msg);
    let where = '';
    if (pos && !/line \d+/.test(msg)) {
      const upTo = text.slice(0, Number(pos[1]));
      const line = upTo.split('\n').length, col = upTo.length - upTo.lastIndexOf('\n');
      where = ` (line ${line}, column ${col})`;
    }
    const hints = [];
    if (/^\s*```/.test(text) || /```\s*$/.test(text)) hints.push('remove the markdown code fence lines (```)');
    if (/\b(NaN|Infinity)\b/.test(text)) hints.push('JSON has no NaN or Infinity, use a real number');
    return { error: { msg, where, hints } };
  }
}

export function analyzePlan(input) {
  const errors = [], warnings = [];
  const add = (code, path, id, message, fix) => {
    const issue = { code, path };
    if (id !== undefined && id !== null) issue.id = String(id);
    issue.message = message;
    issue.fix = fix;
    (code[0] === 'E' ? errors : warnings).push(issue);
  };
  const result = (normalized, salvaged = null, dropped = 0) => ({ ok: errors.length === 0, errors, warnings, normalized, salvaged, dropped });

  let plan = input;
  if (typeof input === 'string') {
    const parsed = parseText(input);
    if (parsed.error) {
      add('E001', '', undefined, `the text is not valid JSON: ${parsed.error.msg}${parsed.error.where}`,
        `Reply with one valid JSON object only: double quotes around every key and string, no comments, no trailing commas${parsed.error.hints.length ? `, and ${parsed.error.hints.join(', and ')}` : ''}.`);
      return result(null);
    }
    plan = parsed.value;
  }
  if (!isObj(plan)) {
    const what = plan === undefined ? 'undefined' : Array.isArray(plan) ? 'an array' : plan === null ? 'null' : `${typeof plan} ${String(plan).slice(0, 30)}`;
    add('E001', '', undefined, `the plan must be a JSON object but is ${what}`,
      'Return a single JSON object like {"version": 1, "levels": [{"id": "L0", "walls": [...]}]}. If the levels are in an array at the top, wrap that array in "levels".');
    return result(null);
  }

  // E010 and E002: structure
  const nonFinite = [];
  scanNonFinite(plan, [], nonFinite, new Set());
  const viol = checkSchema(plan, PLAN_SCHEMA);
  const MAX_E002 = 40;
  viol.slice(0, MAX_E002).forEach((v) => {
    add('E002', formatPath(v.segs), entityIdAt(plan, v.segs), `schema violation: ${v.detail} (JSON pointer ${jsonPointer(v.segs)}, rule "${v.rule}")`, v.fix);
  });
  if (viol.length > MAX_E002) {
    add('E002', '', undefined, `${viol.length - MAX_E002} more schema violations are not listed (only the first ${MAX_E002} are shown)`, 'Fix the listed problems first, then validate again.');
  }
  nonFinite.slice(0, 20).forEach((n) => {
    add('E010', formatPath(n.segs), entityIdAt(plan, n.segs), `${formatPath(n.segs)} is ${String(n.value)}, which is not a finite number`,
      `Replace the value at ${formatPath(n.segs)} with a real number (measure it from the drawing or estimate it).`);
  });

  // Which parts of the plan are structurally unusable for geometry checks
  const bad = { levels: new Set(), ents: new Set(), noLevels: false, units: false };
  const markBad = (segs, rule) => {
    if (segs[0] === 'units') { bad.units = true; return; }
    if (segs[0] !== 'levels') return;
    if (segs.length === 1) { if (rule === 'type' || rule === 'minItems') bad.noLevels = true; return; }
    const li = segs[1];
    if (typeof li !== 'number') return;
    if (COSMETIC_KEYS.has(segs[segs.length - 1])) return;
    if (segs.length >= 4 && ENTITY_ARRAYS.includes(segs[2]) && typeof segs[3] === 'number') { bad.ents.add(`${li}.${segs[2]}.${segs[3]}`); return; }
    if (segs.length === 3 && ENTITY_ARRAYS.includes(segs[2])) { if (rule === 'type') bad.levels.add(li); return; }
    bad.levels.add(li);
  };
  for (const v of viol) if (FATAL_RULES.has(v.rule)) markBad(v.segs, v.rule);
  for (const n of nonFinite) markBad(n.segs, 'type');

  // Pruned plan that normalizePlan can digest, with index maps back to the original arrays
  let model = null;
  if (!bad.noLevels && Array.isArray(plan.levels)) {
    const pruned = { version: 1, name: '', units: !bad.units && Object.hasOwn(UNIT_TO_M, plan.units ?? 'm') ? (plan.units ?? 'm') : 'm', meta: {}, levels: [] };
    const map = [];
    const drop = { wallIds: new Map(), incomplete: new Set(), levelsDropped: false };
    plan.levels.forEach((lv, li) => {
      if (!isObj(lv) || bad.levels.has(li)) { drop.levelsDropped = true; return; }
      const copy = { id: lv.id, name: lv.name, elevation: lv.elevation, height: lv.height, slab: lv.slab };
      const idx = {};
      for (const key of ENTITY_ARRAYS) {
        copy[key] = []; idx[key] = [];
        (Array.isArray(lv[key]) ? lv[key] : []).forEach((e, j) => {
          if (!isObj(e) || bad.ents.has(`${li}.${key}.${j}`)) {
            if (key === 'walls' || key === 'openings') drop.incomplete.add(li);
            if (key === 'walls' && isObj(e) && typeof e.id === 'string') drop.wallIds.set(li, (drop.wallIds.get(li) || new Set()).add(e.id));
            return;
          }
          copy[key].push(e); idx[key].push(j);
        });
      }
      pruned.levels.push(copy); map.push({ li, idx });
    });
    try {
      model = { norm: normalizePlan(pruned), map, drop };
    } catch (e) {
      add('E001', '', undefined, `the plan could not be interpreted: ${String(e && e.message ? e.message : e)}`, 'Check that the plan follows docs/SPEC.md section 2.');
    }
  }
  const dropped = Array.isArray(plan.levels) ? plan.levels.length - (model ? model.map.length : 0) + (model ? model.norm.levels.reduce((s, _L, k) => s + ENTITY_ARRAYS.reduce((t, key) => t + ((Array.isArray(plan.levels[model.map[k].li][key]) ? plan.levels[model.map[k].li][key].length : 0) - model.map[k].idx[key].length), 0), 0) : 0) : 0;
  const structural = errors.some((e) => e.code === 'E001' || e.code === 'E010');
  const finish = () => {
    let normalized = null;
    if (!structural && dropped === 0 && !bad.noLevels && Array.isArray(plan.levels)) {
      try { normalized = normalizePlan(plan); } catch { normalized = null; }
    }
    return result(normalized, model ? model.norm : null, dropped);
  };
  if (!model) return finish();

  semanticChecks(plan, model, add, errors);
  return finish();
}

function semanticChecks(plan, model, add, errors) {
  const norm = model.norm;
  const unit = norm.sourceUnits;
  const f = UNIT_TO_M[unit];
  const len = (m) => `${r3(m / f)} ${unit}`;
  const areaTxt = (m2) => `${r3(m2 / (f * f))} ${unit}2`;
  const pt = (p) => `(${r3(p[0] / f)}, ${r3(p[1] / f)})`;
  const pathOf = (l, key, j) => `levels[${model.map[l].li}].${key}[${model.map[l].idx[key][j]}]`;
  const levelPath = (l) => `levels[${model.map[l].li}]`;
  const levelLabel = (l) => `level "${norm.levels[l].id}"`;
  const listIds = (items, max = 12) => `${items.slice(0, max).map((x) => `"${x}"`).join(', ')}${items.length > max ? `, ... (${items.length} in total)` : ''}`;

  const drop = model.drop;
  const incomplete = (l) => drop.levelsDropped || drop.incomplete.has(model.map[l].li);
  const anyIncomplete = drop.levelsDropped || drop.incomplete.size > 0;
  const pct = (x) => `${Math.round(x * 1000) / 10}%`;

  // E011 implausible scale (reported first: it usually explains many other messages)
  let scaleBroken = false;
  const walledLevels = norm.levels.filter((L) => L.walls.length);
  if (walledLevels.length) {
    const b = norm.bounds;
    const maxDim = Math.max(b.width, b.height);
    if (maxDim < 2 || maxDim > 200) {
      scaleBroken = true;
      const sug = suggestUnits(b.width / f, b.height / f, unit);
      add('E011', '', undefined,
        `the walls span only ${r3(b.width)} x ${r3(b.height)} m in total (${r3(b.width / f)} x ${r3(b.height / f)} ${unit} in the file) which is ${maxDim < 2 ? 'smaller than a closet' : 'bigger than a small town'}; "units" is ${JSON.stringify(unit)}`,
        `Fix this first: checks that depend on absolute size (wall thickness, room areas, door widths) are skipped until the scale is plausible. ${sug
          ? `The numbers look like "${sug.unit}": set "units": "${sug.unit}" (the plan would then measure ${r3(sug.w)} x ${r3(sug.h)} m). Otherwise rescale every coordinate, thickness and size.`
          : 'Flats are usually 3 to 30 m across: choose "units" so that the walls match real sizes, or rescale every coordinate, thickness and size.'}`);
    }
  }

  // E003 duplicate ids
  const seenLevel = new Map();
  (plan.levels || []).forEach((lv, li) => {
    if (!isObj(lv) || typeof lv.id !== 'string') return;
    if (seenLevel.has(lv.id)) add('E003', `levels[${li}]`, lv.id, `level id ${JSON.stringify(lv.id)} is already used by levels[${seenLevel.get(lv.id)}]`, `Give this level a unique id (for example "${lv.id}-2"); level ids must be unique across the whole plan.`);
    else seenLevel.set(lv.id, li);
  });
  norm.levels.forEach((L, l) => {
    for (const key of ENTITY_ARRAYS) {
      const seen = new Map();
      L[key].forEach((e, j) => {
        if (typeof e.id !== 'string') return;
        if (seen.has(e.id)) {
          add('E003', pathOf(l, key, j), e.id, `${key.replace(/s$/, '')} id ${JSON.stringify(e.id)} appears twice on ${levelLabel(l)} (also at ${pathOf(l, key, seen.get(e.id))})`,
            `Rename one of them to a unique id on this level (for example "${e.id}-2")${key === 'walls' ? ' and update every opening whose "wall" refers to it' : ''}.`);
        } else seen.set(e.id, j);
      });
    }
  });

  // Per level checks
  let unresolvedDoor = false;
  const badRoom = new Set(); // `${l}:${j}` of rooms whose polygon is unusable (E008)
  norm.levels.forEach((L, l) => {
    const wallIdx = new Map();
    L.walls.forEach((w, j) => { if (!wallIdx.has(w.id)) wallIdx.set(w.id, j); });

    // E004 walls
    L.walls.forEach((w, j) => {
      if (w.length < 1e-9) {
        add('E004', pathOf(l, 'walls', j), w.id, `wall has zero length: both ends are at ${pt(w.from)}`,
          `Delete wall "${w.id}" or move its "to" point away from ${pt(w.from)} so that it runs along a real wall.`);
      } else if (w.length < w.thickness - 1e-9 && !scaleBroken) {
        add('E004', pathOf(l, 'walls', j), w.id, `wall is ${len(w.length)} long but ${len(w.thickness)} thick (from ${pt(w.from)} to ${pt(w.to)}), so it would be a block, not a wall`,
          `Delete wall "${w.id}" if it is a stray mark, or move its end points at least ${len(w.thickness)} apart. If every wall looks too short, check "units".`);
      }
    });

    // E005 / E006 / E007 openings
    const byWall = new Map();
    L.openings.forEach((o, j) => {
      const w = L.walls[wallIdx.get(o.wall)];
      if (!w) {
        if ((drop.wallIds.get(model.map[l].li) || new Set()).has(o.wall)) { unresolvedDoor = true; return; } // wall already reported as E002/E010
        if (o.type === 'door') unresolvedDoor = true;
        const near = closest(o.wall, L.walls.map((x) => x.id));
        const other = norm.levels.findIndex((X, k) => k !== l && X.walls.some((x) => x.id === o.wall));
        add('E005', pathOf(l, 'openings', j), o.id, `${o.type} refers to wall ${JSON.stringify(o.wall)}, which does not exist on ${levelLabel(l)} (walls here: ${listIds(L.walls.map((x) => x.id))})`,
          other >= 0
            ? `Wall "${o.wall}" exists on ${levelLabel(other)}; an opening must name a wall of its own level. Move the opening to levels[${model.map[other].li}].openings or point it at a wall of this level.`
            : `Set "wall" to the id of the wall that contains this ${o.type}${near ? ` (probably ${JSON.stringify(near)})` : ''}, or add a wall with id "${o.wall}" to this level.`);
        return;
      }
      if (!byWall.has(w.id)) byWall.set(w.id, []);
      byWall.get(w.id).push(j);
      const end = o.offset + o.width;
      if (end > w.length + TOL) {
        const maxOffset = Math.max(0, w.length - o.width);
        add('E006', pathOf(l, 'openings', j), o.id, `${o.type} spans ${len(o.offset)} to ${len(end)} along wall "${w.id}", but that wall is only ${len(w.length)} long (${len(end - w.length)} too far)`,
          o.width > w.length + TOL
            ? `The ${o.type} (${len(o.width)} wide) is wider than wall "${w.id}" (${len(w.length)}). Reduce "width", or place it on a longer wall.`
            : `Set "offset" to at most ${len(maxOffset)} (keeping width ${len(o.width)}), or reduce "width" to at most ${len(w.length - o.offset)}, or move the ${o.type} to a longer wall.`);
      }
      if (o.height > w.height + TOL) {
        add('E007', pathOf(l, 'openings', j), o.id, `${o.type} is ${len(o.height)} tall but wall "${w.id}" is only ${len(w.height)} high`,
          `Reduce "height" to at most ${len(Math.max(0, w.height - o.sill))} (or raise the wall "height" / level "height" if the ceiling really is higher).`);
      } else if (o.sill + o.height > w.height + TOL) {
        add('E007', pathOf(l, 'openings', j), o.id, `${o.type} reaches ${len(o.sill + o.height)} (sill ${len(o.sill)} + height ${len(o.height)}) but wall "${w.id}" is only ${len(w.height)} high`,
          `Lower "sill" or reduce "height" so that sill + height is at most ${len(w.height)}.`);
      }
    });
    for (const [wid, list] of byWall) {
      const w = L.walls[wallIdx.get(wid)];
      const sorted = [...list].sort((a, b) => L.openings[a].offset - L.openings[b].offset || a - b);
      for (let k = 1; k < sorted.length; k++) {
        // compare with every earlier opening that can still overlap (sorted by offset)
        for (let m = k - 1; m >= 0; m--) {
          const A = L.openings[sorted[m]], B = L.openings[sorted[k]];
          const overlap = Math.min(A.offset + A.width, B.offset + B.width) - B.offset;
          if (overlap > TOL) {
            const later = Math.max(sorted[m], sorted[k]);
            const O = L.openings[later], P = L.openings[later === sorted[k] ? sorted[m] : sorted[k]];
            add('E006', pathOf(l, 'openings', later), O.id, `${O.type} overlaps ${P.type} "${P.id}" on wall "${w.id}" by ${len(overlap)} (this one spans ${len(O.offset)} to ${len(O.offset + O.width)}, the other ${len(P.offset)} to ${len(P.offset + P.width)})`,
              `Move one of them: for example set the offset of "${B.id}" to at least ${len(A.offset + A.width)}, or use a different wall. Openings on one wall must not overlap.`);
          }
        }
      }
    }

    // E008 rooms
    L.rooms.forEach((r, j) => {
      const poly = r.polygon;
      if (distinctPointCount(poly) < 3 || polygonSelfIntersection(poly)) badRoom.add(`${l}:${j}`);
      if (distinctPointCount(poly) < 3) {
        add('E008', pathOf(l, 'rooms', j), r.id, `room polygon has only ${distinctPointCount(poly)} distinct point${distinctPointCount(poly) === 1 ? '' : 's'}; a room needs at least 3`,
          `List the corners of room "${r.id}" one after another around the room (for a rectangle: 4 corners). Do not repeat the same point.`);
        return;
      }
      const x = polygonSelfIntersection(poly);
      if (x) {
        add('E008', pathOf(l, 'rooms', j), r.id, `room polygon crosses itself near ${pt(x)}`,
          `Reorder the corners of room "${r.id}" so that they follow the room boundary in order (clockwise or counter-clockwise) without crossing; the edges cross near ${pt(x)}.`);
        return;
      }
      if (r.area < 0.5 && !scaleBroken) {
        add('E008', pathOf(l, 'rooms', j), r.id, `room area is ${areaTxt(r.area)} (${r3(r.area)} m2), below the minimum of 0.5 m2`,
          `Check the corner coordinates of room "${r.id}" (a sliver or a unit mix-up): a real room encloses at least 0.5 m2.`);
      }
    });

    // E009 stairs, E012 degenerate stairs. A stair without "to_level" leaves the plan (a drawing of one floor): it is valid.
    L.stairs.forEach((s, j) => {
      const ids = (plan.levels || []).map((x) => (isObj(x) ? x.id : undefined)).filter((x) => typeof x === 'string');
      const others = ids.filter((x) => x !== L.id);
      const leaves = `If the stair leads to a floor that is not drawn in this plan, delete "to_level": it is then drawn as steps that connect to nothing (add "rise" with a negative number when it goes down from this level).`;
      if (s.to_level === undefined) {
        if (s.rise !== undefined && Math.abs(s.rise) < 0.01) {
          add('E012', pathOf(l, 'stairs', j), s.id, `stair has a "rise" of ${len(s.rise)}, so it climbs nowhere`,
            `Delete "rise" (the default is one storey up) or give the height the stair really climbs, negative when it goes down from this level.`);
        }
      } else if (s.to_level === L.id) {
        add('E009', pathOf(l, 'stairs', j), s.id, `stair leads to its own level ${JSON.stringify(s.to_level)}`,
          others.length ? `Set "to_level" to the id of the level above or below (available: ${listIds(others)}). ${leaves}` : `This plan has no other level. ${leaves}`);
      } else if (!ids.includes(s.to_level)) {
        const near = closest(s.to_level, others);
        add('E009', pathOf(l, 'stairs', j), s.id, `stair leads to level ${JSON.stringify(s.to_level)}, which does not exist (levels: ${listIds(ids)})`,
          others.length ? `Set "to_level" to one of ${listIds(others)}${near ? ` (probably ${JSON.stringify(near)})` : ''}, or add the missing level with its own walls. ${leaves}` : `This plan has only the level "${L.id}", and a stair cannot lead to its own level. ${leaves}`);
      }
      if (Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]) < 0.2) {
        add('E012', pathOf(l, 'stairs', j), s.id, `stair "from" ${pt(s.from)} and "to" ${pt(s.to)} are ${len(Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]))} apart, too close for ${s.steps} steps`,
          `Set "from" to the centre of the step line at this level's floor and "to" to the centre of the step line at the far end (typically ${len(0.25 * (s.steps - 1))} apart for ${s.steps} steps).`);
      }
    });
  });

  // ---- warnings ----
  norm.levels.forEach((L, l) => {
    const walls = L.walls.filter((w) => w.length > 1e-9);

    // W110 level without rooms
    if (L.rooms.length === 0) {
      add('W110', levelPath(l), L.id, `${levelLabel(l)} has no rooms`, `Add a "rooms" entry for every enclosed space on this level: a polygon whose corners lie on the wall centerlines.`);
    }

    // W107 / W102 / W101 / W103 per room
    const valid = [];
    L.rooms.forEach((r, j) => {
      if (distinctPointCount(r.polygon) < 3 || polygonSelfIntersection(r.polygon)) return;
      valid.push(j);
      const a = r.area;
      if ((a < 2 || a > 80) && !scaleBroken) {
        add('W107', pathOf(l, 'rooms', j), r.id, `room "${r.name}" has an area of ${areaTxt(a)} (${r3(a)} m2), outside the plausible 2 to 80 m2`,
          `Check the corner coordinates of room "${r.id}" and the plan "units"; split it into several rooms if it covers more than one space.`);
      }
      // W102: printed areas are net (inside the wall faces) while polygons run along the centerlines, so the declared
      // area has to match one of the two: the centerline polygon within 5%, or the polygon net of its walls within 10%.
      if (r.declaredArea !== undefined && Number.isFinite(r.declaredArea) && r.declaredArea > 0 && a > 0 && Math.abs(r.declaredArea - a) / a > AREA_TOL) {
        const net = walls.length ? netArea(r.polygon, walls) : null;
        const withNet = net !== null && net > 0 && net < a * 0.995;
        if (!withNet || Math.abs(r.declaredArea - net) / net > NET_AREA_TOL) {
          const diff = (withNet ? net : a) - r.declaredArea;
          add('W102', pathOf(l, 'rooms', j), r.id,
            `room "${r.name}" declares an area of ${areaTxt(r.declaredArea)} but its polygon encloses ${areaTxt(a)} along the wall centerlines${withNet ? ` and about ${areaTxt(net)} net of the walls` : ''}, which is ${pct(Math.abs(diff) / r.declaredArea)} ${diff > 0 ? 'more' : 'less'} than declared`,
            `Printed areas are usually net (inside the wall faces) and polygons run along the wall centerlines, so a few percent of difference is normal. A gap this large points at the polygon (a missing split, a corner in the wrong place, a wrong scale) or at the printed number (part of the space may be left out of it, for example under a stair): compare room "${r.id}" with the drawing. Do not stretch a polygon only to reach the number; remove "area" if you are unsure about it.`);
        }
      }
      // W101: sample the perimeter and test the distance to wall centerlines
      if (walls.length && !incomplete(l) && !scaleBroken) {
        let total = 0, unbacked = 0, run = null, bestRun = null;
        const poly = r.polygon;
        for (let i = 0; i < poly.length; i++) {
          const p0 = poly[i], p1 = poly[(i + 1) % poly.length];
          const el = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          if (el < 1e-9) continue;
          const steps = Math.min(400, Math.max(2, Math.ceil(el / 0.05)));
          const seg = el / steps;
          for (let s = 0; s < steps; s++) {
            const t = (s + 0.5) / steps;
            const q = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
            let backed = false;
            for (const w of walls) { if (distancePointToSegment(q, w.from, w.to).dist <= wallReach(w)) { backed = true; break; } }
            total += seg;
            if (!backed) {
              unbacked += seg;
              if (!run) run = { from: q, to: q, len: 0 };
              run.to = q; run.len += seg;
              if (!bestRun || run.len > bestRun.len) bestRun = run;
            } else run = null;
          }
        }
        if (total > 0 && unbacked / total > 0.3) {
          add('W101', pathOf(l, 'rooms', j), r.id, `room "${r.name}" boundary has no wall along ${pct(unbacked / total)} of its perimeter (${len(unbacked)} of ${len(total)}); the longest gap runs from ${pt(bestRun.from)} to ${pt(bestRun.to)}`,
            `Move the corners of room "${r.id}" onto the wall centerlines, or add the missing walls (for example a wall from ${pt(bestRun.from)} to ${pt(bestRun.to)}).`);
        }
      }
    });
    for (let x = 0; x < valid.length; x++) {
      for (let y = x + 1; y < valid.length; y++) {
        const A = L.rooms[valid[x]], B = L.rooms[valid[y]];
        const small = Math.min(A.area, B.area);
        if (small <= 0) continue;
        const ov = overlapArea(A.polygon, B.polygon, A.area, B.area);
        if (ov / small > 0.05) {
          const smaller = A.area <= B.area ? A : B;
          add('W103', pathOf(l, 'rooms', valid[y]), B.id, `rooms "${A.name}" and "${B.name}" overlap by ${areaTxt(ov)} (${r3((ov / small) * 100)}% of the smaller room "${smaller.name}")`,
            `Adjust the corners of "${A.id}" or "${B.id}" so that the two polygons only share an edge along their common wall centerline.`);
        }
      }
    }

    // W104 door widths
    L.openings.forEach((o, j) => {
      if (o.type === 'door' && (o.width < 0.6 - 1e-9 || o.width > 1.2 + 1e-9)) {
        add('W104', pathOf(l, 'openings', j), o.id, `door is ${len(o.width)} wide, outside the usual 0.6 to 1.2 m`,
          `Set "width" to about 0.9 m (${len(0.9)}) for an interior door, or use "type": "passage" for a wide opening without a leaf.`);
      }
    });

    // W106 wall ends that just miss another wall (a corner that was probably meant to close). A free end farther than
    // GAP_MAX from every other wall (a partition that stops at a column, a half wall) is normal and not reported.
    L.walls.forEach((w, j) => {
      if (w.length < 1e-9) return;
      for (const [endName, e] of [['from', w.from], ['to', w.to]]) {
        let best = null;
        for (const o of walls) {
          if (o === w) continue;
          const r = distancePointToSegment(e, o.from, o.to);
          if (!best || r.dist < best.dist) best = { ...r, wall: o };
        }
        if (best && best.dist > Math.max(w.thickness, best.wall.thickness) / 2 + 0.02 && best.dist <= GAP_MAX) {
          add('W106', pathOf(l, 'walls', j), w.id, `the "${endName}" end of the wall at ${pt(e)} just misses wall "${best.wall.id}" (${len(best.dist)} away)`,
            `Move the "${endName}" point of wall "${w.id}" onto the centerline of wall "${best.wall.id}" (for example to ${pt(best.closest)}) so the corner closes. If the end really is free (a partition that stops at a column), ignore this warning.`);
        }
      }
    });

    // W109 furniture outside rooms
    if (L.rooms.length) {
      L.furniture.forEach((m, j) => {
        if (L.rooms.some((r) => r.polygon.length >= 3 && pointInPolygon(m.center, r.polygon))) return;
        let near = null;
        for (const r of L.rooms) if (r.polygon.length >= 3) { const d = distToPolygonBoundary(m.center, r.polygon); if (!near || d.dist < near.dist) near = { ...d, room: r }; }
        add('W109', pathOf(l, 'furniture', j), m.id, `${m.type} has its centre at ${pt(m.center)}, outside every room of ${levelLabel(l)}${near ? ` (nearest is room "${near.room.id}", ${len(near.dist)} away)` : ''}`,
          near ? `Move "${m.id}" inside room "${near.room.id}" (for example near ${pt(near.closest)}), or delete it.` : `Move "${m.id}" into a room, or delete it.`);
      });
    }
  });

  // W108 no exterior door. Not for a plan that starts above the ground or that has a stair arriving from below (a drawing of
  // an upper floor is entered by the stair, not through a door in an exterior wall).
  const hasExteriorDoor = norm.levels.some((L) => L.openings.some((o) => o.type === 'door' && L.walls.some((w) => w.id === o.wall && w.kind === 'exterior')));
  const aboveGround = norm.levels.length > 0 && Math.min(...norm.levels.map((L) => L.elevation)) > 0.5;
  const arrivesFromBelow = norm.levels.some((L) => L.stairs.some((s) => s.to_level === undefined && s.rise !== undefined && s.rise < 0));
  if (!hasExteriorDoor && !aboveGround && !arrivesFromBelow) {
    const exteriorWalls = norm.levels.reduce((s, L) => s + L.walls.filter((w) => w.kind === 'exterior').length, 0);
    const upper = ' If the drawing is an upper floor that is entered by a stair, do not invent a door: set the level "elevation" (floor height above the ground, for example 3.0) or add the stair that arrives here (a "stairs" entry without "to_level" and with a negative "rise").';
    add('W108', '', undefined, `no door is placed on an exterior wall${exteriorWalls === 0 ? ' (and no wall has "kind": "exterior")' : ''}, so the flat has no entrance`,
      (exteriorWalls === 0
        ? 'Set "kind": "exterior" on the walls of the outer boundary, then add the entrance door on one of them (a "door" opening with that wall id).'
        : 'Add the entrance door: an opening of "type": "door" on one of the exterior walls, inside the entrance room.') + upper);
  }

  // W105 reachability from exterior doors (doors, passages, stairs and open edges between rooms all connect)
  const graph = roomGraph(norm, { open: true });
  if (graph.entrances.length) {
    const key = (n) => `${n.l}:${n.r}`;
    const adj = new Map();
    const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
    for (const e of graph.edges) { link(key(e.a), key(e.b)); link(key(e.b), key(e.a)); }
    const seen = new Set(graph.entrances.map(key));
    const queue = [...seen];
    while (queue.length) for (const nb of adj.get(queue.shift()) || []) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
    norm.levels.forEach((L, l) => {
      L.rooms.forEach((r, j) => {
        if (seen.has(`${l}:${j}`) || r.polygon.length < 3) return;
        // suggest a door towards the neighbour that shares the longest boundary
        let best = null;
        L.rooms.forEach((o, k) => {
          if (k === j || o.polygon.length < 3) return;
          const pts = [];
          for (let i = 0; i < r.polygon.length; i++) {
            const p0 = r.polygon[i], p1 = r.polygon[(i + 1) % r.polygon.length];
            const el = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
            const steps = Math.max(1, Math.ceil(el / 0.1));
            for (let s = 0; s < steps; s++) {
              const t = (s + 0.5) / steps;
              const q = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
              if (distToPolygonBoundary(q, o.polygon).dist <= 0.15) pts.push(q);
            }
          }
          const reach = seen.has(`${l}:${k}`);
          if (pts.length >= 8 && (!best || (reach && !best.reach) || (reach === best.reach && pts.length > best.pts.length))) best = { room: o, pts, reach };
        });
        let fix = `Add a door or passage that connects room "${r.id}" to a room that can be reached from the entrance.`;
        if (best) {
          const mid = best.pts[Math.floor(best.pts.length / 2)];
          let nearest = null;
          for (const w of L.walls) { const d = distancePointToSegment(mid, w.from, w.to); if (w.length > 1e-9 && (!nearest || d.dist < nearest.dist)) nearest = { ...d, wall: w }; }
          if (nearest) {
            const off = Math.max(0.1, Math.min(nearest.wall.length - 1.0, nearest.t * nearest.wall.length - 0.45));
            fix = `Add a door (width ${len(0.9)}) on wall "${nearest.wall.id}" at "offset" about ${len(off)} to connect room "${r.id}" with ${best.reach ? '' : 'its neighbour '}"${best.room.id}"${best.reach ? ' (reachable)' : ''}; or add a passage there if the rooms are open to each other.`;
          }
        }
        add('W105', pathOf(l, 'rooms', j), r.id, `room "${r.name}" cannot be reached from any exterior door through doors, passages or open edges`,
          `${fix} If the room really is open to its neighbour (no wall between them, as in an open-plan kitchen), do not add a door: leave the wall out and let the two polygons share that edge (at least ${len(OPEN_MIN)} of shared edge without a wall counts as a connection).`);
      });
    });
  }
}

export function validatePlan(plan) {
  const { ok, errors, warnings, normalized } = analyzePlan(plan);
  return { ok, errors, warnings, normalized };
}
