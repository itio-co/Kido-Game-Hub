/**
 * Stylised 1.75 m crew avatar: dimensions and procedural poses.
 *
 * All joint rotations are about the local X axis (sagittal plane) plus a small Z splay for arms.
 * In the YZ plane a rotation by `a` about X turns a segment's world angle θ (0 = +Z, 90° = up)
 * into θ − a, so chains add up: θ_segment = θ_rest − Σ rotations. That makes posing from desired
 * world angles (e.g. the couch body line) trivial.
 */
export const BODY = {
	hipY: 0.92, // hip joint height standing
	thigh: 0.43,
	shin: 0.43,
	torso: 0.5, // hip joint → shoulder line
	upperArm: 0.3,
	forearm: 0.27,
	headR: 0.11,
	shoulderW: 0.2,
	hipW: 0.095,
	radius: 0.3 // navigation body radius (incl. personal space)
};

export type PoseName = 'stand' | 'walk' | 'climb' | 'sit' | 'sitwork' | 'sleep' | 'exercise' | 'work' | 'couch' | 'wait' | 'eat' | 'wash';

export interface PoseFrame {
	/** hip joint offset above the avatar origin (origin = floor point / slot point) */
	hipY: number;
	hipZ: number;
	/** whole-body pitch about X (rad); −π/2 = lying on the back, head towards −Z */
	root: number;
	spine: number;
	head: number;
	thighL: number;
	thighR: number;
	kneeL: number;
	kneeR: number;
	armL: number;
	armR: number;
	elbowL: number;
	elbowR: number;
	splay: number;
}

const D = Math.PI / 180;
const base = (): PoseFrame => ({ hipY: BODY.hipY, hipZ: 0, root: 0, spine: 0, head: 0, thighL: 0, thighR: 0, kneeL: 0, kneeR: 0, armL: 0, armR: 0, elbowL: 0, elbowR: 0, splay: 0.08 });

/** couch posture from the couch model's occupant angles (world angles in degrees) */
export function couchFrame(o: { hip: [number, number]; torsoDeg: number; thighDeg: number; shinDeg: number }): PoseFrame {
	const f = base();
	const a = 90 - o.torsoDeg; // root pitch: torso rest angle 90° → torsoDeg
	const t = -90 - a - o.thighDeg; // thigh rest −90°
	const k = -90 - a - t - o.shinDeg; // shin rest −90° relative
	f.root = a * D;
	f.thighL = f.thighR = t * D;
	f.kneeL = f.kneeR = k * D;
	f.hipY = o.hip[1];
	f.hipZ = o.hip[0];
	// arms along the body, forearms on the armrests / hands on the controls
	f.armL = f.armR = -25 * D;
	f.elbowL = f.elbowR = -55 * D;
	f.head = -12 * D;
	return f;
}

/**
 * Pose at time t (s, animation clock) with gait parameters:
 *  `g` = gravity factor (1 = Earth); lower gravity → slower cadence, more bounce (cosmetic only)
 */
