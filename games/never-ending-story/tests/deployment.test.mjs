import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
import { normalizeAppBase, partitionKey, appStorage } from '../src/lib/deployment.ts';
const bundle = await rolldown({ input: 'worker/index.ts' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
const values = new Map();
globalThis.localStorage = { getItem:k=>values.get(k) ?? null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k) };
let selected='/never';
globalThis.document = { querySelector:()=>({content:selected}) };
appStorage.setItem('save','production'); selected='/dev/never';
assert.equal(appStorage.getItem('save'),null);appStorage.setItem('save','dev');
assert.equal(values.get('save'),'production');appStorage.removeItem('save');assert.equal(values.get('save'),'production');
assert.notEqual(partitionKey('x','/never/dev'),partitionKey('x','/dev/never'));
for(const bad of ['/never/','/never/../dev','/never?x','//never','/NEVER','/never/<script>'])assert.throws(()=>normalizeAppBase(bad));
const html='<html><head><script src="./assets/main.js"></script></head><body>test</body></html>';
const kv={ async getWithMetadata(key) { return {value: ['/index.html','/god.html'].includes(key) ? new TextEncoder().encode(html).buffer : null,metadata:{ct:'text/html',h:'test'}}; } };
const req=(base,path,init)=>new Request('https://games.itio.space'+base+path,init);
for(const base of ['/never','/never/dev','/dev/never']){
 const statement={bind(){return this},async first(){return null},async run(){return {meta:{changes:1}}}};
 const env={APP_BASE:base,ASSETS_KV:kv,DB:{prepare(){return statement}},GOD_ADMIN_PASSWORD:'test-only-password'};
 assert.equal((await worker.fetch(req(base,''),env)).headers.get('location'),'https://games.itio.space'+base+'/');
 const game=await worker.fetch(req(base,'/'),env);assert.equal(game.status,200);assert.match(await game.text(),new RegExp(`content="${base}"`));
 const god=await worker.fetch(req(base,'/god/modules/core'),env);assert.equal(god.status,200);assert.ok((await god.text()).includes(`src="${base}/assets/main.js"`));
 assert.equal((await worker.fetch(req(base,'/modules.json'),env)).status,404);
 const login=await worker.fetch(req(base,'/api/god/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'test-only-password'})}),env);
 assert.equal(login.status,200); const token=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await worker.fetch(req(base,'/api/god/me',{headers:{cookie:token}}),env)).status,200);
 if(base!='/never')assert.equal((await worker.fetch(req(base,'/api/god/me',{headers:{cookie:token.replace(/^[^=]+=/,'nes_god=')}}),env)).status,401);
 const logout=await worker.fetch(req(base,'/api/god/logout',{method:'POST'}),env);assert.ok(logout.headers.get('set-cookie').includes(`Path=${base};`));
 if(base!='/never'){
  assert.ok(!logout.headers.get('set-cookie').startsWith('nes_god='));
  const sw=await worker.fetch(req(base,'/sw.js'),env);assert.equal(sw.status,200);const script=await sw.text();assert.ok(!script.includes('caches'));assert.ok(script.includes('clients.claim'));
  assert.equal((await worker.fetch(req('/never','/api/god/me'),env)).status,404);
 }
}
assert.equal((await worker.fetch(req('/never','/'),{APP_BASE:'/bad/../base'})).status,500);
// Source guard: every application localStorage call goes through the partition adapter.
import fs from 'node:fs';import path from 'node:path';
function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);if(fs.statSync(p).isDirectory())walk(p);else if(/\.(ts|svelte)$/.test(p)&&!p.endsWith('deployment.ts'))assert.ok(!/\blocalStorage\./.test(fs.readFileSync(p,'utf8')),p);}}
walk('src');
console.log('deployment routing, cookies, storage and service-worker isolation passed');
