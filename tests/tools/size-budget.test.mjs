// Size budget of the shipped viewer: the page is opened from a link on a phone, so its weight matters.
// Sizes are decimal (1 KB = 1000 bytes) and measured on dist/planwalk.html, the larger of the two builds.
// To change the budget, edit the two numbers below in the same commit that explains why the page grew.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_RAW_KB = 900;
const BUDGET_GZIP_KB = 260;

const root = fileURLToPath(new URL('../../', import.meta.url));
const file = join(root, 'dist/planwalk.html');
const kb = (n) => (n / 1000).toFixed(1);

test(`dist/planwalk.html stays within ${BUDGET_RAW_KB} KB raw and ${BUDGET_GZIP_KB} KB gzip`, (t) => {
  assert.ok(existsSync(file), 'dist/planwalk.html is missing: run npm run build');
  const data = readFileSync(file);
  const raw = data.length;
  const gz = gzipSync(data, { level: 9 }).length;
  t.diagnostic(`dist/planwalk.html ${kb(raw)} KB raw (budget ${BUDGET_RAW_KB}), ${kb(gz)} KB gzip (budget ${BUDGET_GZIP_KB})`);
  const how = `Check what grew (a new dependency, an embedded asset). If the growth is worth it, raise BUDGET_RAW_KB / BUDGET_GZIP_KB in tests/tools/size-budget.test.mjs in the same commit and say why.`;
  assert.ok(raw <= BUDGET_RAW_KB * 1000, `dist/planwalk.html is ${kb(raw)} KB raw, the budget is ${BUDGET_RAW_KB} KB. ${how}`);
  assert.ok(gz <= BUDGET_GZIP_KB * 1000, `dist/planwalk.html is ${kb(gz)} KB gzip, the budget is ${BUDGET_GZIP_KB} KB. ${how}`);
});
