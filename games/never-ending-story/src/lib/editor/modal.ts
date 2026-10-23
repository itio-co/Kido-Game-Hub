/**
 * Blender-style modal transforms (G / R / S) for the model editor: axis constraints, typed numeric input and the
 * screen-space maths. Pure helpers, unit-tested in tests/modal.test.ts; the editor wires them to the scene.
 */
import * as THREE from 'three';

export type ModalKind = 'grab' | 'rotate' | 'scale';
export type Axis = 0 | 1 | 2;
export type Space = 'global' | 'local';
export type Constraint = { axis: Axis; space: Space } | null;

export const AXIS_NAMES = ['X', 'Y', 'Z'] as const;
/** Blender's theme axis colours (X red, Y green, Z blue). */
export const AXIS_COLORS = ['#ff3352', '#8bdc00', '#2890ff'] as const;

/** Pressing X / Y / Z: off → global → local → off (Blender); another axis starts at global. */
export function cycleConstraint(current: Constraint, axis: Axis): Constraint {
  if (!current || current.axis !== axis) return { axis, space: 'global' };
  return current.space === 'global' ? { axis, space: 'local' } : null;
}

/** Typed numeric input while a modal transform runs ("G X 0.05 Enter"). */
export class NumInput {
  text = '';
  negative = false;
  get active(): boolean {
    return this.text.length > 0 || this.negative;
  }
  /** Feed one KeyboardEvent.key; true when it was consumed. */
  key(key: string): boolean {
    if (/^[0-9]$/.test(key)) this.text += key;
    else if (key === '.' || key === ',') {
      if (!this.text.includes('.')) this.text += this.text ? '.' : '0.';
    } else if (key === '-') this.negative = !this.negative;
    else if (key === 'Backspace') {
      if (this.text) this.text = this.text.slice(0, -1);
      else this.negative = false;
    } else return false;
    return true;
  }
  /** The typed value, or null when nothing (or only "-") was typed. */
  value(): number | null {
    if (!this.text) return null;
    const v = Number(this.text);
    if (!Number.isFinite(v)) return null;
    return this.negative ? -v : v;
  }
  /** What the header shows, e.g. "-0.05|". */
  display(): string {
    return `${this.negative ? '-' : ''}${this.text}|`;
  }
  clear(): void {
    this.text = '';
    this.negative = false;
  }
}

/** Parameter t of the point on the line p + t·d closest to the ray o + s·r (d, r normalised); null if parallel. */
export function closestOnLine(o: THREE.Vector3, r: THREE.Vector3, p: THREE.Vector3, d: THREE.Vector3): number | null {
  const w = new THREE.Vector3().subVectors(p, o);
  const b = d.dot(r);
  const denom = 1 - b * b;
  if (denom < 1e-6) return null;
  const dw = d.dot(w);
  const rw = r.dot(w);
  return (b * rw - dw) / denom;
}

/** Signed angle (radians, screen y down → positive = clockwise on screen) from a to b around c. */
export function screenAngle(c: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  const a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
  let d = a1 - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Scale factor from the mouse distance to the centre (start vs now), as Blender's scale. */
export function screenScale(c: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const d0 = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const d1 = Math.hypot(b[0] - c[0], b[1] - c[1]);
  return d0 < 1 ? 1 : d1 / d0;
}

export const snapTo = (v: number, step: number): number => (step > 0 ? Math.round(v / step) * step : v);

/**
 * Rotation angle about `axis` for a counter-clockwise-on-screen positive convention: a screen angle `screen`
 * (clockwise positive, y down) seen from `toCamera` rotates the object the same way it looks on screen.
 */
export function rotationFromScreen(screen: number, axis: THREE.Vector3, toCamera: THREE.Vector3): number {
  const s = axis.dot(toCamera) >= 0 ? 1 : -1;
  return -screen * s;
}
