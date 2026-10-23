/**
 * Build-mode camera rig around OrbitControls: programmatic orbit / pan / zoom with smooth
 * animation, preset views and a reactive azimuth for the compass. Shared by BuildInput
 * (drag gestures), the on-screen camera widget and the keyboard shortcuts.
 */
import { Spherical, Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HULL_INNER_RADIUS } from '$lib/game/specs';

export const POLAR_MIN = 0.03; // near top-down
export const POLAR_MAX = 1.5; // near horizontal (never below the floor plane)
export const DIST_MIN = 2;
export const DIST_MAX = 40;

export interface RigLimits {
	polarMin: number;
	polarMax: number;
	distMin: number;
	distMax: number;
	/** horizontal pan radius around the axis */
	panR: number;
	/** vertical pan range (section views); null = target y locked to the deck */
	panY: [number, number] | null;
}
export const PLAN_LIMITS: RigLimits = { polarMin: POLAR_MIN, polarMax: POLAR_MAX, distMin: DIST_MIN, distMax: DIST_MAX, panR: HULL_INNER_RADIUS + 1.5, panY: null };

interface View {
	az: number;
	polar: number;
	dist: number;
}

class CameraRig {
	controls: OrbitControls | null = null;
	/** azimuth (rad) for the compass; updated on every controls change */
	az = $state(0);
	private home: View = { az: 0, polar: 0.87, dist: 11 };
	private anim = 0;
	lim: RigLimits = PLAN_LIMITS;
	private homeTarget: [number, number, number] = [0, 0, 0];
	private sph = new Spherical();
	private v = new Vector3();

	get camera() {
		return (this.controls?.object as PerspectiveCamera | undefined) ?? null;
	}

	attach(c: OrbitControls, target: [number, number, number], pos: [number, number, number], lim: RigLimits = PLAN_LIMITS) {
		this.controls = c;
		this.lim = lim;
		c.minPolarAngle = lim.polarMin;
		c.maxPolarAngle = lim.polarMax;
		c.minDistance = lim.distMin;
		c.maxDistance = lim.distMax;
		c.target.set(...target);
		c.object.position.set(...pos);
		this.home = this.read();
		this.homeTarget = [...target];
		c.update();
		const sync = () => (this.az = this.read().az);
		c.addEventListener('change', sync);
		sync();
		return () => {
			c.removeEventListener('change', sync);
			if (this.controls === c) this.controls = null;
		};
	}

	read(): View {
		const c = this.controls;
		if (!c) return { ...this.home };
		this.v.copy(c.object.position).sub(c.target);
		this.sph.setFromVector3(this.v);
		return { az: this.sph.theta, polar: this.sph.phi, dist: this.sph.radius };
	}

	private apply(view: View) {
		const c = this.controls;
		if (!c) return;
		const polar = Math.min(this.lim.polarMax, Math.max(this.lim.polarMin, view.polar));
		const dist = Math.min(this.lim.distMax, Math.max(this.lim.distMin, view.dist));
		this.sph.set(dist, polar, view.az);
		c.object.position.copy(c.target).add(this.v.setFromSpherical(this.sph));
		c.object.lookAt(c.target);
		c.update();
	}

	/** immediate relative orbit (drag gestures) */
	orbitBy(dAz: number, dPolar: number) {
		cancelAnimationFrame(this.anim);
		const v = this.read();
		this.apply({ az: v.az + dAz, polar: v.polar + dPolar, dist: v.dist });
	}

	/** pan in the deck plane by screen pixels (keeps the target at deck height) */
	panBy(dx: number, dy: number, viewportH: number) {
		const c = this.controls;
		const cam = this.camera;
		if (!c || !cam) return;
		cancelAnimationFrame(this.anim);
		const { az, dist } = this.read();
		const s = (2 * dist * Math.tan(((cam.fov ?? 45) * Math.PI) / 360)) / viewportH;
		// screen right / forward projected to the horizontal plane
		const rx = Math.cos(az), rz = -Math.sin(az);
		const fx = -Math.sin(az), fz = -Math.cos(az);
		const vy = this.lim.panY;
		// section views pan in the screen plane (vertical drag moves up/down the ship)
		const mx = (-dx * rx + (vy ? 0 : dy * fx)) * s;
		const mz = (-dx * rz + (vy ? 0 : dy * fz)) * s;
		if (vy) {
			const ny = Math.min(vy[1], Math.max(vy[0], c.target.y + dy * s));
			c.object.position.y += ny - c.target.y;
			c.target.y = ny;
		}
		let tx = c.target.x + mx, tz = c.target.z + mz;
		const r = Math.hypot(tx, tz), lim = this.lim.panR;
		if (r > lim) {
			tx *= lim / r;
			tz *= lim / r;
		}
		const ddx = tx - c.target.x, ddz = tz - c.target.z;
		c.target.x += ddx;
		c.target.z += ddz;
		c.object.position.x += ddx;
		c.object.position.z += ddz;
		c.update();
	}

	/** smooth animation to a view (and optionally a new target) */
	animateTo(to: Partial<View>, target?: [number, number, number], ms = 450) {
		const c = this.controls;
		if (!c) return;
		cancelAnimationFrame(this.anim);
		const from = this.read();
		const goal: View = { az: to.az ?? from.az, polar: to.polar ?? from.polar, dist: to.dist ?? from.dist };
		// shortest way round for azimuth deltas that came from absolute presets
		if (to.az !== undefined && Math.abs(goal.az - from.az) > Math.PI && !(to as { raw?: boolean }).raw) {
			goal.az += goal.az > from.az ? -2 * Math.PI : 2 * Math.PI;
		}
		const t0 = performance.now();
		const tFrom = c.target.clone();
		const tTo = target ? new Vector3(...target) : tFrom.clone();
		const step = (now: number) => {
			const k = Math.min(1, (now - t0) / ms);
			const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
			c.target.lerpVectors(tFrom, tTo, e);
			this.apply({
				az: from.az + (goal.az - from.az) * e,
				polar: from.polar + (goal.polar - from.polar) * e,
				dist: from.dist + (goal.dist - from.dist) * e
			});
			if (k < 1) this.anim = requestAnimationFrame(step);
		};
		this.anim = requestAnimationFrame(step);
	}

	/** ±step around the ship (relative, keeps going round past 360°) */
	orbitStep(rad: number) {
		const v = this.read();
		this.animateTo({ az: v.az + rad, raw: true } as Partial<View>, undefined, 400);
	}
	pitchStep(rad: number) {
		const v = this.read();
		this.animateTo({ polar: v.polar + rad }, undefined, 250);
	}
	zoom(factor: number) {
		const v = this.read();
		this.animateTo({ dist: v.dist * factor }, undefined, 250);
	}
	top() {
		this.animateTo({ polar: this.lim.polarMin, dist: Math.max(this.read().dist, 12) });
	}
	iso() {
		this.animateTo({ az: Math.PI / 4, polar: 0.96, dist: this.lim.panY ? this.home.dist : 11.5 });
	}
	reset(target?: [number, number, number]) {
		this.animateTo({ ...this.home }, target ?? (this.lim.panY ? this.homeTarget : [0, this.controls?.target.y ?? 0, 0]));
	}
	/** keep the view angle, move the target to a new deck height */
	followY(y: number) {
		const c = this.controls;
		if (!c || Math.abs(c.target.y - y) < 1e-4) return;
		this.animateTo({}, [c.target.x, y, c.target.z], 350);
	}
}

export const rig = new CameraRig();
