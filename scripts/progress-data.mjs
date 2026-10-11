// Release table and timeline data for the Progress page, so it can't fall behind.
//
//   node scripts/progress-data.mjs            update src/data/progress.json
//   node scripts/progress-data.mjs --check    fail if the page is behind
//
// Sources, in order of preference:
//   - GitHub releases of hyprune/worlds (`gh`, when authenticated): publish time,
//     archive size, release notes;
//   - the sibling ../worlds checkout: release tags and lumen-reach/reports/
//     release.json at each tag (format, archive, triangles);
//   - the mirrored schemas in public/schema: IPC and world format versions and
//     their first-publication dates (times from the sibling ../schema history);
//   - src/data/progress-curated.json: hand-written release summaries, figures the
//     reports don't carry for early releases, and the curated timeline entries.
//
// Release and contract events are generated; curated entries describe the work
// between them. --check runs before every build: with the sibling checkouts or
// `gh` it fails when a published Lumen Reach release or the mirrored IPC
// version is missing from the data; without them (CI) it checks the committed
// data against the schema mirror and the pages that quote versions.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worlds = resolve(docs, '../worlds');
const schemaRepo = resolve(docs, '../schema');
const dataFile = join(docs, 'src/data/progress.json');
const curated = JSON.parse(readFileSync(join(docs, 'src/data/progress-curated.json'), 'utf8'));
const check = process.argv.includes('--check');

const run = (cmd, args, opts = {}) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20, ...opts }).trim(); }
  catch { return null; }
};
const cmpVersion = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
// Times on the page are CEST (UTC+2), where the project is run.
const cest = iso => {
  const d = new Date(new Date(iso).getTime() + 2 * 3600e3);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
};

// ---------------------------------------------------------------- releases
function githubReleases(details = true) {
  const out = run('gh', ['release', 'list', '-R', 'hyprune/worlds', '--limit', '200', '--json', 'tagName,publishedAt,isDraft,isPrerelease']);
  if (!out) return null;
  return JSON.parse(out).filter(r => !r.isDraft && !r.isPrerelease).map(r => {
    if (!details) return { tag: r.tagName, published: r.publishedAt, archiveBytes: null, body: '' };
    const view = JSON.parse(run('gh', ['release', 'view', r.tagName, '-R', 'hyprune/worlds', '--json', 'body,assets']) || '{}');
    const archive = (view.assets || []).find(a => /\.tar\.zst$/.test(a.name));
    return { tag: r.tagName, published: r.publishedAt, archiveBytes: archive?.size ?? null, body: view.body || '' };
  });
}

function tagReleases() {
  if (!existsSync(join(worlds, '.git'))) return null;
  const tags = run('git', ['-C', worlds, 'tag', '-l', '*-v*']);
  if (tags === null) return null;
  return tags.split('\n').filter(Boolean).map(tag => ({ tag, published: run('git', ['-C', worlds, 'log', '-1', '--format=%cI', tag]), archiveBytes: null, body: '' }));
}

function reportAt(tag) {
  if (!existsSync(join(worlds, '.git'))) return {};
  const world = tag.replace(/-v[\d.]+$/, '');
  const text = run('git', ['-C', worlds, 'show', `${tag}:${world}/reports/release.json`]);
  if (!text) return {};
  try {
    const r = JSON.parse(text);
    return {
      version: r.version,
      formatVersion: r.formatVersion ?? r.archive?.formatVersion ?? null,
      archiveBytes: r.archive?.bytes ?? null,
      triangles: r.budgets?.visibleTriangles ?? r.gates?.budgets?.visibleTriangles ?? r.budgets?.gltfTransform?.visibleTriangles ?? null,
      gpuMiB: r.budgets?.conservativeGpuMiB ?? null,
    };
  } catch { return {}; }
}

function buildReleases(sources) {
  const byTag = new Map();
  for (const list of sources) for (const r of list || []) {
    // Later sources (GitHub) win over earlier ones (tags) wherever they have a value.
    const prev = byTag.get(r.tag) || {};
    byTag.set(r.tag, { ...prev, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) });
  }
  return [...byTag.values()].map(r => {
    const [, world, version] = r.tag.match(/^(.*)-v([\d.]+)$/);
    const rep = reportAt(r.tag);
    const cur = curated.releases?.[`${world}@${version}`] || {};
    const firstSentence = r.body.replace(/SHA-256:.*$/s, '').split(/(?<=\.)\s/)[0]?.trim() || null;
    return {
      world, version, tag: r.tag,
      url: `https://github.com/hyprune/worlds/releases/tag/${r.tag}`,
      published: r.published,
      ...cest(r.published),
      formatVersion: cur.formatVersion ?? rep.formatVersion ?? r.body.match(/format (\d+\.\d+)/)?.[1] ?? null,
      archiveBytes: r.archiveBytes ?? rep.archiveBytes ?? cur.archiveBytes ?? null,
      triangles: rep.triangles ?? cur.triangles ?? null,
      gpuMiB: cur.gpuMiB ?? rep.gpuMiB ?? null,
      gpuMeasured: Boolean(cur.gpuMeasured),
      summary: cur.summary ?? firstSentence,
      summaryCurated: Boolean(cur.summary),
    };
  }).sort((a, b) => a.world.localeCompare(b.world) || cmpVersion(a.version, b.version));
}

