import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { placementInImage, placedPoint, placedPart, clipForHistoryStep } from '../src/lib/editor/bringToImage.ts';
import { project } from '../src/lib/editor/camMath.ts';
import { registerPart, applyPivot } from '../src/lib/editor/pivot.ts';
let passed=0;
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const test=async(name,fn)=>{await fn();passed++;console.log('ok - '+name);};
const cam={f:220,cx:12,cy:-35,C:[0,-200,50],R:[[1,0,0],[0,0,-1],[0,1,0]]};
const image={x0:0,y0:0,x1:96,y1:108};
const cube=(c,r)=>[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[c[0]+x*r,c[1]+y*r,c[2]+z*r])));
function validate(points,camera=cam,rect=image){
 const original=JSON.stringify({points,camera,rect}), result=placementInImage(camera,points,rect,180);assert.ok(result);
 const after=points.map(p=>placedPoint(p,result));
 for(const p of after){const uv=project(camera,p);assert.ok(uv,'in front of camera');
  for(let a=0;a<2;a++){const lo=a?rect.y0:rect.x0,hi=a?rect.y1:rect.x1;assert.ok(uv[a]>=lo+(hi-lo)*.12-1e-6&&uv[a]<=hi-(hi-lo)*.12+1e-6,'inside padded image');}}
 const center=project(camera,result.to);near(center[0],(rect.x0+rect.x1)/2);near(center[1],(rect.y0+rect.y1)/2);
 assert.equal(JSON.stringify({points,camera,rect}),original,'inputs unchanged');
 const again=placementInImage(camera,after,rect,180);near(again.scale,1);again.from.forEach((v,i)=>near(v,again.to[i]));
 return result;
}
for(const [name,center,radius] of [['behind camera',[0,-400,50],20],['crossing camera',[0,-200,50],40],['huge scale',[0,0,0],1e9],['tiny scale',[0,0,0],1e-12],['distant translation',[1e9,1e9,-1e9],20]])await test(name+' is recovered without camera edits or repeat drift',()=>validate(cube(center,radius)));
await test('full-room image offsets, not viewport or principal point, determine target',()=>validate(cube([15,60,15],12),cam,{x0:-368,y0:-540,x1:352,y1:740}));
await test('invalid or zero geometry/camera rejected',()=>{for(const p of [[],[[0,0,0]],[[NaN,0,0]]])assert.equal(placementInImage(cam,p,image,180),null);assert.equal(placementInImage({...cam,f:0},cube([0,0,0],1),image,180),null);assert.equal(placementInImage(cam,cube([0,0,0],1),image,Infinity),null);});
function worldPoints(root){root.updateWorldMatrix(true,true);const out=[];root.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.getAttribute('position');for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld);out.push([v.x*100,-v.z*100,v.y*100]);}});return out;}
await test('parent nonuniform scale, rotated and mirrored part, and edited pivot retain similarity',()=>{
 const parent=new THREE.Group();parent.position.set(3,-2,1);parent.rotation.set(.2,.5,-.3);parent.scale.set(2,.4,1.5);
 const part=new THREE.Mesh(new THREE.BoxGeometry(.4,.3,.2));parent.add(part);registerPart(part);applyPivot(part,[.1,.08,-.05]);part.position.set(.2,.3,-.1);part.rotation.set(.3,-.6,.8);part.scale.set(-2,.8,1.5);
 const before=worldPoints(parent),result=placementInImage(cam,before,image,180),rotation=part.rotation.toArray(),geometry=part.geometry.getAttribute('position').array.slice();
 const next=placedPart(part.position.toArray(),part.scale.toArray(),parent.matrixWorld,result);assert.ok(next);part.position.fromArray(next.position);part.scale.fromArray(next.scale);
 worldPoints(parent).forEach((p,i)=>placedPoint(before[i],result).forEach((v,a)=>near(p[a],v,1e-5)));assert.deepEqual(part.rotation.toArray(),rotation);assert.deepEqual(part.geometry.getAttribute('position').array,geometry);
});
await test('singular parent and nonfinite state reject without changes',()=>{const result=validate(cube([0,0,0],1));assert.equal(placedPart([0,0,0],[1,1,1],new THREE.Matrix4().makeScale(0,1,1),result),null);assert.equal(placedPart([NaN,0,0],[1,1,1],new THREE.Matrix4(),result),null);});
for(const file of ['clock.glb','clock-master.glb','nightstand.glb','nightstand-master.glb'])await test('real '+file+' fits image after large misplacement, with exact transform restoration',async()=>{
 const bytes=await fs.readFile(new URL('../public/models/'+file,import.meta.url));const {scene}=await new GLTFLoader().register(() => ({ name: 'CPU_GEOMETRY_ONLY', loadTexture: () => Promise.resolve(new THREE.Texture()) })).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 let container=scene;while(container.children.length===1&&!container.isMesh&&container.children[0].children.length>0)container=container.children[0];const parts=[...container.children];assert.ok(parts.length);
 for(const part of parts){part.position.multiplyScalar(300).add(new THREE.Vector3(100,-200,600));part.scale.multiplyScalar(300);}scene.updateMatrixWorld(true);
 const state=()=>parts.map(p=>({name:p.name,position:p.position.toArray(),scale:p.scale.toArray(),rotation:p.rotation.toArray()}));const before=state(),original=JSON.stringify(before),points=worldPoints(scene),result=placementInImage(cam,points,image,180);
 const changes=parts.map((p,i)=>placedPart(before[i].position,before[i].scale,p.parent.matrixWorld.clone(),result));changes.forEach((v,i)=>{parts[i].position.fromArray(v.position);parts[i].scale.fromArray(v.scale);});
 for(const p of worldPoints(scene)){const uv=project(cam,p);assert.ok(uv&&uv[0]>0&&uv[0]<96&&uv[1]>0&&uv[1]<108);}
 assert.deepEqual(JSON.parse(JSON.stringify(state())),state(),'JSON persists transforms');
 before.forEach((v,i)=>{parts[i].position.fromArray(v.position);parts[i].scale.fromArray(v.scale);});assert.equal(JSON.stringify(state()),original,'exact history restoration');
});
await test('Bring Undo and Redo restore clipping so the old near-camera model remains visible',()=>{
 const beforeClip={near:.02,far:40},afterClip={near:.8,far:40};
 const records=new Map([[2,{before:1,beforeClip,afterClip}]]);
 const visible=(z,range)=>{const c=new THREE.PerspectiveCamera(32,1,range.near,range.far);c.updateProjectionMatrix();const p=new THREE.Vector3(0,0,-z).project(c);return p.z>=-1&&p.z<=1};
 assert.ok(visible(.1,beforeClip));assert.ok(!visible(.1,afterClip),'regression fixture would disappear with stale near clipping');
 assert.ok(visible(.1,clipForHistoryStep(2,1,records)),'Undo restores the old visible model');
 assert.ok(visible(2,clipForHistoryStep(1,2,records)),'Redo restores recovered range');
 assert.equal(clipForHistoryStep(2,3,records),null,'unrelated history never restores stale clipping');
});
await test('repeated identical Bring results retain clipping for each unique history transition',()=>{
 const firstBefore={near:.02,far:40},firstAfter={near:.8,far:40},secondBefore={near:.5,far:80},secondAfter={near:1,far:80};
 // Entries 1 and 3 have identical model JSON; entries 2 and 4 also match. Their IDs do not.
 const records=new Map([[2,{before:1,beforeClip:firstBefore,afterClip:firstAfter}],[4,{before:3,beforeClip:secondBefore,afterClip:secondAfter}]]);
 assert.deepEqual(clipForHistoryStep(4,3,records),secondBefore);
 assert.equal(clipForHistoryStep(3,2,records),null);
 assert.deepEqual(clipForHistoryStep(2,1,records),firstBefore);
 assert.deepEqual(clipForHistoryStep(1,2,records),firstAfter);
 assert.deepEqual(clipForHistoryStep(3,4,records),secondAfter);
});
console.log(`bringToImage: ${passed} passed`);
