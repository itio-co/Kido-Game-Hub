/**
 * Section-view cut planes (local clipping, `renderer.localClippingEnabled`).
 *
 * Azimuth convention matches the camera rig and the deck plan: angle a (rad) points to
 * (sin a, 0, cos a) — 0 = +Z, 90° = +X.
 *  - half cut: removes the half-space facing angle a (one plane through the ship axis)
 *  - quarter cut: removes a 90° wedge centred on a (two planes, clipIntersection)
 *  - optional horizontal cut height: global renderer plane, removes everything above y
 * Cap faces are radial half-planes leaving the axis at the returned `faces` angles.
 */
import { Plane, Vector3, type Material, type Object3D } from 'three';

export type CutMode = 'half' | 'quarter';
export const dirOf = (a: number) => new Vector3(Math.sin(a), 0, Math.cos(a));

const half = [new Plane()];
const quarter = [new Plane(), new Plane()];
export const heightPlane = new Plane(new Vector3(0, -1, 0), 30);

export function cutPlanes(azRad: number, mode: CutMode) {
	if (mode === 'half') {
		half[0].set(dirOf(azRad).negate(), 0);
		return { planes: half, intersect: false, faces: [azRad + Math.PI / 2, azRad - Math.PI / 2] };
	}
	const a = azRad + Math.PI / 4;
	const b = azRad - Math.PI / 4;
	quarter[0].set(dirOf(a).negate(), 0);
	quarter[1].set(dirOf(b).negate(), 0);
	return { planes: quarter, intersect: true, faces: [a, b] };
}

/** assign (or clear) local clipping planes on every material below `root`, except caps */
export function applyClipping(root: Object3D, planes: Plane[] | null, intersect: boolean) {
	root.traverse((o) => {
		const m = (o as Object3D & { material?: Material | Material[] }).material;
		if (!m) return;
		for (const mat of Array.isArray(m) ? m : [m]) {
			if (mat.userData.noLocalClip) continue;
			if (mat.clippingPlanes !== planes) mat.clippingPlanes = planes;
			if (mat.clipIntersection !== intersect) mat.clipIntersection = intersect;
		}
	});
}
