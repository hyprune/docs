import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const source = resolve(process.argv[2] || '../schema');
const git = (...args) => execFileSync('git', ['-C', source, ...args], {encoding:'utf8'}).trim();
if (git('status','--porcelain','--','v0','v0.2','v0.3')) throw new Error('Commit the schema contract tree before mirroring it');
const target = new URL('../public/schema/v0/', import.meta.url);
mkdirSync(target, {recursive:true});
for (const file of readdirSync(target)) if (file.endsWith('.schema.json')) rmSync(new URL(file, target));
const files = {};
for (const file of readdirSync(join(source,'v0')).sort()) {
  if (!file.endsWith('.schema.json')) continue;
  const bytes = readFileSync(join(source,'v0',file));
  writeFileSync(new URL(file, target), bytes);
  files[file] = createHash('sha256').update(bytes).digest('hex');
}
writeFileSync(new URL('../public/schema/source.json', import.meta.url), JSON.stringify({repository:'https://github.com/hyprune/schema',commit:git('rev-parse','HEAD'),files},null,2)+'\n');
console.log(`Mirrored ${Object.keys(files).length} schemas from ${git('rev-parse','--short','HEAD')}`);

for (const version of ['v0.2','v0.3']) {
 const target=new URL(`../public/schema/${version}/`,import.meta.url);
 mkdirSync(target,{recursive:true});
 const files={};
 for(const file of readdirSync(join(source,version)).sort()) {
  if(!file.endsWith('.schema.json'))continue;
  const bytes=readFileSync(join(source,version,file));writeFileSync(new URL(file,target),bytes);
  files[file]=createHash('sha256').update(bytes).digest('hex');
 }
 writeFileSync(new URL('source.json',target),JSON.stringify({repository:'https://github.com/hyprune/schema',commit:git('rev-parse','HEAD'),files},null,2)+'\n');
}
