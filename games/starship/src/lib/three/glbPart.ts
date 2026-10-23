/** Imported GLB parts: parsed once, normalised to the unit cube (centred, max extent 1 on each axis). */
import { Box3, Group, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cache = new Map<string, Promise<Object3D>>();

function dataUrlToBuffer(url: string): ArrayBuffer {
	const b64 = url.slice(url.indexOf(',') + 1);
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out.buffer;
}

export function loadGlbPart(dataUrl: string): Promise<Object3D> {
	let p = cache.get(dataUrl);
	if (!p) {
		p = new GLTFLoader().parseAsync(dataUrlToBuffer(dataUrl), '').then((gltf) => {
			const inner = gltf.scene;
			const box = new Box3().setFromObject(inner);
			const size = box.getSize(new Vector3());
			const c = box.getCenter(new Vector3());
			inner.position.sub(c);
			const wrap = new Group();
			wrap.add(inner);
			wrap.scale.set(1 / Math.max(size.x, 1e-6), 1 / Math.max(size.y, 1e-6), 1 / Math.max(size.z, 1e-6));
			const outer = new Group();
			outer.add(wrap);
			inner.traverse((o) => {
				o.castShadow = true;
				o.receiveShadow = true;
			});
			return outer;
		});
		cache.set(dataUrl, p);
	}
	return p.then((o) => o.clone(true));
}

/** bounding-box aspect of a GLB (for the initial part size) */
export async function glbAspect(dataUrl: string): Promise<[number, number, number]> {
	const gltf = await new GLTFLoader().parseAsync(dataUrlToBuffer(dataUrl), '');
	const s = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
	return [s.x, s.y, s.z];
}
