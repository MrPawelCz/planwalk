// Runs every tests/**/*.test.mjs with node:test. A directory argument to `node --test` is not portable across
// Node versions (22 treats it as a file), so the files are listed explicitly. Extra arguments go to node --test.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(p));
    else if (entry.name.endsWith('.test.mjs')) out.push(p);
  }
  return out.sort();
}

const files = collect(join(root, 'tests'));
if (!files.length) { console.error('No tests found under tests/'); process.exit(1); }
const res = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit', cwd: root });
process.exit(res.status ?? 1);
