import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('dist');
const files = [];
function walk(dir) { for (const e of readdirSync(dir, {withFileTypes:true})) e.isDirectory() ? walk(join(dir,e.name)) : files.push(join(dir,e.name)); }
walk(root);
const errors = [];
for (const file of files.filter(f => f.endsWith('.html'))) {
  const html = readFileSync(file,'utf8');
  const base = new URL('/'+relative(root,file).replace(/index\.html$/, ''), 'https://hyprune.com');
  for (const [tag, attr, raw] of html.matchAll(/<[^>]*?\b(href|src)="([^"]+)"[^>]*>/g)) {
    if (/rel="canonical"/.test(tag)) continue; // 404 canonical is metadata, not navigation.
    const value = raw.replace(/&amp;/g,'&');
    if (/^(mailto:|data:|javascript:)/.test(value)) continue;
    const url = new URL(value,base);
    if (url.origin !== base.origin) continue;
    const path = decodeURIComponent(url.pathname);
    const target = join(root,path.endsWith('/') ? path+'index.html' : path);
    if (!existsSync(target)) { errors.push(`${relative(root,file)}: missing ${attr} ${value}`); continue; }
    if (attr === 'href' && url.hash && target.endsWith('.html')) {
      const anchor = decodeURIComponent(url.hash.slice(1));
      if (!readFileSync(target,'utf8').includes(`id="${anchor}"`)) errors.push(`${relative(root,file)}: missing anchor ${value}`);
    }
  }
}
const manifest = JSON.parse(readFileSync('public/schema/source.json','utf8'));
for (const [name, expected] of Object.entries(manifest.files)) {
  for (const dir of ['public','dist']) {
    const hash = createHash('sha256').update(readFileSync(`${dir}/schema/v0/${name}`)).digest('hex');
    if (hash !== expected) errors.push(`${dir}: schema mirror mismatch ${name}`);
  }
}
if (readFileSync('dist/CNAME','utf8').trim() !== 'hyprune.com') errors.push('CNAME mismatch');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Checked local links/assets in ${files.filter(f=>f.endsWith('.html')).length} pages, CNAME and ${Object.keys(manifest.files).length} schema mirrors.`);

for(const version of ['v0.2','v0.3','v0.4','v0.5','v0.6']) {
 const manifest=JSON.parse(readFileSync(`public/schema/${version}/source.json`,'utf8'));
 for(const [name,expected] of Object.entries(manifest.files)) for(const dir of ['public','dist']) {
  const actual=createHash('sha256').update(readFileSync(`${dir}/schema/${version}/${name}`)).digest('hex');
  if(actual!==expected) throw new Error(`Schema mirror mismatch: ${version}/${name}`);
 }
}
