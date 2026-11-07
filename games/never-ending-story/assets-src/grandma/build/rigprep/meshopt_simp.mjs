import fs from 'fs';
import { MeshoptSimplifier } from '/workspace/grandma-pr/games/never-ending-story/assets-src/grandma/build/node_modules/meshoptimizer/index.js';
await MeshoptSimplifier.ready;
const [,, dir, target] = process.argv;
const rd=(f,T)=>{const b=fs.readFileSync(dir+'/'+f);return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
const pos=rd('pos.bin',Float32Array), attr=rd('attr.bin',Float32Array), idx=rd('idx.bin',Uint32Array);
const [out,err]=MeshoptSimplifier.simplifyWithAttributes(idx,pos,3,attr,2,[1.5,1.5],null,(+target)*3,0.5,['LockBorder']);
fs.writeFileSync(dir+'/out.bin',Buffer.from(out.buffer,out.byteOffset,out.byteLength));
console.log('meshopt',idx.length/3,'->',out.length/3,'err',err.toFixed(5));
