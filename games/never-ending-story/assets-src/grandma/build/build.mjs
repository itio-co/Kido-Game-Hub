// Builds public/models/grandma-mali.glb from the raw Meshy downloads in ../meshy/raw/ (git-ignored):
// rigged mesh + named clips (Idle, Wave, SitDown, SitIdle, SitTalk, Walk), 1024 JPEG texture, quantized.
// Usage (see ../README.md): python texture.py && npm i && node build.mjs [out.glb]
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,resample,quantize} from '@gltf-transform/functions';
import fs from 'fs';
import {fileURLToPath} from 'url';
const HERE=fileURLToPath(new URL('.', import.meta.url));
const R=HERE+'../meshy/raw/', R2=R;
const OUT=process.argv[2]||HERE+'../../../public/models/grandma-mali.glb';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(R+'Character_output.glb'); const root=doc.getRoot(); const buf=root.listBuffers()[0];
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
await doc.transform(resample(),dedup(),prune(),quantize());
await io.write(OUT,doc);
console.log(OUT, fs.statSync(OUT).size, root.listAnimations().map(a=>a.getName()));
