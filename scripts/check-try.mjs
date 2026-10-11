// Verify the published try scripts (public/, and dist/ after a build).
//
//   node scripts/check-try.mjs [../hyprune]
//
// 1. public/check and public/try, and every versioned copy, match the SHA-256s in
//    public/try-source.json; try.sha256 lists exactly the versioned copies.
// 2. The current copies equal the versioned copies of the recorded tryVersion.
// 3. With a sibling hyprune/hyprune checkout, the copies equal try/ at the
//    recorded commit, and that commit's try/ scripts equal the checkout's HEAD:
//    a newer committed script fails until `node scripts/sync-try.mjs` is rerun.
//    CI has no sibling checkout and checks hashes only.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const record = JSON.parse(readFileSync(join(docs, 'public/try-source.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const errors = [];

for (const root of ['public', 'dist']) {
  const dir = join(docs, root);
  if (root === 'dist' && !existsSync(join(dir, 'try'))) continue;
  const expected = { ...record.files, ...Object.assign({}, ...Object.values(record.versions)) };
  for (const [file, hash] of Object.entries(expected)) {
    if (!existsSync(join(dir, file))) errors.push(`${root}: missing ${file}`);
    else if (sha(readFileSync(join(dir, file))) !== hash) errors.push(`${root}: ${file} differs from try-source.json (never edit it; rerun sync-try)`);
  }
}
const current = record.versions[record.tryVersion] || {};
for (const name of ['check', 'try']) {
  if (current[`${name}-${record.tryVersion}.sh`] !== record.files[name]) errors.push(`${name} is not the published ${name}-${record.tryVersion}.sh`);
}
const listed = readFileSync(join(docs, 'public/try.sha256'), 'utf8').trim().split('\n').map(l => l.split(/\s+/));
const versions = Object.assign({}, ...Object.values(record.versions));
if (listed.length !== Object.keys(versions).length || listed.some(([hash, file]) => versions[file] !== hash)) {
  errors.push('try.sha256 does not list exactly the versioned copies');
}

const upstream = resolve(process.argv[2] || join(docs, '../hyprune'));
let note = 'no sibling hyprune checkout; hashes only';
if (existsSync(join(upstream, '.git'))) {
  const show = (rev, file) => { try { return execFileSync('git', ['-C', upstream, 'show', `${rev}:${file}`], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
  const short = record.commit.slice(0, 7);
  if (!show('HEAD', 'try/try.sh')) {
    note = 'sibling hyprune checkout has no try/ yet; hashes only';
  } else {
    for (const name of ['check', 'try']) {
      const recorded = show(record.commit, `try/${name}.sh`);
      if (!recorded) { errors.push(`cannot read try/${name}.sh at hyprune@${short}`); continue; }
      if (sha(recorded) !== record.files[name]) errors.push(`public/${name} differs from hyprune@${short}`);
      if (!show('HEAD', `try/${name}.sh`).equals(recorded)) errors.push(`hyprune HEAD changed try/${name}.sh since @${short}; run node scripts/sync-try.mjs`);
    }
    note = `matches hyprune@${short} and its HEAD`;
  }
}
if (errors.length) {
  for (const e of errors) console.error('check-try:', e);
  process.exit(1);
}
console.log(`check-try: try ${record.tryVersion} (${Object.keys(versions).length} versioned copies) OK; ${note}`);
