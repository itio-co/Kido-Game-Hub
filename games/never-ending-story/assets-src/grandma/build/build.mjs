// Builds public/models/grandma-mali.glb from the raw Meshy downloads in ../meshy/raw/ (git-ignored):
// rigged mesh + named clips (Idle, Wave, SitDown, SitIdle, SitTalk, Walk), 1024 JPEG texture, quantized.
// Usage (see ../README.md): python texture.py && npm i && node build.mjs [--tris N [--bake]] [out.glb]
//   --tris N  low-poly LOD: QEM-simplify the skinned mesh to ~N triangles with meshoptimizer, keeping the
//             skeleton, skin weights and every clip. Without --bake the original UVs / texture are kept
//             (UV-aware; collapses across Meshy's UV seams leave small texture specks, more below ~6k).
//   --bake    (used for all LODs) weld by position, simplify ignoring UVs, then bake.py re-unwraps (xatlas) and
//             re-bakes the 2048 texture onto the low-poly mesh (python with requirements.txt; PYTHON=... to pick one).
//   npm run lods  builds the comparison LODs grandma-mali-{6k,3k,1k5}.glb next to the original.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,resample,quantize,weld,compactPrimitive} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {execFileSync} from 'child_process';
import {fileURLToPath} from 'url';
const HERE=fileURLToPath(new URL('.', import.meta.url));
const R=HERE+'../meshy/raw/', R2=R;
const args=process.argv.slice(2); const ti=args.indexOf('--tris');
const TRIS=ti>=0?Number(args.splice(ti,2)[1]):0;
const bi=args.indexOf('--bake'); const BAKE=bi>=0; if(BAKE) args.splice(bi,1);
const ri=args.indexOf('--remesh'); const REMESH=ri>=0; if(REMESH) args.splice(ri,1);
const OUT=args[0]||HERE+'../../../public/models/grandma-mali.glb';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(R+'Character_output.glb'); const root=doc.getRoot(); const buf=root.listBuffers()[0];
const SRC_TEX=root.listTextures()[0].getImage(); // Meshy's 2048 base colour (bake source)
for(const a of root.listAnimations()) a.dispose();
const byName=new Map(root.listNodes().map(n=>[n.getName(),n]));
const CM=100; // Armature scale 0.01: Hips translation is in cm, world metres = cm / 100.
// Seated anchor = SitDown's last-frame hips position (world m), facing +X (Meshy's Step to Sit turns 90 deg).
const ANCHOR={x:-0.350,z:0.903};
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const slerp=(a,b,t)=>{let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]; if(d<0){b=b.map(x=>-x);d=-d;} if(d>0.9995){const r=a.map((x,i)=>x+(b[i]-x)*t);const l=Math.hypot(...r);return r.map(x=>x/l);} const th=Math.acos(d),s=Math.sin(th);return a.map((x,i)=>(Math.sin((1-t)*th)*x+Math.sin(t*th)*b[i])/s);};
/** spec: {yawDeg, hipsTarget:{x,z} (world m, applied after yaw, measured from hips at t0), dy (m), trim:[t0,t1], loopBlend (s)} */
async function addClips(file, pick){
  const s=await io.read(file);
  for(const a of s.getRoot().listAnimations()){
    const spec=pick[a.getName()]; if(!spec) continue;
    const na=doc.createAnimation(spec.name);
    const yaw=(spec.yawDeg||0)*Math.PI/180, qy=[0,Math.sin(yaw/2),0,Math.cos(yaw/2)], c=Math.cos(yaw), sn=Math.sin(yaw);
    const rotY=(x,z)=>[x*c+z*sn, -x*sn+z*c];
    // Hips xz shift so the hips at the reference time land on hipsTarget.
    let shift=[0,0];
    const hipsT=a.listChannels().find(ch=>ch.getTargetNode().getName()==='Hips'&&ch.getTargetPath()==='translation');
    if(spec.hipsTarget){const o=hipsT.getSampler().getOutput().getArray(); const [x,z]=rotY(o[0]/CM,o[2]/CM); shift=[spec.hipsTarget.x-x, spec.hipsTarget.z-z];}
    for(const ch of a.listChannels()){
      const tn=byName.get(ch.getTargetNode().getName()); const sm=ch.getSampler(); const path=ch.getTargetPath();
      let inp=Array.from(sm.getInput().getArray()); const out=sm.getOutput().getArray(); const n=out.length/inp.length;
      let vals=inp.map((_,i)=>Array.from(out.slice(i*n,i*n+n)));
      if(spec.trim){const [t0,t1]=spec.trim; const keep=inp.map((t,i)=>t>=t0-1e-4&&t<=t1+1e-4); vals=vals.filter((_,i)=>keep[i]); inp=inp.filter((_,i)=>keep[i]).map(t=>t-t0);}
      if(tn.getName()==='Hips'){
        if(path==='rotation') vals=vals.map(q=>qmul(qy,q));
        if(path==='translation') vals=vals.map(([x,y,z])=>{const [rx,rz]=rotY(x/CM,z/CM); return [(rx+shift[0])*CM, y+(spec.dy||0)*CM, (rz+shift[1])*CM];});
      }
      if(spec.loopBlend){ // ease the tail back to frame 0 so the trimmed clip loops without a pop
        const T=inp[inp.length-1], B=spec.loopBlend, first=vals[0];
        vals=vals.map((v,i)=>{const w=Math.min(1,Math.max(0,(inp[i]-(T-B))/B)); if(w<=0) return v; const k=w*w*(3-2*w);
          return path==='rotation'?slerp(v,first,k):v.map((x,j)=>x+(first[j]-x)*k);});
      }
      const ia=doc.createAccessor().setType('SCALAR').setArray(new Float32Array(inp)).setBuffer(buf);
      const oa=doc.createAccessor().setType(n===4?'VEC4':'VEC3').setArray(new Float32Array(vals.flat())).setBuffer(buf);
      const ns=doc.createAnimationSampler().setInput(ia).setOutput(oa).setInterpolation(sm.getInterpolation());
      na.addSampler(ns); na.addChannel(doc.createAnimationChannel().setTargetNode(tn).setTargetPath(path).setSampler(ns));
    }
    console.log(a.getName(),'->',spec.name,'channels',na.listChannels().length,'shift',shift.map(v=>v.toFixed(3)));
  }
}
const SIT_DY=Number(process.env.SIT_DY_IDLE??-0.03), TALK_DY=Number(process.env.SIT_DY_TALK??-0.04);
const A1=R+'grandma-anims-idle3-chairsit-wave.glb', A2=R2+'grandma-anims-steptosit-sittalk.glb';
/** QEM simplification of the (single) skinned primitive to ~target triangles. Surviving vertices keep their
 *  original JOINTS_0/WEIGHTS_0, so the rig and all clips keep working. */
