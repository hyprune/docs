// Turn a JSON Schema (2020-12, as used by hyprune/schema) into readable
// sections of field rows, and diff two versions of the same contract.
import { byUrl, type SchemaVersion } from './catalog';

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const anchor = (name: string) => 'def-' + name.replace(/[^A-Za-z0-9_-]+/g, '-');

/** A fragment of a type label: plain text, or a link to a definition. */
type Part = { t: string; href?: string; code?: boolean };
const html = (parts: Part[]) => parts.map(p => {
  const body = p.code ? `<code>${esc(p.t)}</code>` : esc(p.t);
  return p.href ? `<a href="${esc(p.href)}">${body}</a>` : body;
}).join('');
const text = (parts: Part[]) => parts.map(p => p.t).join('');

export interface Row {
  /** Dotted path from the section root; used for diffs. */
  path: string;
  name: string;
  depth: number;
  typeHtml: string;
  typeText: string;
  required: boolean;
  notes: string[];
  description?: string;
  id?: string;
}

export interface Section {
  name: string;
  id: string;
  kind: 'fields' | 'def' | 'method' | 'notification' | 'envelope';
  description?: string;
  /** Anchors of $defs folded into this section (camera.fov.params, ...). */
  aliases?: string[];
  /** Tables in the section (a method has params and result). */
  tables: { label?: string; rows: Row[]; summary?: string }[];
}

const bigNumber = (n: number) => (n === 9007199254740991 ? '2⁵³−1' : n === -9007199254740991 ? '−(2⁵³−1)' : String(n));
const literal = (v: unknown) => JSON.stringify(v);

export class Renderer {
  constructor(private v: SchemaVersion) {}

  /** Link target for a $ref, relative to this schema's $id. */
  ref(ref: string): Part {
    const url = new URL(ref, this.v.schema.$id);
    const target = byUrl(url);
    const frag = decodeURIComponent(url.hash.slice(1));
    const name = frag.split('/').pop() || (target?.kind.short ?? ref);
    const sameDoc = target === this.v || (!target && ref.startsWith('#'));
    let id = '';
    if (frag.startsWith('/$defs/')) id = anchor(frag.slice(7));
    else if (frag.startsWith('/properties/')) id = 'field-' + frag.slice(12).split('/')[0];
    const page = sameDoc ? '' : target?.page ?? '';
    const prefix = !sameDoc && target ? `${target.kind.id === 'common' ? '' : target.kind.short + ' '}` : '';
    return { t: prefix + name, href: page + (id ? '#' + id : ''), code: true };
  }

  /** Parts naming the type of a schema node (without expanding children). */
  type(node: any): Part[] {
    if (node === true || node == null || (typeof node === 'object' && !Object.keys(node).length)) return [{ t: 'any' }];
    if (node === false) return [{ t: 'never' }];
    if (node.$ref) return [this.ref(node.$ref)];
    if ('const' in node) return [{ t: literal(node.const), code: true }];
    if (node.enum) {
      const shown = node.enum.slice(0, 14).flatMap((v: unknown, i: number) => [...(i ? [{ t: ' | ' }] : []), { t: literal(v), code: true }]);
      return node.enum.length > 14 ? [...shown, { t: ` | … (${node.enum.length} values)` }] : shown;
    }
    const variants = node.anyOf ?? node.oneOf;
    if (variants && !this.requireOnly(variants)) {
      if (variants.every((s: any) => this.simple(s)))
        return variants.flatMap((s: any, i: number) => [...(i ? [{ t: ' | ' }] : []), ...this.type(s)]);
      return [{ t: `${node.oneOf ? 'one' : 'any'} of ${variants.length}` }];
    }
    if (node.type === 'object' && !Object.keys(node.properties ?? {}).length && node.additionalProperties === false && !node.anyOf && !node.oneOf) return [{ t: '{} (no fields)' }];
    if (node.allOf) return node.allOf.flatMap((s: any, i: number) => [...(i ? [{ t: ' & ' }] : []), ...this.type(s)]);
    const types: string[] = Array.isArray(node.type) ? node.type : node.type ? [node.type] : node.properties ? ['object'] : [];
    if (!types.length) return [{ t: 'any' }];
    return types.flatMap((t, i) => {
      const sep = i ? [{ t: ' | ' }] : [];
      if (t === 'array') {
        const item = node.prefixItems ? [{ t: 'tuple' }] : node.items ? this.type(node.items) : [{ t: 'any' }];
        const n = node.minItems !== undefined && node.minItems === node.maxItems ? String(node.minItems) : '';
        const wrap = item.length > 1 ? [{ t: '(' }, ...item, { t: ')' }] : item;
        return [...sep, ...wrap, { t: `[${n}]` }];
      }
      if (t === 'object' && !node.properties && node.additionalProperties && typeof node.additionalProperties === 'object')
        return [...sep, { t: 'map → ' }, ...this.type(node.additionalProperties)];
      if (t === 'object' && !node.properties && node.patternProperties) return [...sep, { t: 'map' }];
      return [...sep, { t }];
    });
  }

