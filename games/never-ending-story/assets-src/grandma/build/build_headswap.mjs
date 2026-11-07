// Builds public/models/grandma-mali-tripo-body-6kface.glb:
// Tripo3D 42k smoothed body (grandma-mali-tripo-smooth.glb, same 24-bone Mixamo rig + 6 clips)
// with the head (face + silver hair) of the 6k meshoptimizer QEM LOD (grandma-mali-6k.glb).
// Geometry cut/alignment lives in transplant_6k_head_tripo.py; each part keeps its own material.
// Usage: node build_headswap.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, quantize, prune, dedup } from '@gltf-transform/functions';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.resolve(HERE, '../../../public/models');
const TRIPO = path.join(MODELS, 'grandma-mali-tripo-smooth.glb');
const M6K = path.join(MODELS, 'grandma-mali-6k.glb');
const OUT = process.argv[2] ?? path.join(MODELS, 'grandma-mali-tripo-body-6kface.glb');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'grandma-headswap-'));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const bodyNode = (doc) => doc.getRoot().listNodes().find((n) => n.getMesh() && n.getSkin());
const dump = (doc, dir) => {
  fs.mkdirSync(dir, { recursive: true });
  const n = bodyNode(doc);
  const p = n.getMesh().listPrimitives()[0];
  const w = (f, a) => fs.writeFileSync(path.join(dir, f), Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  w('pos.bin', new Float32Array(p.getAttribute('POSITION').getArray()));
  w('uv.bin', new Float32Array(p.getAttribute('TEXCOORD_0').getArray()));
  w('j.bin', new Uint8Array(p.getAttribute('JOINTS_0').getArray()));
  w('w.bin', new Float32Array(p.getAttribute('WEIGHTS_0').getArray()));
  w('idx.bin', new Uint32Array(p.getIndices().getArray()));
  const tex = p.getMaterial().getBaseColorTexture();
  fs.writeFileSync(path.join(dir, 'tex.bin'), tex.getImage());
  w('ibm.bin', new Float32Array(n.getSkin().getInverseBindMatrices().getArray()));
};

const doc = await io.read(TRIPO);
const doc6 = await io.read(M6K);
await doc.transform(dequantize());
await doc6.transform(dequantize());
dump(doc, path.join(WORK, 'tripo'));
dump(doc6, path.join(WORK, 'm6k'));
execFileSync('python3', [path.join(HERE, 'transplant_6k_head_tripo.py'), WORK], { stdio: 'inherit' });

const rd = (f, T) => {
  const b = fs.readFileSync(path.join(WORK, 'out', f));
  return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const buffer = doc.getRoot().listBuffers()[0];
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);

function computeNormals(pos, idx) {
  // Smooth normals welded by position so the neck/face shade without seams.
  const key = (i) => `${pos[i * 3].toFixed(5)},${pos[i * 3 + 1].toFixed(5)},${pos[i * 3 + 2].toFixed(5)}`;
  const map = new Map();
  const n = pos.length / 3;
  const grp = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = key(i);
    if (!map.has(k)) map.set(k, map.size);
    grp[i] = map.get(k);
  }
  const acc3 = new Float64Array(map.size * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { acc3[grp[v] * 3] += nx; acc3[grp[v] * 3 + 1] += ny; acc3[grp[v] * 3 + 2] += nz; }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const g = grp[i];
    const l = Math.hypot(acc3[g * 3], acc3[g * 3 + 1], acc3[g * 3 + 2]) || 1;
    out[i * 3] = acc3[g * 3] / l; out[i * 3 + 1] = acc3[g * 3 + 1] / l; out[i * 3 + 2] = acc3[g * 3 + 2] / l;
  }
  return out;
}

const fill = (prim, part) => {
  const pos = rd(`${part}_pos.bin`, Float32Array);
  const idx = rd(`${part}_idx.bin`, Uint32Array);
  prim
    .setAttribute('POSITION', acc('VEC3', pos))
    .setAttribute('NORMAL', acc('VEC3', computeNormals(pos, idx)))
    .setAttribute('TEXCOORD_0', acc('VEC2', rd(`${part}_uv.bin`, Float32Array)))
    .setAttribute('JOINTS_0', acc('VEC4', rd(`${part}_j.bin`, Uint8Array)))
    .setAttribute('WEIGHTS_0', acc('VEC4', rd(`${part}_w.bin`, Float32Array)))
    .setIndices(acc('SCALAR', idx));
};

const mesh = bodyNode(doc).getMesh();
const bodyPrim = mesh.listPrimitives()[0];
fill(bodyPrim, 'body');

// Head material: the 6k diffuse (own texture, collar texels repainted as skin) onto a new material in the Tripo document.
const mat6 = bodyNode(doc6).getMesh().listPrimitives()[0].getMaterial();
const tex6 = mat6.getBaseColorTexture();
const headTex = doc.createTexture('GrandmaMali_Head6k').setImage(fs.readFileSync(path.join(WORK, 'out', 'head_tex.jpg'))).setMimeType('image/jpeg');
const bodyMat = bodyPrim.getMaterial();
const headMat = doc
  .createMaterial('GrandmaMali_Head6k')
  .setBaseColorTexture(headTex)
  .setBaseColorFactor(mat6.getBaseColorFactor())
  .setMetallicFactor(bodyMat.getMetallicFactor())
  .setRoughnessFactor(bodyMat.getRoughnessFactor())
  .setDoubleSided(bodyMat.getDoubleSided());
const headPrim = doc.createPrimitive().setMaterial(headMat);
fill(headPrim, 'head');
mesh.addPrimitive(headPrim);

await doc.transform(dedup(), prune(), quantize());
await io.write(OUT, doc);
const tris = mesh.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
console.log(`wrote ${OUT}: ${tris} tris, ${fs.statSync(OUT).size} bytes`);
fs.rmSync(WORK, { recursive: true, force: true });
