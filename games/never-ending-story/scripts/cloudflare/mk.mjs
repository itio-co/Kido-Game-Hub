import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const root='/workspace/kgh/games/never-ending-story/dist'; const files={};
const walk=d=>{for(const f of fs.readdirSync(d)){const p=path.join(d,f); if(fs.statSync(p).isDirectory()) walk(p); else { const rel='/never/'+path.relative(root,p); const b=fs.readFileSync(p); const b64=b.toString('base64'); const ext=path.extname(p).slice(1); const hash=crypto.createHash('sha256').update(b64+ext).digest('hex').slice(0,32); files[rel]={hash,size:b.length,b64,ext};}}};
walk(root);
const manifest=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,{hash:v.hash,size:v.size}]));
fs.writeFileSync('files.json',JSON.stringify(files));
fs.writeFileSync('session.js',`async () => { const r = await cloudflare.request({method:'POST',path:'/accounts/'+accountId+'/workers/scripts/nes-game/assets-upload-session',body:{manifest:${JSON.stringify(manifest)}}}); return r.result; }`);
