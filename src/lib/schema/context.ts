// Links between schema versions, the RFCs that define them and the schema
// changelog. Derived from the RFC sources and the mirrored CHANGELOG.md, so a
// new amendment heading or changelog paragraph shows up without code changes.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import GithubSlugger from 'github-slugger';
import { SCHEMA_ROOT, type SchemaVersion } from './catalog';

const RFC_DIR = join(process.cwd(), 'src/content/docs/rfcs');

export interface RfcLink { title: string; heading?: string; href: string; }

interface RfcHeading { rfc: string; rfcTitle: string; heading: string; slug: string; }
const headings: RfcHeading[] = [];
const rfcTitles: Record<string, string> = {};
for (const file of readdirSync(RFC_DIR).filter(f => f.endsWith('.md')).sort()) {
  const id = file.replace(/\.md$/, '');
  const src = readFileSync(join(RFC_DIR, file), 'utf8');
  const title = src.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? id;
  rfcTitles[id] = title;
  const slugger = new GithubSlugger();
  let fence = false;
  for (const line of src.replace(/^---[\s\S]*?\n---\n/, '').split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    const m = !fence && line.match(/^(#{2,4})\s+(.+?)\s*$/);
    if (m) headings.push({ rfc: id, rfcTitle: title, heading: m[2], slug: slugger.slug(m[2]) });
  }
}

/** Words that name each contract kind in RFC headings and changelog prose. */
const names: Record<string, string> = { ipc: 'IPC', world: 'world(?: format)?', input: 'IPC', common: '(?:IPC|world(?: format)?)' };

function mentions(kind: string, version: string, text: string) {
  const word = names[kind];
  if (!word) return false;
  const v = version.replace('.', '\\.');
  const re = new RegExp(`\\b${word}\\s*\`?\\*{0,2}${v}(?![\\d])`, 'i');
  const m = text.match(re);
  if (!m) return new RegExp(`v${v}/${kind}\\.schema`).test(text);
  // "world format remains 0.3" restates an old version; it does not define it.
  return !/(remains|unchanged|stays|through)\s*$/i.test(text.slice(Math.max(0, m.index! - 12), m.index));
}

export function rfcLinks(v: SchemaVersion): RfcLink[] {
  const out: RfcLink[] = v.kind.rfcs.map(id => ({ title: rfcTitles[id] ?? id, href: `/rfcs/${id}/` }));
  if (v.kind.id === 'input' || v.kind.id === 'common') return out;
  for (const h of headings) if (mentions(v.kind.id, v.version, h.heading))
    out.push({ title: h.rfcTitle, heading: h.heading, href: `/rfcs/${h.rfc}/#${h.slug}` });
  return out;
}

/** Every RFC heading that defines some version, for the reference landing page. */
export function rfcIndex() { return headings; }

export interface ChangelogNote { section: string; html: string; }
const changelog = existsSync(join(SCHEMA_ROOT, 'CHANGELOG.md')) ? readFileSync(join(SCHEMA_ROOT, 'CHANGELOG.md'), 'utf8') : '';

export const changelogMarkdown = changelog;

/** Changelog paragraphs that introduce this version. */
export function changelogNotes(v: SchemaVersion, render: (md: string) => string): ChangelogNote[] {
  const out: ChangelogNote[] = [];
  let section = '';
  for (const block of changelog.split(/\n\s*\n/)) {
    const h = block.match(/^##\s+(.+)/);
    if (h) { section = h[1].trim(); const rest = block.split('\n').slice(1).join('\n'); if (!rest.trim()) continue; }
    const body = h ? block.split('\n').slice(1).join('\n') : block;
    const hit = mentions(v.kind.id, v.version, body) || (h && mentions(v.kind.id, v.version, section))
      || (v.version === '0.1' && /^v0 \//.test(section) && ['world', 'ipc', 'extension', 'screen-type', 'common'].includes(v.kind.id));
    if (hit && v.kind.id !== 'common') out.push({ section, html: render(body) });
  }
  return out;
}
