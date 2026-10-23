/**
 * Plain-JSON math tuples used in documents and exports.
 * Runtime code may use THREE.Vector3 / Quaternion / Matrix4; anything serialised uses these.
 */

/** Pixel or UV coordinate `[x, y]`. Image space: origin top-left, +y down. */
export type Vec2 = [number, number];
/** `[x, y, z]`. Metres, three.js axes (Y-up, +Z towards the viewer / "front"), unless noted. */
export type Vec3 = [number, number, number];
/** Unit quaternion `[x, y, z, w]` (three.js order). */
export type Quat = [number, number, number, number];

/** Object transform relative to its parent. Metres, unit quaternion, unitless scale. */
export interface Transform {
  position: Vec3;
  quaternion: Quat;
  scale: Vec3;
}

/** Positions written to an EditMesh / EditDocument are rounded to this step (metres). */
export type PositionEpsilon = 1e-5;