  /** anyOf/oneOf entries that only state which properties must be present. */
  requireOnly(variants: any[]) {
    return variants.every(s => s && typeof s === 'object' && s.required && Object.keys(s).every(k => k === 'required' || k === 'properties')
      && Object.values(s.properties ?? {}).every(p => p && typeof p === 'object' && !Object.keys(p).length));
  }

  /** Can be shown inline without child rows. */
  simple(node: any): boolean {
    if (!node || typeof node !== 'object') return true;
    if (node.properties || node.allOf) return false;
    const variants = node.anyOf ?? node.oneOf;
    if (variants) return this.requireOnly(variants) || variants.every((s: any) => this.simple(s));
    if (node.items && typeof node.items === 'object') return this.simple(node.items);
    if (node.additionalProperties && typeof node.additionalProperties === 'object') return this.simple(node.additionalProperties);
    return true;
  }

  notes(node: any): string[] {
    if (!node || typeof node !== 'object') return [];
    const out: string[] = [];
    const range = (lo: any, hi: any, unit: string) => {
      if (lo !== undefined && hi !== undefined) out.push(lo === hi ? `${unit} ${lo}` : `${unit} ${lo}–${hi}`);
      else if (lo !== undefined) out.push(`${unit} ≥ ${lo}`);
      else if (hi !== undefined) out.push(`${unit} ≤ ${hi}`);
    };
    const num = (k: string, sym: string) => node[k] !== undefined && out.push(`${sym} ${bigNumber(node[k])}`);
    num('minimum', '≥'); num('exclusiveMinimum', '>'); num('maximum', '≤'); num('exclusiveMaximum', '<');
    if (node.multipleOf !== undefined) out.push(`multiple of ${node.multipleOf}`);
    range(node.minLength, node.maxLength, 'length');
    if (node.pattern) out.push(`pattern <code>${esc(node.pattern)}</code>`);
    if (node.format) out.push(`format ${esc(node.format)}`);
    const items = node.type === 'array' || (Array.isArray(node.type) && node.type.includes('array'));
    if (items && !(node.minItems !== undefined && node.minItems === node.maxItems)) range(node.minItems, node.maxItems, 'items');
    if (node.uniqueItems) out.push('unique items');
    range(node.minProperties, node.maxProperties, 'entries');
    if (node.propertyNames) {
      const p = node.propertyNames;
      const parts = p.$ref ? [html([this.ref(p.$ref)])] : this.notes(p);
      if (p.enum) parts.unshift(html(this.type(p)));
      if (parts.length) out.push(`keys: ${parts.join(', ')}`);
    }
    if (node.patternProperties) for (const pat of Object.keys(node.patternProperties)) out.push(`keys match <code>${esc(pat)}</code>`);
    if ('default' in node) out.push(`default <code>${esc(literal(node.default))}</code>`);
    const variants = node.anyOf ?? node.oneOf;
    if (variants && this.requireOnly(variants)) out.push(`requires ${node.oneOf ? 'exactly one' : 'at least one'} of ${variants.map((s: any) => s.required.map((r: string) => `<code>${esc(r)}</code>`).join(' + ')).join(', ')}`);
    if (node.type === 'object' && node.properties && node.additionalProperties !== false && node.additionalProperties !== undefined)
      out.push(node.additionalProperties === true ? 'open (extra keys allowed)' : 'extra keys allowed');
    if (node.contains) out.push(`contains ${html(this.type(node.contains))}`);
    // Constraints stated on array items surface on the array row.
    if (node.items && typeof node.items === 'object' && !node.items.$ref && this.simple(node.items) && !node.items.properties)
      out.push(...this.notes(node.items).map(n => `each ${n}`));
    if (node.additionalProperties && typeof node.additionalProperties === 'object' && this.simple(node.additionalProperties) && !node.additionalProperties.$ref)
      out.push(...this.notes(node.additionalProperties).map(n => `each value ${n}`));
    return out;
  }

