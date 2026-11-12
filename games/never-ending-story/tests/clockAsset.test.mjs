// Runtime asset contract: `node tests/clockAsset.test.mjs` (no Blender/browser).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from 'three';
import ts from 'typescript';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { camFromMatched } from '../src/lib/editor/cameraMatch.ts';
import { project } from '../src/lib/editor/camMath.ts';
import { partLabel } from '../src/lib/editor/partLabels.ts';
import { itemOfSlug } from '../src/lib/editor/editorFilesCore.mjs';
import { resolveEditorPath } from '../scripts/editorFilesPlugin.mjs';
import { fileURLToPath } from 'node:url';

const base = new URL('../',import.meta.url);
const read = (path) => fs.readFile(new URL(path,base));
const json = async (path) => JSON.parse(await read(path));
const near = (a,b,tol=1e-6) => assert.ok(Math.abs(a-b)<tol, `${a} != ${b}`);
const asset = await json('assets-src/clock/asset.json');
const cam = await json('assets-src/clock/blender/cam.json');
const report = await json('assets-src/clock/export/build-report.json');
const expected = [...asset.exports.partNodes].sort();

// Vite supplies BASE_URL. Test the real registry with a non-root base, preserving
// its Three.js constructors while stripping TS as a normal build would.
const registrySource = (await read('src/lib/showcaseAssets.ts')).toString()
  .replace('import.meta.env.BASE_URL',JSON.stringify('/nested/game/'));
const registryJs = ts.transpileModule(registrySource,{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText.replace("from 'three'",`from '${import.meta.resolve('three')}'`);
const { findAsset } = await import(`data:text/javascript;base64,${Buffer.from(registryJs).toString('base64')}`);
const registered = findAsset(asset.slug);
assert.equal(registered.id,asset.id);
assert.equal(registered.ref.src,'/nested/game/showcase/clock-ref.png');
assert.deepEqual(registered.variants.map(v=>v.id),['lowpoly','master']);
assert.equal(itemOfSlug(registered.slug),'clock');
assert.ok(resolveEditorPath(fileURLToPath(new URL('assets-src/',base)),'clock','lowpoly.edits.json').endsWith('/clock/editor/lowpoly.edits.json'));
console.log('ok - clock registry, subfolder URLs and editor source directory');

// The live scene artwork can evolve independently of the source used to author this asset.
const source = await read(`assets-src/clock/${asset.source.archivedMockup}`);
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),asset.source.sha256);
const crop = await read('assets-src/clock/ref/clock-ref.png');
assert.deepEqual(crop,await read('public/showcase/clock-ref.png'));
assert.equal(crypto.createHash('sha256').update(crop).digest('hex'),asset.ref.cropSha256);
assert.equal(crop.readUInt32BE(16),registered.ref.width);
assert.equal(crop.readUInt32BE(20),registered.ref.height);
assert.deepEqual(registered.ref.mockup.crop,{x:48,y:108});
assert.equal(registered.ref.mockup.src,'/nested/game/img/living-wide.jpg');
console.log('ok - original artwork provenance and exact runtime reference crop');

const matched = camFromMatched(registered.ref.camera,registered.ref.width,registered.ref.height);
near(matched.f,cam.p[5]);
matched.C.forEach((v,i)=>near(v,cam.C[i]));
matched.R.flat().forEach((v,i)=>near(v,cam.R.flat()[i]));
const errors=cam.landmarks.map((kp,i)=>{
  const stored=registered.ref.keyPoints[i];
  assert.equal(stored.id,kp.id);
  stored.p.forEach((v,j)=>near(v,kp.p[j]));
  const projected=project(matched,stored.p);
  return Math.hypot(projected[0]-kp.pixel[0],projected[1]-kp.pixel[1]);
});
near(Math.sqrt(errors.reduce((s,x)=>s+x*x,0)/errors.length),cam.rmsPx);
assert.ok(cam.rmsPx<2,'Approximate landmark pose stays within 2 px RMS');
console.log('ok - camera coordinate conversion and eight reference landmarks');

for (const variant of registered.variants) {
  const filename=variant.id==='master'?'clock-master.glb':'clock.glb';
  assert.equal(variant.url,`/nested/game/models/${filename}`);
  const bytes=await read(`public/models/${filename}`);
  assert.deepEqual(bytes,await read(`assets-src/clock/export/${filename}`));
  assert.equal(bytes.length,report[variant.id].bytes);
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const gltf=await new GLTFLoader().parseAsync(buffer,'');
  assert.equal(gltf.scene.children.length,1,'Single root wrapper');
  const root=gltf.scene.children[0];
  assert.deepEqual(root.children.map(o=>o.name).sort(),expected,'13 stable editor part nodes');
  assert.equal(root.userData.assetId,asset.id);
  assert.equal(root.userData.slug,asset.slug);
  assert.equal(root.userData.dimensionsAreEstimated,true);
  let triangles=0;
  gltf.scene.traverse(o=>{
    assert.ok(!o.isCamera && !o.isLight,'No source camera/lights shipped');
    if(!o.isMesh) return;
    const position=o.geometry.getAttribute('position');
    assert.ok(position.count>0);
    assert.ok(Array.from(position.array).every(Number.isFinite));
    assert.ok(o.geometry.getAttribute('normal'),'Lit surface normals');
    triangles+=(o.geometry.index?.count??position.count)/3;
    for (const mat of Array.isArray(o.material)?o.material:[o.material]) {
      assert.equal(mat.map,null,'No missing texture dependencies');
      assert.equal(mat.transparent,false,'Solid editable surface');
    }
  });
  assert.equal(triangles,report[variant.id].triangles);
  const box=new THREE.Box3().setFromObject(root,true);
  const size=box.getSize(new THREE.Vector3());
  // The master edge bevel trims the sharp extrema by less than 0.1 mm.
  near(size.x,.38,.0001); near(size.y,.42,.0001); near(size.z,.054,.0001);
  near(box.min.y,0,.0001); near(box.getCenter(new THREE.Vector3()).x,0);
  for(const name of ['Hand_Hour','Hand_Minute']) {
    const hand=root.getObjectByName(name);
    near(hand.position.x,0); near(hand.position.y,.21);
    const frame=root.getObjectByName('Clock_Frame_01');
    const before=new THREE.Box3().setFromObject(frame,true);
    const beforeHand=new THREE.Box3().setFromObject(hand,true).getCenter(new THREE.Vector3());
    hand.rotateZ(Math.PI/2); root.updateMatrixWorld(true);
    const afterHand=new THREE.Box3().setFromObject(hand,true).getCenter(new THREE.Vector3());
    assert.ok(beforeHand.distanceTo(afterHand)>.03,'Hand rotates independently');
    assert.ok(before.equals(new THREE.Box3().setFromObject(frame,true)),'Frame stays fixed');
    near(hand.position.x,0); near(hand.position.y,.21);
  }
  console.log(`ok - ${variant.id}: ${root.children.length} editable parts, ${triangles} triangles, dimensions, pivots, materials`);
}
assert.equal(partLabel('Hand_Hour'),'เข็ม ชั่วโมง');
assert.equal(partLabel('Clock_Frame_01'),'นาฬิกา กรอบ 01');
console.log('ok - Thai clock part labels');
console.log('Clock asset checks passed.');
