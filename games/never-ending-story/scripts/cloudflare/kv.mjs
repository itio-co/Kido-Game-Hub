import fs from 'fs';
const files=JSON.parse(fs.readFileSync('files.json'));
const mime={js:'application/javascript; charset=utf-8',css:'text/css; charset=utf-8',html:'text/html; charset=utf-8',json:'application/json; charset=utf-8',jpg:'image/jpeg',png:'image/png',ttf:'font/ttf',glb:'model/gltf-binary',webp:'image/webp',svg:'image/svg+xml',webmanifest:'application/manifest+json',txt:'text/plain; charset=utf-8',woff2:'font/woff2',mp3:'audio/mpeg'};
let chunks=[],cur=[],sz=0;
for(const [k,f] of Object.entries(files)){ if(sz+f.b64.length>2.2e6&&cur.length){chunks.push(cur);cur=[];sz=0;} cur.push({key:k.replace(/^\/never/,''),value:f.b64,base64:true,metadata:{ct:mime[f.ext]||'application/octet-stream',h:f.hash}}); sz+=f.b64.length;}
chunks.push(cur);
chunks.forEach((c,i)=>fs.writeFileSync(`kv${i}.js`,`async () => { const r=await cloudflare.request({method:'PUT',path:'/accounts/'+accountId+'/storage/kv/namespaces/fd398000ddb740198d25474d340f9d13/bulk',body:${JSON.stringify(c)}}); return {ok:r.success, n:${c.length}, res:r.result}; }`));
console.log(chunks.length);