  /** Rows for a node's children (properties, item fields, variants). */
  children(node: any, path: string, depth: number, out: Row[]) {
    if (!node || typeof node !== 'object' || node.$ref || depth > 8) return;
    if (node.properties) {
      const req = new Set(node.required ?? []);
      for (const [name, child] of Object.entries<any>(node.properties)) this.row(name, child, `${path}${path ? '.' : ''}${name}`, depth, req.has(name), out);
    }
    if (node.allOf) node.allOf.forEach((s: any) => this.children(s, path, depth, out));
    const variants = node.anyOf ?? node.oneOf;
    if (variants && !this.requireOnly(variants) && !variants.every((s: any) => this.simple(s))) {
      variants.forEach((s: any, i: number) => {
        const tag = s?.properties && Object.entries<any>(s.properties).find(([, p]) => p && 'const' in p);
        const name = tag ? `when ${tag[0]} = ${literal(tag[1].const)}` : `variant ${i + 1}`;
        this.row(name, s, `${path}|${tag ? tag[1].const : i + 1}`, depth, false, out, true);
      });
    }
    if (node.items && typeof node.items === 'object' && !node.items.$ref && !this.simple(node.items)) this.children(node.items, `${path}[]`, depth, out);
    const ap = node.additionalProperties;
    if (ap && typeof ap === 'object' && !ap.$ref && !this.simple(ap)) this.children(ap, `${path}{}`, depth, out);
  }

  row(name: string, node: any, path: string, depth: number, required: boolean, out: Row[], variant = false) {
    const parts = this.type(node);
    out.push({ path, name, depth, typeHtml: html(parts), typeText: text(parts), required, notes: this.notes(node), description: node?.description,
      id: depth === 0 && !variant ? 'field-' + name : undefined });
    this.children(node, path, depth + 1, out);
  }

  rows(node: any) { const out: Row[] = []; this.children(node, '', 0, out); return out; }

  sections(): Section[] {
    const s = this.v.schema, defs: Record<string, any> = s.$defs ?? {};
    const out: Section[] = [];
    if (s.properties) out.push({ name: 'Fields', id: 'fields', kind: 'fields', description: s.description, tables: [{ rows: this.rows(s), summary: this.notes(s).join(' · ') }] });
    if (this.v.kind.id === 'ipc') {
      const methods = Object.keys(defs).filter(n => n.endsWith('.params') && defs[n.replace(/\.params$/, '.result')]).map(n => n.slice(0, -7));
      const notes = Object.keys(defs).filter(n => n.endsWith('.notification')).map(n => n.slice(0, -13));
      const used = new Set<string>();
      for (const m of methods) {
        ['params', 'result', 'request', 'response'].forEach(x => used.add(`${m}.${x}`));
        out.push({ name: m, id: anchor(m), kind: 'method', aliases: ['params', 'result', 'request', 'response'].map(x => anchor(`${m}.${x}`)), tables: [
          { label: 'params', rows: this.rows(defs[`${m}.params`]), summary: html(this.type(defs[`${m}.params`])) },
          { label: 'result', rows: this.rows(defs[`${m}.result`]), summary: html(this.type(defs[`${m}.result`])) }] });
      }
      for (const n of notes) {
        used.add(`${n}.notification`);
        const params = defs[`${n}.params`] ?? defs[`${n}.notification`].properties?.params;
        if (defs[`${n}.params`]) used.add(`${n}.params`);
        out.push({ name: n, id: anchor(n), kind: 'notification', aliases: [anchor(`${n}.notification`), ...(defs[`${n}.params`] ? [anchor(`${n}.params`)] : [])], tables: [{ label: 'params', rows: this.rows(params), summary: html(this.type(params)) }] });
      }
      for (const [name, def] of Object.entries(defs)) if (!used.has(name))
        out.push({ name, id: anchor(name), kind: ['request', 'response', 'notification', 'error'].includes(name) ? 'envelope' : 'def',
          description: def.description, tables: [{ rows: this.rows(def), summary: html(this.type(def)) + (this.notes(def).length ? ' · ' + this.notes(def).join(' · ') : '') }] });
    } else {
      for (const [name, def] of Object.entries(defs))
        out.push({ name, id: anchor(name), kind: 'def', description: def.description,
          tables: [{ rows: this.rows(def), summary: html(this.type(def)) + (this.notes(def).length ? ' · ' + this.notes(def).join(' · ') : '') }] });
    }
    return out;
  }
}

