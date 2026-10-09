// Build-time catalog of every mirrored contract in public/schema.
// The mirror is written by scripts/sync-schema.mjs; nothing here is hand-listed
// per version: versions come from the directories present in the mirror.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const SCHEMA_ROOT = join(process.cwd(), 'public/schema');

export interface KindInfo {
  id: string;
  file: string;
  /** Directory pattern: version directories (v0, v0.N) or a fixed directory. */
  dir: 'versioned' | 'extensions';
  title: string;
  short: string;
  blurb: string;
  /** Normative RFC pages for this contract. */
  rfcs: string[];
  /** Version label for fixed-directory schemas. */
  fixedVersion?: string;
}

export const KINDS: KindInfo[] = [
  { id: 'world', file: 'world.schema.json', dir: 'versioned', title: 'World manifest', short: 'World', rfcs: ['0004-world-format'],
    blurb: 'The data-only world.json at the root of every world package: scene entry, spawns, areas, anchors, mounts, collision, playable bounds, atmosphere and provenance.' },
  { id: 'ipc', file: 'ipc.schema.json', dir: 'versioned', title: 'IPC protocol', short: 'IPC', rfcs: ['0003-ipc'],
    blurb: 'JSON-RPC 2.0 frames between core and shells, SDK clients and tools: every method’s params and result, notifications, state and errors.' },
  { id: 'common', file: 'common.schema.json', dir: 'versioned', title: 'Common definitions', short: 'Common', rfcs: ['0003-ipc', '0004-world-format'],
    blurb: 'Shared IDs, versions, paths, poses, revisions, capabilities, areas and mounts referenced by the world and IPC schemas.' },
  { id: 'input', file: 'input.schema.json', dir: 'versioned', title: 'Input keymap', short: 'Input', rfcs: ['0006-interaction'],
    blurb: 'Keymap v2: per-mode actions with up to three bindings each, hold timing and capture limits. Directory versions follow the IPC revision that introduced them.' },
  { id: 'extension', file: 'extension.schema.json', dir: 'versioned', title: 'Extension manifest', short: 'Extension', rfcs: ['0007-extensions'],
    blurb: 'Process extension entrypoint, contributions, requested grants and mandatory sandbox profile.' },
  { id: 'screen-type', file: 'screen-type.schema.json', dir: 'versioned', title: 'Screen type descriptor', short: 'Screen type', rfcs: ['0005-surfaces'],
    blurb: 'Source kind, planar geometry, resolution, colour/alpha, refresh ceiling and input support for a screen type.' },
  { id: 'hud-style', file: 'hud-style.schema.json', dir: 'extensions', title: 'World HUD style', short: 'HUD style', rfcs: ['0004-0008-world-hud-style'], fixedVersion: 'proposed',
    blurb: 'Proposed bounded, declarative HUD style a world package may ship (colours, corners, font, icons, stroke, warp).' },
  { id: 'hud-style-manifest', file: 'hud-style-manifest.schema.json', dir: 'extensions', title: 'HUD style manifest entry', short: 'HUD style entry', rfcs: ['0004-0008-world-hud-style'], fixedVersion: 'proposed',
    blurb: 'Proposed com.hyprune.hud-style extension value in world.json that points at a HUD style file.' },
];

export interface Manifest { repository: string; commit: string; committed: string; files: Record<string, string>; added: Record<string, string>; }
export const manifest: Manifest = JSON.parse(readFileSync(join(SCHEMA_ROOT, 'source.json'), 'utf8'));

export interface SchemaVersion {
  kind: KindInfo;
  version: string;
  /** Path inside the mirror, e.g. v0.15/ipc.schema.json */
  path: string;
  rawUrl: string;
  page: string;
  schema: any;
  text: string;
  bytes: number;
  lines: number;
  sha256: string;
  added: string;
}

/** Contract versions are dotted numbers; compare numerically (v0 is 0.1). */
export function compareVersions(a: string, b: string) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

const dirVersion = (dir: string) => (dir === 'v0' ? '0.1' : dir.slice(1));
export const pageFor = (kind: string, version: string) => `/reference/schema/${kind}/${version}/`;

function load(kind: KindInfo, dir: string, version: string): SchemaVersion {
  const path = `${dir}/${kind.file}`;
  const text = readFileSync(join(SCHEMA_ROOT, path), 'utf8');
  if (!manifest.files[path]) throw new Error(`${path} is not in public/schema/source.json; run scripts/sync-schema.mjs`);
  return {
    kind, version, path, rawUrl: `/schema/${path}`, page: pageFor(kind.id, version), schema: JSON.parse(text), text,
    bytes: Buffer.byteLength(text), lines: text.split('\n').length, sha256: manifest.files[path], added: manifest.added?.[path] ?? manifest.committed,
  };
}

export const catalog: Record<string, SchemaVersion[]> = Object.fromEntries(KINDS.map(kind => {
  if (kind.dir === 'extensions') return [kind.id, existsSync(join(SCHEMA_ROOT, 'extensions', kind.file)) ? [load(kind, 'extensions', kind.fixedVersion!)] : []];
  const dirs = readdirSync(SCHEMA_ROOT).filter(d => /^v0(\.\d+)?$/.test(d) && existsSync(join(SCHEMA_ROOT, d, kind.file)));
  return [kind.id, dirs.map(d => load(kind, d, dirVersion(d))).sort((a, b) => compareVersions(a.version, b.version))];
}));

export const allVersions = Object.values(catalog).flat();
export const latest = (kind: string) => catalog[kind].at(-1)!;
export const previous = (v: SchemaVersion) => { const list = catalog[v.kind.id]; return list[list.indexOf(v) - 1]; };

/** Find the mirrored schema a $ref URL points at (absolute or relative to $id). */
export function byUrl(url: URL) {
  const m = url.pathname.match(/^\/schema\/(.+)$/);
  return m ? allVersions.find(v => v.path === m[1]) : undefined;
}

export interface Example { file: string; url: string; text: string; label: string; }
/** Schema repo examples, attached to the contract version they target. */
export function examplesFor(v: SchemaVersion): Example[] {
  const dir = join(SCHEMA_ROOT, 'examples');
  if (!existsSync(dir)) return [];
  const read = (rel: string): Example => ({ file: rel, url: `/schema/examples/${rel}`, text: readFileSync(join(dir, rel), 'utf8'), label: rel });
  const top = readdirSync(dir).filter(f => f.endsWith('.json'));
  const out: Example[] = [];
  for (const f of top) {
    const ex = read(f), doc = JSON.parse(ex.text);
    if (v.kind.id === 'world' && f === 'world.json' && doc.formatVersion === v.version) out.push(ex);
    if (v.kind.id === 'extension' && f === 'extension.json') out.push(ex);
    if (v.kind.id === 'screen-type' && f === 'screen-type.json') out.push(ex);
    if (v.kind.id === 'input' && f === 'placement-input.json' && v === latest('input')) out.push(ex);
  }
  if (v.kind.id === 'ipc' && v.version === '0.1' && existsSync(join(dir, 'ipc')))
    for (const f of readdirSync(join(dir, 'ipc')).sort()) out.push(read(`ipc/${f}`));
  return out;
}
