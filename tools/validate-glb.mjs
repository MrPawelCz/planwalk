// Runs the official Khronos glTF validator (the npm package gltf-validator, a library) on GLB files and exits 1 on errors.
// Warnings, infos and hints are printed but do not fail. The package is not a dependency of planwalk: install it in a
// scratch directory and point to that directory, CI does exactly this (see .github/workflows/ci.yml).
//   npm install --prefix DIR gltf-validator@2.0.0-dev.3.10 --ignore-scripts
//   GLTF_VALIDATOR_DIR=DIR node tools/validate-glb.mjs file.glb [more.glb]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEVERITY = ['error', 'warning', 'info', 'hint'];

// Turns the validator's report into printable lines and an error count.
export function summarize(report) {
  const issues = report.issues || {};
  const lines = (issues.messages || []).map((m) => `${SEVERITY[m.severity] || m.severity} ${m.code} at ${m.pointer || '/'}: ${m.message}`);
  return { errors: issues.numErrors || 0, warnings: issues.numWarnings || 0, infos: issues.numInfos || 0, hints: issues.numHints || 0, lines };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  const dir = process.env.GLTF_VALIDATOR_DIR;
  if (!files.length || !dir) {
    console.error('usage: GLTF_VALIDATOR_DIR=DIR node tools/validate-glb.mjs file.glb [more.glb]  (DIR has gltf-validator installed, see the header of this file)');
    process.exit(2);
  }
  const validator = createRequire(join(resolve(dir), 'x.js'))('gltf-validator');
  let failed = 0;
  for (const file of files) {
    const report = await validator.validateBytes(new Uint8Array(readFileSync(file)), { uri: basename(file), maxIssues: 200 });
    const s = summarize(report);
    console.log(`${file}: ${s.errors} errors, ${s.warnings} warnings, ${s.infos} infos, ${s.hints} hints (validator ${report.validatorVersion})`);
    for (const line of s.lines) console.log(`  ${line}`);
    if (s.errors) failed++;
  }
  process.exit(failed ? 1 : 0);
}