// ---------------------------------------------------------------- diffs

export interface DiffEntry { section: string; id?: string; status: 'added' | 'removed' | 'changed'; changes: { path: string; status: 'added' | 'removed' | 'changed'; before?: string; after?: string; detail?: string }[] }
export interface Diff { from: SchemaVersion; entries: DiffEntry[]; rootChanged: boolean }

const sig = (r: Row) => `${r.typeText}${r.required ? ' (required)' : ''}${r.notes.length ? ' · ' + r.notes.join(' · ').replace(/<[^>]+>/g, '') : ''}`;
const sectionSig = (s: Section) => s.tables.map(t => `${t.label ?? ''}:${(t.summary ?? '').replace(/<[^>]+>/g, '')}`).join('|');

/** Summarise a changed signature: enum values added/removed, else old → new. */
function describe(before: string, after: string) {
  const parts = (x: string) => { const [type, ...rest] = x.split(' · '); return { type, rest: rest.join(' · ') }; };
  const a = parts(before), b = parts(after);
  const values = (t: string) => t.replace(/ \(required\)$/, '').split(' | ');
  const va = values(a.type), vb = values(b.type);
  if (va.length > 1 && vb.length > 1 && a.rest === b.rest && a.type.endsWith('(required)') === b.type.endsWith('(required)')) {
    const added = vb.filter(x => !va.includes(x)), removed = va.filter(x => !vb.includes(x));
    return [added.length && `adds ${added.join(', ')}`, removed.length && `removes ${removed.join(', ')}`].filter(Boolean).join('; ') || undefined;
  }
  return undefined;
}

function flatten(s: Section) {
  const m = new Map<string, string>();
  for (const t of s.tables) for (const r of t.rows) m.set((t.label ? t.label + '.' : '') + r.path, sig(r));
  return m;
}

export function diff(prev: SchemaVersion, next: SchemaVersion): Diff {
  const a = new Renderer(prev).sections(), b = new Renderer(next).sections();
  const key = (s: Section) => `${s.kind === 'method' ? 'method' : s.kind === 'notification' ? 'notification' : s.kind === 'fields' ? 'fields' : 'type'}:${s.name}`;
  const label = (s: Section) => s.kind === 'method' ? `method ${s.name}` : s.kind === 'notification' ? `notification ${s.name}` : s.kind === 'fields' ? 'top-level fields' : s.name;
  const before = new Map(a.map(s => [key(s), s])), after = new Map(b.map(s => [key(s), s]));
  const entries: DiffEntry[] = [];
  for (const [k, s] of after) {
    const old = before.get(k);
    if (!old) { entries.push({ section: label(s), id: s.id, status: 'added', changes: [] }); continue; }
    const fa = flatten(old), fb = flatten(s);
    const changes: DiffEntry['changes'] = [];
    for (const [p, v] of fb) {
      if (!fa.has(p)) changes.push({ path: p, status: 'added', after: v });
      else if (fa.get(p) !== v) changes.push({ path: p, status: 'changed', before: fa.get(p), after: v, detail: describe(fa.get(p)!, v) });
    }
    for (const [p, v] of fa) if (!fb.has(p)) changes.push({ path: p, status: 'removed', before: v });
    if (!changes.length && sectionSig(old) !== sectionSig(s)) changes.push({ path: '(definition)', status: 'changed', before: sectionSig(old), after: sectionSig(s) });
    if (changes.length) entries.push({ section: label(s), id: s.id, status: 'changed', changes });
  }
  for (const [k, s] of before) if (!after.has(k)) entries.push({ section: label(s), status: 'removed', changes: [] });
  const strip = (x: any) => JSON.stringify((x ?? []).map((r: any) => (r.$ref ?? '').replace(/^.*#/, '#')));
  const rootChanged = strip(prev.schema.anyOf) !== strip(next.schema.anyOf) && next.kind.id !== 'ipc';
  const order = { added: 0, changed: 1, removed: 2 };
  entries.sort((x, y) => order[x.status] - order[y.status] || x.section.localeCompare(y.section));
  return { from: prev, entries, rootChanged };
}
