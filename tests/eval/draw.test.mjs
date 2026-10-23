import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { drawPlanSvg, STYLES } from '../../eval/draw.mjs';
import { generatePlan, FAMILIES } from '../../eval/gen/gen-plans.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const load = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const count = (s, re) => (s.match(re) ?? []).length;

test('the cad drawing has walls, one door arc per door, a triple line per window, labels and one dimension', () => {
  const plan = load('examples/flat-1.plan.json');
  const svg = drawPlanSvg(plan, { style: 'cad' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.trim().endsWith('</svg>'));
  const l = plan.levels[0];
  assert.equal(count(svg, / A \d/g), l.openings.filter((o) => o.type === 'door').length, 'one swing arc per door');
  assert.ok(count(svg, /<polygon /g) >= l.walls.length, 'every wall is drawn');
  for (const r of l.rooms) {
    assert.ok(svg.includes(`>${r.name}</text>`), `label ${r.name}`);
    assert.ok(svg.includes(`>${r.area.toFixed(1)} m²</text>`), `area of ${r.name}`);
  }
  assert.equal(count(svg, /\d m<\/text>/g), 1, 'exactly one dimension text');
  assert.ok(!svg.includes(plan.name), 'the drawing does not print the plan name');
});

test('a two level plan is captioned and shows its stair as UP and DN', () => {
  const svg = drawPlanSvg(load('examples/duplex-1.plan.json'));
  assert.ok(svg.includes('>Ground floor</text>') && svg.includes('>Upper floor</text>'));
  assert.equal(count(svg, />UP<\/text>/g), 1);
  assert.equal(count(svg, />DN<\/text>/g), 1);
});

test('every generated family draws without error and deterministically', () => {
  for (const f of FAMILIES) {
    const { plan } = generatePlan(FAMILIES.indexOf(f) + 1, f);
    const a = drawPlanSvg(plan), b = drawPlanSvg(plan);
    assert.equal(a, b);
    assert.ok(a.length > 3000, f);
    assert.ok(!/NaN|undefined|Infinity/.test(a), `${f} has an invalid number in its SVG`);
  }
});

test('unknown styles and unusable plans are rejected, the CLI needs its arguments', () => {
  assert.deepEqual(STYLES, ['cad', 'hatched', 'sketch', 'scan']);
  assert.throws(() => drawPlanSvg(load('examples/flat-1.plan.json'), { style: 'watercolour' }));
  assert.throws(() => drawPlanSvg({ nope: true }));
  assert.equal(spawnSync(process.execPath, [`${root}eval/draw.mjs`], { encoding: 'utf8' }).status, 2);
});
