// Builds public/models/grandma-mali*.glb from the raw Meshy downloads in ../meshy/raw/ or ../meshy/raw-bigface/ (git-ignored):
// rigged mesh + named clips (Idle, Wave, SitDown, SitIdle, SitTalk, Walk), JPEG texture (+ optional PBR maps), quantized.
// Usage (see ../README.md): python texture.py && npm i && node build.mjs [--raw <dir>] [--pbr] [--tris N [--bake]] [--remesh [file]] [out.glb]
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
const args=process.argv.slice(2);
const rwi=args.indexOf('--raw');
const R=rwi>=0?path.resolve(HERE,args.splice(rwi,2)[1])+'/':HERE+'../meshy/raw/', R2=R;
const pi=args.indexOf('--pbr'); const PBR=pi>=0; if(PBR) args.splice(pi,1);
const txi=args.indexOf('--tex'); const TEX_SZ=txi>=0?String(args.splice(txi,2)[1]):(PBR?'2048':'1024');
const ti=args.indexOf('--tris');
const TRIS=ti>=0?Number(args.splice(ti,2)[1]):0;
const bi=args.indexOf('--bake'); const BAKE=bi>=0; if(BAKE) args.splice(bi,1);
const pmi=args.indexOf('--parametric'); const PARAMETRIC=pmi>=0; if(PARAMETRIC) args.splice(pmi,1);
const h19i=args.indexOf('--head19k'); const HEAD19K=h19i>=0; if(HEAD19K) args.splice(h19i,1);
const npbri=args.indexOf('--nopbr-raw'); const NOPBR_RAW=npbri>=0; if(NOPBR_RAW) args.splice(npbri,1);
const tripoi=args.indexOf('--tripo'); const TRIPO_TRIS=tripoi>=0?Number(args.splice(tripoi,2)[1]):0;
const ri=args.indexOf('--remesh');
let REMESH_FILE='';
if(ri>=0){
  if(args[ri+1] && !args[ri+1].startsWith('--') && args.length-ri>2) REMESH_FILE=args.splice(ri,2)[1];
  else { args.splice(ri,1); REMESH_FILE=fs.existsSync(R+'grandma-bigface-remesh-6k.glb')?R+'grandma-bigface-remesh-6k.glb':R+'grandma-remesh-6k.glb'; }
}
const REMESH=!!REMESH_FILE;
const OUT=args[0]||HERE+'../../../public/models/grandma-mali.glb';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(R+'Character_output.glb'); const root=doc.getRoot(); const buf=root.listBuffers()[0];
const mat0=root.listMaterials()[0];
const SRC_TEX=(mat0.getBaseColorTexture()||root.listTextures()[0]).getImage();
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
      if(spec.loopBlend){
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
/** QEM simplification of the (single) skinned primitive to ~target triangles. */
async function simplifyTo(target){
  await MeshoptSimplifier.ready;
  await doc.transform(weld());
  for(const mesh of root.listMeshes()) for(const prim of mesh.listPrimitives()){
    const pos=prim.getAttribute('POSITION'), uv=prim.getAttribute('TEXCOORD_0'), nrm=prim.getAttribute('NORMAL');
    const n=pos.getCount(), idx=prim.getIndices();
    let indices=new Uint32Array(idx.getArray());
    const P=new Float32Array(pos.getArray());
    const hi=BAKE?{pos:P.slice(), idx:indices.slice(), uv:new Float32Array(uv.getArray())}:null;
    if(BAKE){
      const first=new Map(), remap=new Uint32Array(n);
      for(let i=0;i<n;i++){const k=`${P[i*3]},${P[i*3+1]},${P[i*3+2]}`; if(!first.has(k)) first.set(k,i); remap[i]=first.get(k);}
      indices=indices.map(i=>remap[i]);
    }
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
/** Re-unwrap the simplified primitive and re-bake the texture with bake.py. */
function bakeTexture(prim, hi){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grandma-bake-'));
  const lo=prim.getAttribute('POSITION');
  fs.writeFileSync(path.join(dir,'hi_pos.bin'),hi.pos); fs.writeFileSync(path.join(dir,'hi_idx.bin'),hi.idx);
  fs.writeFileSync(path.join(dir,'hi_uv.bin'),hi.uv); fs.writeFileSync(path.join(dir,'src_tex'),SRC_TEX);
  fs.writeFileSync(path.join(dir,'lo_pos.bin'),new Float32Array(lo.getArray()));
  fs.writeFileSync(path.join(dir,'lo_idx.bin'),new Uint32Array(prim.getIndices().getArray()));
  execFileSync(process.env.PYTHON||'/workspace/meshy/venv/bin/python',[HERE+'bake.py',dir,'1024'],{stdio:'inherit'});
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
/** Replace the skinned mesh geometry with a Meshy Remesh GLB, transferring JOINTS_0 / WEIGHTS_0 via remesh.py. */
function applyRemesh(){
  for(const mesh of root.listMeshes()) for(const prim of mesh.listPrimitives()){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grandma-remesh-'));
    fs.writeFileSync(path.join(dir,'hi_pos.bin'),new Float32Array(prim.getAttribute('POSITION').getArray()));
    fs.writeFileSync(path.join(dir,'hi_idx.bin'),new Uint32Array(prim.getIndices().getArray()));
    fs.writeFileSync(path.join(dir,'hi_j.bin'),new Uint8Array(prim.getAttribute('JOINTS_0').getArray()));
    fs.writeFileSync(path.join(dir,'hi_w.bin'),new Float32Array(prim.getAttribute('WEIGHTS_0').getArray()));
    execFileSync(process.env.PYTHON||'/workspace/meshy/venv/bin/python',[HERE+'remesh.py',dir,REMESH_FILE,TEX_SZ],{stdio:'inherit'});
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
    if(PBR && fs.existsSync(path.join(dir,'out_norm.jpg'))) BAKED_NORM=fs.readFileSync(path.join(dir,'out_norm.jpg'));
    if(PBR && fs.existsSync(path.join(dir,'out_mr.jpg'))) BAKED_MR=fs.readFileSync(path.join(dir,'out_mr.jpg'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
let BAKED_TEX=null, BAKED_NORM=null, BAKED_MR=null;
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

// Strip TANGENT attribute before quantizing so file stays compact (Three.js computes tangents on the fly for normal maps)
for(const mesh of root.listMeshes()) for(const prim of mesh.listPrimitives()){
  const tng=prim.getAttribute('TANGENT'); if(tng){prim.setAttribute('TANGENT',null); tng.dispose();}
}

/** Refine facial skin geometry & PBR maps on the Ultra mesh via refine_face.py. */
function applyUltraFaceRefine(){
  for(const mesh of root.listMeshes()) for(const prim of mesh.listPrimitives()){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grandma-ultra-face-'));
    fs.writeFileSync(path.join(dir,'hi_pos.bin'),new Float32Array(prim.getAttribute('POSITION').getArray()));
    fs.writeFileSync(path.join(dir,'hi_idx.bin'),new Uint32Array(prim.getIndices().getArray()));
    fs.writeFileSync(path.join(dir,'hi_uv.bin'),new Float32Array(prim.getAttribute('TEXCOORD_0').getArray()));
    execFileSync(process.env.PYTHON||'/workspace/meshy/venv/bin/python',[HERE+'refine_face.py',dir,TEX_SZ],{stdio:'inherit'});
    const rd=(f,T)=>{const b=fs.readFileSync(path.join(dir,f)); return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
    prim.getAttribute('POSITION').setArray(Float32Array.from(rd('out_pos.bin',Float32Array)));
    prim.getAttribute('NORMAL').setArray(Float32Array.from(rd('out_nrm.bin',Float32Array)));
    BAKED_TEX=fs.readFileSync(path.join(dir,'out_tex.jpg'));
    if(fs.existsSync(path.join(dir,'out_norm.jpg'))) BAKED_NORM=fs.readFileSync(path.join(dir,'out_norm.jpg'));
    if(fs.existsSync(path.join(dir,'out_mr.jpg'))) BAKED_MR=fs.readFileSync(path.join(dir,'out_mr.jpg'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

function applyParametric(){
  for(const mesh of root.listMeshes()) for(const prim of mesh.listPrimitives()){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grandma-parametric-'));
    fs.writeFileSync(path.join(dir,'hi_pos.bin'),new Float32Array(prim.getAttribute('POSITION').getArray()));
    fs.writeFileSync(path.join(dir,'hi_idx.bin'),new Uint32Array(prim.getIndices().getArray()));
    fs.writeFileSync(path.join(dir,'hi_uv.bin'),new Float32Array(prim.getAttribute('TEXCOORD_0').getArray()));
    fs.writeFileSync(path.join(dir,'hi_j.bin'),new Uint8Array(prim.getAttribute('JOINTS_0').getArray()));
    fs.writeFileSync(path.join(dir,'hi_w.bin'),new Float32Array(prim.getAttribute('WEIGHTS_0').getArray()));
    execFileSync(process.env.PYTHON||'/workspace/meshy/venv/bin/python',[HERE+'build_parametric_modular.py',dir,TEX_SZ],{stdio:'inherit'});
    const rd=(f,T)=>{const b=fs.readFileSync(path.join(dir,f)); return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
    prim.getAttribute('POSITION').setArray(Float32Array.from(rd('out_pos.bin',Float32Array)));
    prim.getAttribute('NORMAL').setArray(Float32Array.from(rd('out_nrm.bin',Float32Array)));
    prim.getAttribute('TEXCOORD_0').setArray(Float32Array.from(rd('out_uv.bin',Float32Array)));
    prim.getAttribute('JOINTS_0').setArray(Uint8Array.from(rd('out_j.bin',Uint8Array)));
    prim.getAttribute('WEIGHTS_0').setArray(Float32Array.from(rd('out_w.bin',Float32Array)));
    prim.getIndices().setArray(Uint32Array.from(rd('out_idx.bin',Uint32Array)));
    BAKED_TEX=fs.readFileSync(path.join(dir,'out_tex.jpg'));
    if(fs.existsSync(path.join(dir,'out_norm.jpg'))) BAKED_NORM=fs.readFileSync(path.join(dir,'out_norm.jpg'));
    if(fs.existsSync(path.join(dir,'out_mr.jpg'))) BAKED_MR=fs.readFileSync(path.join(dir,'out_mr.jpg'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

function applyHead19k(){
  const mesh=root.listMeshes()[0];
  const prim0=mesh.listPrimitives()[0];
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grandma-head19k-'));
  fs.writeFileSync(path.join(dir,'hi_pos.bin'),new Float32Array(prim0.getAttribute('POSITION').getArray()));
  fs.writeFileSync(path.join(dir,'hi_idx.bin'),new Uint32Array(prim0.getIndices().getArray()));
  fs.writeFileSync(path.join(dir,'hi_j.bin'),new Uint8Array(prim0.getAttribute('JOINTS_0').getArray()));
  fs.writeFileSync(path.join(dir,'hi_w.bin'),new Float32Array(prim0.getAttribute('WEIGHTS_0').getArray()));
  execFileSync(process.env.PYTHON||'/workspace/meshy/venv/bin/python',[HERE+'transplant_19k_head.py',dir],{stdio:'inherit'});
  const rd=(f,T)=>{const b=fs.readFileSync(path.join(dir,f)); return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
  // Update prim0 as Head19k
  prim0.getAttribute('POSITION').setArray(Float32Array.from(rd('head_pos.bin',Float32Array)));
  prim0.getAttribute('NORMAL').setArray(Float32Array.from(rd('head_nrm.bin',Float32Array)));
  prim0.getAttribute('TEXCOORD_0').setArray(Float32Array.from(rd('head_uv.bin',Float32Array)));
  prim0.getAttribute('JOINTS_0').setArray(Uint8Array.from(rd('head_j.bin',Uint8Array)));
  prim0.getAttribute('WEIGHTS_0').setArray(Float32Array.from(rd('head_w.bin',Float32Array)));
  prim0.getIndices().setArray(Uint16Array.from(rd('head_idx.bin',Uint32Array)));
  BAKED_TEX=fs.readFileSync(path.join(dir,'head_tex.jpg'));
  // Add prim1 as BodyTPose
  const bodyTex=doc.createTexture('GrandmaMali_BodyTPose_BaseColor').setImage(fs.readFileSync(path.join(dir,'body_tex.jpg'))).setMimeType('image/jpeg');
  const bodyMat=doc.createMaterial('GrandmaMali_BodyTPose').setBaseColorTexture(bodyTex).setMetallicFactor(0).setRoughnessFactor(0.88).setDoubleSided(true);
  const bpos=Float32Array.from(rd('body_pos.bin',Float32Array));
  const bnrm=Float32Array.from(rd('body_nrm.bin',Float32Array));
  const buv=Float32Array.from(rd('body_uv.bin',Float32Array));
  const bj=Uint8Array.from(rd('body_j.bin',Uint8Array));
  const bw=Float32Array.from(rd('body_w.bin',Float32Array));
  const bidx=Uint16Array.from(rd('body_idx.bin',Uint32Array));
  const prim1=doc.createPrimitive()
    .setMaterial(bodyMat)
    .setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(bpos).setBuffer(buf))
    .setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(bnrm).setBuffer(buf))
    .setAttribute('TEXCOORD_0',doc.createAccessor().setType('VEC2').setArray(buv).setBuffer(buf))
    .setAttribute('JOINTS_0',doc.createAccessor().setType('VEC4').setArray(bj).setBuffer(buf))
    .setAttribute('WEIGHTS_0',doc.createAccessor().setType('VEC4').setArray(bw).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(bidx).setBuffer(buf));
  mesh.addPrimitive(prim1);
  mat0.setDoubleSided(true);
  fs.rmSync(dir,{recursive:true,force:true});
}

function applyNoPbrRaw(){
  for(const mesh of root.listMeshes()) for(const prim of mesh.listPrimitives()){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grandma-nopbr-'));
    fs.writeFileSync(path.join(dir,'hi_pos.bin'),new Float32Array(prim.getAttribute('POSITION').getArray()));
    fs.writeFileSync(path.join(dir,'hi_idx.bin'),new Uint32Array(prim.getIndices().getArray()));
    fs.writeFileSync(path.join(dir,'hi_j.bin'),new Uint8Array(prim.getAttribute('JOINTS_0').getArray()));
    fs.writeFileSync(path.join(dir,'hi_w.bin'),new Float32Array(prim.getAttribute('WEIGHTS_0').getArray()));
    execFileSync(process.env.PYTHON||'/workspace/meshy/venv/bin/python',[HERE+'build_ultra_nopbr.py',dir,TEX_SZ],{stdio:'inherit'});
    const rd=(f,T)=>{const b=fs.readFileSync(path.join(dir,f)); return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
    prim.getAttribute('POSITION').setArray(Float32Array.from(rd('out_pos.bin',Float32Array)));
    prim.getAttribute('NORMAL').setArray(Float32Array.from(rd('out_nrm.bin',Float32Array)));
    prim.getAttribute('TEXCOORD_0').setArray(Float32Array.from(rd('out_uv.bin',Float32Array)));
    prim.getAttribute('JOINTS_0').setArray(Uint8Array.from(rd('out_j.bin',Uint8Array)));
    prim.getAttribute('WEIGHTS_0').setArray(Float32Array.from(rd('out_w.bin',Float32Array)));
    prim.getIndices().setArray(Uint32Array.from(rd('out_idx.bin',Uint32Array)));
    BAKED_TEX=fs.readFileSync(path.join(dir,'out_tex.jpg'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

function applyTripo(targetTris){
  for(const mesh of root.listMeshes()) for(const prim of mesh.listPrimitives()){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grandma-tripo-'));
    fs.writeFileSync(path.join(dir,'hi_pos.bin'),new Float32Array(prim.getAttribute('POSITION').getArray()));
    fs.writeFileSync(path.join(dir,'hi_idx.bin'),new Uint32Array(prim.getIndices().getArray()));
    fs.writeFileSync(path.join(dir,'hi_j.bin'),new Uint8Array(prim.getAttribute('JOINTS_0').getArray()));
    fs.writeFileSync(path.join(dir,'hi_w.bin'),new Float32Array(prim.getAttribute('WEIGHTS_0').getArray()));
    execFileSync(process.env.PYTHON||'/workspace/meshy/venv/bin/python',[HERE+'build_tripo.py',dir,String(targetTris),TEX_SZ],{stdio:'inherit'});
    const rd=(f,T)=>{const b=fs.readFileSync(path.join(dir,f)); return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
    const npos=Float32Array.from(rd('out_pos.bin',Float32Array));
    prim.getAttribute('POSITION').setArray(npos);
    prim.getAttribute('NORMAL').setArray(Float32Array.from(rd('out_nrm.bin',Float32Array)));
    prim.getAttribute('TEXCOORD_0').setArray(Float32Array.from(rd('out_uv.bin',Float32Array)));
    prim.getAttribute('JOINTS_0').setArray(Uint8Array.from(rd('out_j.bin',Uint8Array)));
    prim.getAttribute('WEIGHTS_0').setArray(Float32Array.from(rd('out_w.bin',Float32Array)));
    const nidx=rd('out_idx.bin',Uint32Array);
    prim.getIndices().setArray(npos.length/3<65536?Uint16Array.from(nidx):Uint32Array.from(nidx));
    BAKED_TEX=fs.readFileSync(path.join(dir,'out_tex.jpg'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

if(TRIPO_TRIS) applyTripo(TRIPO_TRIS);
else if(TRIS) await simplifyTo(TRIS);
else if(HEAD19K) applyHead19k();
else if(NOPBR_RAW) applyNoPbrRaw();
else if(PARAMETRIC) applyParametric();
else if(REMESH) applyRemesh();
else if(PBR) applyUltraFaceRefine();

const baseTex=mat0.getBaseColorTexture()||root.listTextures()[0];
const normTex=mat0.getNormalTexture();
const mrTex=mat0.getMetallicRoughnessTexture();

if(PBR){
  if(BAKED_TEX) baseTex.setImage(BAKED_TEX).setMimeType('image/jpeg').setName('GrandmaMali_BaseColor');
  else if(fs.existsSync(R+'ultra-pbr-base.jpg')) baseTex.setImage(fs.readFileSync(R+'ultra-pbr-base.jpg')).setMimeType('image/jpeg').setName('GrandmaMali_BaseColor');
  if(normTex){
    if(BAKED_NORM) normTex.setImage(BAKED_NORM).setMimeType('image/jpeg').setName('GrandmaMali_Normal');
    else if(fs.existsSync(R+'ultra-pbr-norm.jpg')) normTex.setImage(fs.readFileSync(R+'ultra-pbr-norm.jpg')).setMimeType('image/jpeg').setName('GrandmaMali_Normal');
  }
  if(mrTex){
    if(BAKED_MR) mrTex.setImage(BAKED_MR).setMimeType('image/jpeg').setName('GrandmaMali_MetallicRoughness');
    else if(fs.existsSync(R+'ultra-pbr-mr.jpg')) mrTex.setImage(fs.readFileSync(R+'ultra-pbr-mr.jpg')).setMimeType('image/jpeg').setName('GrandmaMali_MetallicRoughness');
  }
} else {
  if(normTex){ mat0.setNormalTexture(null); }
  if(mrTex){ mat0.setMetallicRoughnessTexture(null); mat0.setMetallicFactor(0); mat0.setRoughnessFactor(0.85); }
  if(BAKED_TEX) baseTex.setImage(BAKED_TEX).setMimeType('image/jpeg').setName('GrandmaMali_BaseColor');
  else if(fs.existsSync(R+'texture-1024.jpg')) baseTex.setImage(fs.readFileSync(R+'texture-1024.jpg')).setMimeType('image/jpeg').setName('GrandmaMali_BaseColor');
}

await doc.transform(weld(),resample(),dedup(),prune(),quantize());
await io.write(OUT,doc);
const outTris=root.listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((p,pr)=>p+(pr.getIndices()?.getCount()||0)/3,0),0);
const outVerts=root.listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((p,pr)=>p+(pr.getAttribute('POSITION')?.getCount()||0),0),0);
console.log(OUT, 'bytes:', fs.statSync(OUT).size, 'tris:', outTris, 'verts:', outVerts, 'clips:', root.listAnimations().map(a=>a.getName()));