export function frameFor(pose: PoseName, t: number, g = 1, couch?: PoseFrame, seatY = 0.46): PoseFrame {
	const f = base();
	const cad = 1.9 * Math.pow(g, 0.35); // steps/s
	switch (pose) {
		case 'walk': {
			const ph = t * cad * Math.PI;
			const s = Math.sin(ph);
			f.thighL = s * 0.45;
			f.thighR = -s * 0.45;
			f.kneeL = Math.max(0, -Math.cos(ph)) * 0.6 + 0.05;
			f.kneeR = Math.max(0, Math.cos(ph)) * 0.6 + 0.05;
			f.armL = -s * 0.4;
			f.armR = s * 0.4;
			f.elbowL = f.elbowR = -0.25;
			const bounce = 0.025 * Math.pow(1 / g, 0.45);
			f.hipY = BODY.hipY - 0.02 + Math.abs(Math.cos(ph)) * bounce;
			f.spine = 0.04;
			break;
		}
		case 'climb': {
			const ph = t * 2.2 * Math.PI;
			const s = Math.sin(ph);
			f.thighL = -0.6 - s * 0.35;
			f.thighR = -0.6 + s * 0.35;
			f.kneeL = 0.9 + s * 0.35;
			f.kneeR = 0.9 - s * 0.35;
			f.armL = Math.PI * 0.85 + s * 0.25;
			f.armR = Math.PI * 0.85 - s * 0.25;
			f.armL *= -1;
			f.armR *= -1;
			f.elbowL = -0.5 + s * 0.3;
			f.elbowR = -0.5 - s * 0.3;
			f.hipY = BODY.hipY - 0.1;
			break;
		}
		case 'sit':
		case 'sitwork':
		case 'eat': {
			f.hipY = seatY + 0.08;
			f.hipZ = -0.05;
			f.root = 0.06;
			f.thighL = f.thighR = -88 * D;
			f.kneeL = f.kneeR = 88 * D;
			f.armL = f.armR = pose === 'sit' ? -0.2 : -0.75;
			f.elbowL = f.elbowR = pose === 'sit' ? -0.5 : -1.0;
			if (pose === 'sitwork') {
				f.armL += Math.sin(t * 7) * 0.05;
				f.armR -= Math.sin(t * 6.3) * 0.05;
				f.head = 0.12;
			}
			if (pose === 'eat') {
				const m = Math.max(0, Math.sin(t * 1.4));
				f.armR = -0.75 - m * 0.55;
				f.elbowR = -1.0 - m * 0.9;
				f.head = 0.1 - m * 0.1;
			}
			break;
		}
		case 'sleep': {
			f.root = -Math.PI / 2;
			f.hipY = 0.13; // lying: hip joint 0.13 m above the mattress top (slot y)
			f.hipZ = 0;
			const br = Math.sin(t * 1.1) * 0.015;
			f.spine = br;
			f.armL = f.armR = -0.15;
			f.elbowL = f.elbowR = -0.35;
			f.thighL = -0.05;
			f.thighR = -0.12;
			f.kneeL = 0.08;
			f.kneeR = 0.2;
			f.head = 0.1;
			break;
		}
		case 'exercise': {
			const ph = t * 2.9 * Math.PI; // running in place on the treadmill
			const s = Math.sin(ph);
			f.thighL = s * 0.7;
			f.thighR = -s * 0.7;
			f.kneeL = Math.max(0, -Math.cos(ph)) * 1.2 + 0.1;
			f.kneeR = Math.max(0, Math.cos(ph)) * 1.2 + 0.1;
			f.armL = -s * 0.7;
			f.armR = s * 0.7;
			f.elbowL = f.elbowR = -1.4;
			f.hipY = BODY.hipY - 0.04 + Math.abs(Math.cos(ph)) * 0.05;
			f.spine = 0.12;
			break;
		}
		case 'work':
		case 'wash': {
			// standing, hands forward at counter / rack height
			const w = Math.sin(t * (pose === 'wash' ? 5 : 2.2));
			f.armL = -0.9 + w * 0.12;
			f.armR = -0.9 - w * 0.12;
			f.elbowL = f.elbowR = -0.7;
			f.spine = 0.12;
			f.head = 0.15;
			f.hipY = BODY.hipY - 0.005;
			break;
		}
		case 'couch':
			if (couch) return { ...couch, head: couch.head + Math.sin(t * 0.6) * 0.03 };
			break;
		case 'wait':
		case 'stand':
		default: {
			const b = Math.sin(t * 1.2);
			f.armL = 0.05 + b * 0.02;
			f.armR = 0.05 - b * 0.02;
			f.elbowL = f.elbowR = -0.15;
			f.hipY = BODY.hipY - 0.005 + b * 0.003;
			if (pose === 'wait') {
				// arms crossed-ish, weight shift
				f.armL = f.armR = -0.55;
				f.elbowL = f.elbowR = -1.7;
				f.splay = 0.02;
				f.hipZ = Math.sin(t * 0.8) * 0.02;
			}
		}
	}
	return f;
}

export interface AvatarState {
	x: number;
	y: number;
	z: number;
	yaw: number;
	pose: PoseName;
	t: number;
	visible: boolean;
	couch?: PoseFrame;
	seatY?: number;
}
