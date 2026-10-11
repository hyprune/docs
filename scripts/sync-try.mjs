// Publish the try scripts from hyprune/hyprune at hyprune.com/check and hyprune.com/try.
//
//   node scripts/sync-try.mjs [../hyprune]
//
// Copies the committed try/check.sh and try/try.sh byte-for-byte to public/check
// and public/try, adds versioned copies (public/check-<v>.sh, public/try-<v>.sh,
// v = tryVersion in try/manifest.json) and lists every versioned copy with its
// SHA-256 in public/try.sha256 (`sha256sum -c` format). public/try-source.json
// records the source commit. A published version never changes: new bytes need a
// new tryVersion. `npm run check:try` verifies all of this.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] || join(docs, '../hyprune'));
const pub = join(docs, 'public');
const git = (...args) => execFileSync('git', ['-C', source, ...args], { maxBuffer: 16 << 20 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

if (git('status', '--porcelain', '--', 'try').toString()) throw new Error('Commit try/ in the meta repository before publishing it');
const commit = git('rev-parse', 'HEAD').toString().trim();
const bytes = { check: git('show', 'HEAD:try/check.sh'), try: git('show', 'HEAD:try/try.sh') };
const version = JSON.parse(git('show', 'HEAD:try/manifest.json')).tryVersion;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid tryVersion ${version}`);

const recordPath = join(pub, 'try-source.json');
const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : { versions: {} };
const versioned = {};
for (const [name, data] of Object.entries(bytes)) {
  const file = `${name}-${version}.sh`;
  const published = record.versions[version]?.[file];
  if (published && published !== sha(data)) throw new Error(`${file} is published with other bytes; bump tryVersion in try/manifest.json`);
  writeFileSync(join(pub, name), data);
  writeFileSync(join(pub, file), data);
  versioned[file] = sha(data);
}
record.versions[version] = versioned;
const manifest = {
  repository: 'https://github.com/hyprune/hyprune',
  commit,
  committed: git('log', '-1', '--format=%cs').toString().trim(),
  tryVersion: version,
  files: { check: sha(bytes.check), try: sha(bytes.try) },
  versions: record.versions,
};
writeFileSync(recordPath, JSON.stringify(manifest, null, 2) + '\n');
const sums = Object.values(record.versions).flatMap(v => Object.entries(v)).map(([file, hash]) => `${hash}  ${file}\n`);
writeFileSync(join(pub, 'try.sha256'), sums.sort((a, b) => a.split('  ')[1].localeCompare(b.split('  ')[1])).join(''));
console.log(`try ${version} from hyprune@${commit.slice(0, 7)}: public/check, public/try, ${Object.keys(versioned).join(', ')}`);
