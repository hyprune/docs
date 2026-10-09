// Mirror every published contract from hyprune/schema into public/schema.
//
//   node scripts/sync-schema.mjs [../schema]
//
// Copies all version directories (v0, v0.2, ...), extensions/ and examples/
// byte-for-byte and records one manifest (public/schema/source.json) with the
// source commit and SHA-256 of every file. Raw files keep the URLs used by the
// schemas' own $id values (https://hyprune.com/schema/v0.15/ipc.schema.json).
// The reference pages under /reference/schema/ are generated from this mirror
// at build time; `npm run check:schema` verifies it has not drifted.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] || join(docs, '../schema'));
const target = join(docs, 'public/schema');
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();

const mirroredRoots = name => /^v0(\.\d+)?$/.test(name) || name === 'extensions' || name === 'examples';

const roots = readdirSync(source).filter(n => mirroredRoots(n) && statSync(join(source, n)).isDirectory()).sort();
if (git('status', '--porcelain', '--', ...roots, 'CHANGELOG.md')) throw new Error('Commit the schema contract tree before mirroring it');

const files = {};
function copy(dir) {
  for (const entry of readdirSync(join(source, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) { copy(rel); continue; }
    if (!entry.name.endsWith('.json')) continue;
    const bytes = readFileSync(join(source, rel));
    mkdirSync(dirname(join(target, rel)), { recursive: true });
    writeFileSync(join(target, rel), bytes);
    files[rel] = createHash('sha256').update(bytes).digest('hex');
  }
}

// Start from a clean mirror so removed upstream files cannot linger.
for (const name of readdirSync(target)) if (name !== 'source.json') rmSync(join(target, name), { recursive: true, force: true });
for (const root of roots) copy(root);

// The changelog feeds the per-version notes on the reference pages.
const changelog = readFileSync(join(source, 'CHANGELOG.md'));
writeFileSync(join(target, 'CHANGELOG.md'), changelog);
files['CHANGELOG.md'] = createHash('sha256').update(changelog).digest('hex');

// First-publication dates label each version on the reference pages.
const added = {};
for (const file of Object.keys(files)) added[file] = git('log', '--diff-filter=A', '--format=%cs', '--', file).split('\n').pop();

const manifest = {
  repository: 'https://github.com/hyprune/schema',
  commit: git('rev-parse', 'HEAD'),
  committed: git('log', '-1', '--format=%cs'),
  files,
  added,
};
writeFileSync(join(target, 'source.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Mirrored ${Object.keys(files).length} files from ${relative(docs, source)} @ ${manifest.commit.slice(0, 7)}`);
