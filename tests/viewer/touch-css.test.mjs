// A touch screen must not reload the page by pulling down on a bar or a sheet, nor zoom it by a quick second tap on a button.
// The page is one fixed screen (nothing scrolls except the sheets), so these rules are the whole of the protection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(join(root, 'viewer/src/main.js'), 'utf8');

test('scrolling never chains to the browser (no pull to refresh) and the sheets keep their own scroll', () => {
  assert.match(source, /html,body\{[^}]*overscroll-behavior:none/);
  assert.match(source, /\.pw-sheet,\.pw-menu,\.pw-issues,\.pw-dlg\{overscroll-behavior:contain\}/);
});

test('buttons and selects do not zoom the page on a double tap', () => {
  assert.match(source, /button,select,summary\{touch-action:manipulation\}/);
});