async function simplifyTo(target){
  await MeshoptSimplifier.ready;
  await doc.transform(weld());
  for(const mesh of root.listMeshes()) for(const prim of mesh.listPrimitives()){
    const pos=prim.getAttribute('POSITION'), uv=prim.getAttribute('TEXCOORD_0'), nrm=prim.getAttribute('NORMAL');
    const n=pos.getCount(), idx=prim.getIndices();
    let indices=new Uint32Array(idx.getArray());
    const P=new Float32Array(pos.getArray());
    const hi=BAKE?{pos:P.slice(), idx:indices.slice(), uv:new Float32Array(uv.getArray())}:null;
    if(BAKE){ // one vertex per position: UV seams no longer block collapses (the texture is re-baked below)
      const first=new Map(), remap=new Uint32Array(n);
      for(let i=0;i<n;i++){const k=`${P[i*3]},${P[i*3+1]},${P[i*3+2]}`; if(!first.has(k)) first.set(k,i); remap[i]=first.get(k);}
      indices=indices.map(i=>remap[i]);
    }
    // Attribute stream: uv (2) + normal (3). The UV weight keeps texture details (face) from swimming, a light
    // normal weight keeps creases a bit longer. Permissive is needed either way: the Meshy mesh has non-manifold
    // spots and 17k of 21k vertices on UV seams, which otherwise stop the simplifier at ~6.5k (UVs) or ~12k (welded).
    const A=new Float32Array(n*5), u=[0,0], v3=[0,0,0];
    for(let i=0;i<n;i++){ uv.getElement(i,u); nrm.getElement(i,v3); A.set([u[0],u[1],v3[0],v3[1],v3[2]],i*5); }
    const W=BAKE?[0,0,0.5,0.5,0.5]:[1,1,0.25,0.25,0.25];
    const FLAGS=['Permissive','RegularizeLight'];
    const before=indices.length/3;
    const [out,err]=MeshoptSimplifier.simplifyWithAttributes(indices,P,3,A,5,W,null,target*3,1,FLAGS);
    idx.setArray(n<65536?new Uint16Array(out):out);
    compactPrimitive(prim);
    console.log(`simplify ${mesh.getName()}: ${before} -> ${out.length/3} tris, verts ${n} -> ${prim.getAttribute('POSITION').getCount()}, rel. error ${err.toFixed(4)}`);
    if(BAKE) bakeTexture(prim, hi);
  }
}
/** Re-unwrap the simplified primitive and re-bake the texture with bake.py (see there). */
function bakeTexture(prim, hi){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grandma-bake-'));
  const lo=prim.getAttribute('POSITION');
  fs.writeFileSync(path.join(dir,'hi_pos.bin'),hi.pos); fs.writeFileSync(path.join(dir,'hi_idx.bin'),hi.idx);
  fs.writeFileSync(path.join(dir,'hi_uv.bin'),hi.uv); fs.writeFileSync(path.join(dir,'src_tex'),SRC_TEX);
  fs.writeFileSync(path.join(dir,'lo_pos.bin'),new Float32Array(lo.getArray()));
  fs.writeFileSync(path.join(dir,'lo_idx.bin'),new Uint32Array(prim.getIndices().getArray()));
  execFileSync(process.env.PYTHON||'python3',[HERE+'bake.py',dir,'1024'],{stdio:'inherit'});
  const rd=(f,T)=>{const b=fs.readFileSync(path.join(dir,f)); return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
  const vmap=rd('out_vmap.bin',Uint32Array), nidx=rd('out_idx.bin',Uint32Array), nuv=rd('out_uv.bin',Float32Array);
  for(const sem of prim.listSemantics()){
    const acc=prim.getAttribute(sem), es=acc.getElementSize(), src=acc.getArray();
    const dst=new src.constructor(vmap.length*es);
    for(let i=0;i<vmap.length;i++) for(let k=0;k<es;k++) dst[i*es+k]=src[vmap[i]*es+k];
    acc.setArray(sem==='TEXCOORD_0'?Float32Array.from(nuv):dst);
  }
  prim.getIndices().setArray(vmap.length<65536?Uint16Array.from(nidx):Uint32Array.from(nidx));
  BAKED_TEX=fs.readFileSync(path.join(dir,'out_tex.jpg'));
  fs.rmSync(dir,{recursive:true,force:true});
}
/** Replace the skinned mesh geometry with a Meshy Remesh GLB (../meshy/raw/grandma-remesh-6k.glb),
 *  transferring JOINTS_0 / WEIGHTS_0 from the rigged mesh via remesh.py so the 24-joint rig and clips work. */
function applyRemesh(){
  for(const mesh of root.listMeshes()) for(const prim of mesh.listPrimitives()){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grandma-remesh-'));
    fs.writeFileSync(path.join(dir,'hi_pos.bin'),new Float32Array(prim.getAttribute('POSITION').getArray()));
    fs.writeFileSync(path.join(dir,'hi_idx.bin'),new Uint32Array(prim.getIndices().getArray()));
    fs.writeFileSync(path.join(dir,'hi_j.bin'),new Uint8Array(prim.getAttribute('JOINTS_0').getArray()));
    fs.writeFileSync(path.join(dir,'hi_w.bin'),new Float32Array(prim.getAttribute('WEIGHTS_0').getArray()));
    execFileSync(process.env.PYTHON||'python3',[HERE+'remesh.py',dir,R+'grandma-remesh-6k.glb'],{stdio:'inherit'});
    const rd=(f,T)=>{const b=fs.readFileSync(path.join(dir,f)); return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
    const npos=Float32Array.from(rd('out_pos.bin',Float32Array));
    const nnrm=Float32Array.from(rd('out_nrm.bin',Float32Array));
    const nuv=Float32Array.from(rd('out_uv.bin',Float32Array));
    const nj=Uint8Array.from(rd('out_j.bin',Uint8Array));
    const nw=Float32Array.from(rd('out_w.bin',Float32Array));
    const nidx=rd('out_idx.bin',Uint32Array);
    const tng=prim.getAttribute('TANGENT'); if(tng){prim.setAttribute('TANGENT',null); tng.dispose();}
    prim.getAttribute('POSITION').setArray(npos);
    prim.getAttribute('NORMAL').setArray(nnrm);
    prim.getAttribute('TEXCOORD_0').setArray(nuv);
    prim.getAttribute('JOINTS_0').setArray(nj);
    prim.getAttribute('WEIGHTS_0').setArray(nw);
    prim.getIndices().setArray(npos.length/3<65536?Uint16Array.from(nidx):Uint32Array.from(nidx));
    BAKED_TEX=fs.readFileSync(path.join(dir,'out_tex.jpg'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
let BAKED_TEX=null;
// Clip order in the file: Idle, Wave, SitDown, SitIdle, SitTalk, Walk.
await addClips(A1,{Idle_3:{name:'Idle'}});
await addClips(A1,{Wave_One_Hand:{name:'Wave'}});
await addClips(A2,{Step_to_Sit_Transition:{name:'SitDown'}});
await addClips(A1,{Chair_Sit_Idle_F:{name:'SitIdle',trim:[0,3.7],loopBlend:0.6,yawDeg:90,hipsTarget:ANCHOR,dy:SIT_DY}});
await addClips(A2,{Sitting_Answering_Questions:{name:'SitTalk',yawDeg:90,hipsTarget:ANCHOR,dy:TALK_DY}});
await addClips(R+'Animation_Walking_withSkin.glb',{'Armature|walking_man|baselayer':{name:'Walk'}});
// names
for(const n of root.listNodes()){ if(n.getName()==='char1') n.setName('GrandmaMali_Body'); if(n.getName()==='Armature') n.setName('GrandmaMali_Armature'); }
for(const m of root.listMeshes()) m.setName('GrandmaMali_Body');
for(const m of root.listMaterials()) m.setName('GrandmaMali');
root.listScenes()[0].setName('GrandmaMali_Scene');
const tex=root.listTextures()[0]; tex.setImage(fs.readFileSync(R+'texture-1024.jpg')).setMimeType('image/jpeg').setName('GrandmaMali_BaseColor');
if(TRIS) await simplifyTo(TRIS);
if(REMESH) applyRemesh();
if(BAKED_TEX) tex.setImage(BAKED_TEX);
await doc.transform(resample(),dedup(),prune(),quantize());
await io.write(OUT,doc);
console.log(OUT, fs.statSync(OUT).size, root.listAnimations().map(a=>a.getName()));