// ---------------------------------------------------------------- contracts
const mirror = JSON.parse(readFileSync(join(docs, 'public/schema/source.json'), 'utf8'));
function contractVersions(file) {
  return Object.keys(mirror.files).filter(p => p.endsWith(`/${file}`) && /^v0(\.\d+)?\//.test(p))
    .map(p => ({ version: p.startsWith('v0/') ? '0.1' : p.split('/')[0].slice(1), path: p, date: mirror.added[p] }))
    .sort((a, b) => cmpVersion(a.version, b.version));
}
function firstCommitTime(path) {
  if (!existsSync(join(schemaRepo, '.git'))) return null;
  const iso = run('git', ['-C', schemaRepo, 'log', '--diff-filter=A', '--format=%cI', '--', path])?.split('\n').pop();
  return iso ? cest(iso).time : null;
}

// ---------------------------------------------------------------- timeline
function buildTimeline(releases, ipc, world, previous) {
  const keep = new Map((previous?.timeline || []).filter(e => e.generated).map(e => [e.id, e]));
  const events = [];
  const covered = new Set((curated.timeline || []).flatMap(e => e.covers || []));
  for (const r of releases) {
    const id = `release:${r.world}@${r.version}`;
    if (covered.has(id)) continue;
    const name = r.world === 'lumen-reach' ? 'Lumen Reach' : r.world[0].toUpperCase() + r.world.slice(1);
    events.push({ id, generated: true, date: r.date, time: r.time, major: r.world === 'lumen-reach' && /\.0$/.test(r.version),
      title: `${name} ${r.version} released`, text: r.summary || '', href: r.url });
  }
  for (const [kind, list, label, base] of [['ipc', ipc, 'IPC', '/reference/schema/ipc/'], ['world', world, 'World format', '/reference/schema/world/']]) {
    for (const v of list) {
      const id = `${kind}:${v.version}`;
      if (covered.has(id) || v.version === '0.1') continue;
      const time = firstCommitTime(v.path) ?? keep.get(id)?.time ?? null;
      events.push({ id, generated: true, date: v.date, time, title: `${label} ${v.version}`, text: '', href: `${base}${v.version}/` });
    }
  }
  const entries = [...(curated.timeline || []).map(e => ({ ...e, generated: false })), ...events];
  return entries.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}

// ---------------------------------------------------------------- main
const previous = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : null;
const gh = githubReleases(!check);
const tags = tagReleases();
const ipc = contractVersions('ipc.schema.json');
const world = contractVersions('world.schema.json');
const latestIpc = ipc.at(-1).version;
const errors = [];

if (check) {
  const data = previous;
  if (!data) errors.push('src/data/progress.json is missing; run npm run progress:update');
  else {
    const have = new Set(data.releases.map(r => r.tag));
    const live = gh || tags;
    if (live) for (const r of live) if (!have.has(r.tag)) errors.push(`${r.tag} is published but not on the Progress page; run npm run progress:update`);
    if (data.contracts.ipcLatest !== latestIpc) errors.push(`the schema mirror has IPC ${latestIpc} but progress data says ${data.contracts.ipcLatest}; run npm run progress:update`);
    if (!data.timeline.some(e => e.id === `ipc:${latestIpc}` || (e.covers || []).includes(`ipc:${latestIpc}`))) errors.push(`IPC ${latestIpc} is not in the timeline`);
    const lumen = data.releases.filter(r => r.world === 'lumen-reach').at(-1);
    const quoting = { 'src/content/docs/first-session.md': `Lumen Reach ${lumen.version}` };
    for (const [file, text] of Object.entries(quoting)) if (!readFileSync(join(docs, file), 'utf8').includes(text)) errors.push(`${file} does not name the current release (${text})`);
    for (const r of data.releases) if (!r.summary) errors.push(`${r.tag} has no summary; add one to src/data/progress-curated.json`);
    const page = readFileSync(join(docs, 'src/content/docs/progress.mdx'), 'utf8');
    for (const c of ['<ReleaseTable', '<Timeline']) if (!page.includes(c)) errors.push(`progress.mdx no longer renders ${c} from the generated data`);
    if (!live) console.log('progress-data: no worlds checkout or gh access; checked the committed data against the schema mirror and pages only.');
  }
  if (errors.length) { console.error(errors.map(e => `progress-data: ${e}`).join('\n')); process.exit(1); }
  console.log(`progress-data: OK (Lumen Reach ${previous.releases.filter(r => r.world === 'lumen-reach').at(-1).version}, IPC ${latestIpc}, ${previous.timeline.length} timeline entries).`);
  process.exit(0);
}

if (!gh && !tags) {
  console.error('progress-data: needs the sibling ../worlds checkout or an authenticated gh to read releases.');
  process.exit(2);
}
const releases = buildReleases([tags, gh]);
for (const r of releases) if (!r.summaryCurated) console.warn(`progress-data: ${r.tag} uses its release-note sentence as summary; consider curating it.`);
const data = {
  note: 'Generated by scripts/progress-data.mjs; edit src/data/progress-curated.json instead.',
  sources: {
    worlds: existsSync(join(worlds, '.git')) ? run('git', ['-C', worlds, 'rev-parse', '--short', 'HEAD']) : null,
    schema: mirror.commit.slice(0, 7),
    githubReleases: Boolean(gh),
  },
  contracts: {
    ipcLatest: latestIpc,
    worldLatest: world.at(-1).version,
    ipc: ipc.map(({ version, date }) => ({ version, date })),
    world: world.map(({ version, date }) => ({ version, date })),
  },
  days: curated.days || {},
  releases,
  timeline: buildTimeline(releases, ipc, world, previous),
};
writeFileSync(dataFile, JSON.stringify(data, null, 2) + '\n');
console.log(`progress-data: wrote ${releases.length} releases and ${data.timeline.length} timeline entries (IPC ${latestIpc}).`);
