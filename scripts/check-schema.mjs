// Verify the schema mirror (public/schema, and dist/schema after a build).
//
//   node scripts/check-schema.mjs [../schema]
//
// 1. Every file in the mirror is listed in source.json with a matching SHA-256,
//    and every listed file exists (in public/ and, if built, dist/).
// 2. If the sibling hyprune/schema checkout exists, the mirror must equal the
//    recorded commit's files, and that commit's contract tree must equal the
//    checkout's HEAD. A newer upstream contract therefore fails the check until
//    `node scripts/sync-schema.mjs` is rerun and committed. CI has no sibling
//    checkout (the schema repo is private) and checks hashes only.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(docs, 'public/schema/source.json'), 'utf8'));
const errors = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function list(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? list(join(dir, e.name), base) : [relative(base, join(dir, e.name))]);
}

for (const root of ['public', 'dist']) {
  const dir = join(docs, root, 'schema');
  if (root === 'dist' && !existsSync(dir)) continue;
  const present = new Set(list(dir).filter(f => f !== 'source.json'));
  for (const [file, expected] of Object.entries(manifest.files)) {
    if (!present.delete(file)) { errors.push(`${root}: missing mirrored ${file}`); continue; }
    if (sha(readFileSync(join(dir, file))) !== expected) errors.push(`${root}: hash mismatch ${file} (never edit the mirror; rerun sync-schema)`);
  }
  for (const extra of present) errors.push(`${root}: ${extra} is not in source.json`);
}

const upstream = resolve(process.argv[2] || join(docs, '../schema'));
let note = 'no sibling schema checkout; hashes only';
if (existsSync(join(upstream, '.git'))) {
  const git = (...args) => execFileSync('git', ['-C', upstream, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const contract = n => /^(v0(\.\d+)?|extensions|examples)\//.test(n) && n.endsWith('.json') || n === 'CHANGELOG.md';
  const tree = rev => new Map(git('ls-tree', '-r', rev).trim().split('\n').map(l => l.split('\t')).filter(([, n]) => contract(n)).map(([meta, n]) => [n, meta.split(' ')[2]]));
  try {
    const recorded = tree(manifest.commit);
    for (const [file, expected] of Object.entries(manifest.files)) {
      if (!recorded.has(file)) { errors.push(`${file} is not in schema@${manifest.commit.slice(0, 7)}`); continue; }
      if (sha(execFileSync('git', ['-C', upstream, 'cat-file', 'blob', recorded.get(file)])) !== expected) errors.push(`${file} differs from schema@${manifest.commit.slice(0, 7)}`);
    }
    for (const file of recorded.keys()) if (!(file in manifest.files)) errors.push(`schema@${manifest.commit.slice(0, 7)} has ${file}, mirror does not`);
    const head = tree('HEAD');
    const drift = [...new Set([...head.keys(), ...recorded.keys()])].filter(f => head.get(f) !== recorded.get(f));
    if (drift.length) errors.push(`schema HEAD changed ${drift.length} contract file(s) since the mirrored commit (${drift.slice(0, 5).join(', ')}${drift.length > 5 ? ', …' : ''}); run node scripts/sync-schema.mjs`);
    note = `matches schema@${manifest.commit.slice(0, 7)} and its HEAD`;
  } catch (e) {
    errors.push(`cannot read schema@${manifest.commit.slice(0, 7)} from ${upstream}: ${e.message.split('\n')[0]}`);
  }
}

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Schema mirror OK: ${Object.keys(manifest.files).length} files, ${note}.`);
