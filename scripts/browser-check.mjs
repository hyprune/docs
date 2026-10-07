import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('dist');
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.woff2':'font/woff2'};
const server = createServer(async (req,res) => {
  try {
    let file = resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if (!file.startsWith(root+'/') && file !== root) {res.writeHead(403).end();return;}
    if ((await stat(file)).isDirectory()) file += '/index.html';
    res.setHeader('Content-Type',mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.writeHead(404).end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH === 'playwright' ? {} : {executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium'}),args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);});
  await mkdir('artifacts',{recursive:true});
  for (const [path,name,theme] of [['/','landing-dark','dark'],['/architecture/','architecture-light','light'],['/rfcs/0003-ipc/','ipc-dark','dark']]) {
    await page.goto(base+path,{waitUntil:'networkidle'});
    await page.locator('starlight-theme-select select').first().selectOption(theme);
    assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
    assert.ok(await page.locator('h1').innerText());
    await page.screenshot({path:`artifacts/${name}.png`,fullPage:true});
  }
  await page.goto(base+'/architecture/',{waitUntil:'networkidle'});
  assert.equal(await page.locator('svg.diagram').count(),2);
  const diagram = await page.locator('svg.diagram').first().boundingBox();
  assert.ok(diagram.width > 400);
  await page.getByRole('button',{name:/Search/}).first().click();
  await page.locator('.pagefind-ui__search-input').fill('lightmaps');
  await page.locator('.pagefind-ui__result-link').first().waitFor();
  assert.ok(await page.locator('.pagefind-ui__result-link').count() > 0);
  await page.screenshot({path:'artifacts/search.png'});
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  for (const path of ['/','/architecture/','/rfcs/0003-ipc/']) {
    await page.goto(base+path,{waitUntil:'networkidle'});
    const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow,false,`mobile overflow ${path}`);
  }
  await page.screenshot({path:'artifacts/ipc-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: landing, diagrams, RFC, themes, live search, mobile widths; no page errors or failed requests.');
} finally {
  await browser?.close();
  await new Promise(r=>server.close(r));
}
