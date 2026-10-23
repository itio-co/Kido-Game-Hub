/** Shared PBR materials and procedural (offline) textures. */
import {
	CanvasTexture,
	Color,
	DoubleSide,
	MeshBasicMaterial,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	RepeatWrapping,
	SRGBColorSpace,
	type Material
} from 'three';

export type MatName =
	| 'steel'
	| 'steelDark'
	| 'white'
	| 'grey'
	| 'dark'
	| 'fabric'
	| 'mattress'
	| 'screen'
	| 'led'
	| 'grow'
	| 'plant'
	| 'glass'
	| 'rubber'
	| 'yellow'
	| 'green'
	| 'amber'
	| 'blue';

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	draw(c.getContext('2d')!);
	return c;
}

let brushed: CanvasTexture | undefined;
/** Brushed stainless streaks (horizontal), tileable. */
export function brushedTexture() {
	if (brushed) return brushed;
	const c = canvas(512, 512, (g) => {
		g.fillStyle = '#bfc4cb';
		g.fillRect(0, 0, 512, 512);
		for (let i = 0; i < 2600; i++) {
			const y = Math.random() * 512;
			const l = 40 + Math.random() * 300;
			const x = Math.random() * 512;
			const v = 170 + Math.random() * 70;
			g.strokeStyle = `rgba(${v},${v + 3},${v + 8},${0.08 + Math.random() * 0.12})`;
			g.lineWidth = Math.random() * 1.2 + 0.3;
			g.beginPath();
			g.moveTo(x, y);
			g.lineTo(x + l, y + (Math.random() - 0.5) * 1.5);
			g.stroke();
		}
	});
	brushed = new CanvasTexture(c);
	brushed.wrapS = brushed.wrapT = RepeatWrapping;
	brushed.repeat.set(6, 1);
	brushed.colorSpace = SRGBColorSpace;
	return brushed;
}

let floorTex: CanvasTexture | undefined;
/** Floor panels: 0.6 m panels with seams and fastener dots; texture spans 1.2 m. */
export function floorTexture() {
	if (floorTex) return floorTex;
	const c = canvas(512, 512, (g) => {
		g.fillStyle = '#8d939b';
		g.fillRect(0, 0, 512, 512);
		for (let i = 0; i < 4000; i++) {
			const v = 130 + Math.random() * 30;
			g.fillStyle = `rgba(${v},${v + 4},${v + 10},0.25)`;
			g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
		}
		g.strokeStyle = '#4b5057';
		g.lineWidth = 4;
		for (const p of [0, 256, 512]) {
			g.beginPath();
			g.moveTo(p, 0);
			g.lineTo(p, 512);
			g.moveTo(0, p);
			g.lineTo(512, p);
			g.stroke();
		}
		g.fillStyle = '#5d636b';
		for (const x of [14, 242, 270, 498])
			for (const y of [14, 242, 270, 498]) {
				g.beginPath();
				g.arc(x, y, 4, 0, Math.PI * 2);
				g.fill();
			}
	});
	floorTex = new CanvasTexture(c);
	floorTex.wrapS = floorTex.wrapT = RepeatWrapping;
	floorTex.repeat.set(1 / 1.2, 1 / 1.2); // floor UVs are in metres; one texture = 1.2 m
	floorTex.colorSpace = SRGBColorSpace;
	floorTex.anisotropy = 4;
	return floorTex;
}

const cache = new Map<string, Material>();

export function mat(name: MatName): Material {
	const hit = cache.get(name);
	if (hit) return hit;
	let m: Material;
	switch (name) {
		case 'steel':
			m = new MeshStandardMaterial({ color: '#d4d8de', metalness: 0.9, roughness: 0.32, map: brushedTexture() });
			break;
		case 'steelDark':
			m = new MeshStandardMaterial({ color: '#7d838c', metalness: 0.85, roughness: 0.4, map: brushedTexture() });
			break;
		case 'white':
			m = new MeshStandardMaterial({ color: '#e6e9ec', metalness: 0, roughness: 0.62 });
			break;
		case 'grey':
			m = new MeshStandardMaterial({ color: '#a7aeb6', metalness: 0.05, roughness: 0.6 });
			break;
		case 'dark':
			m = new MeshStandardMaterial({ color: '#2c3036', metalness: 0.2, roughness: 0.55 });
			break;
		case 'fabric':
			m = new MeshStandardMaterial({ color: '#56657a', roughness: 0.95 });
			break;
		case 'mattress':
			m = new MeshStandardMaterial({ color: '#d9dde3', roughness: 0.92 });
			break;
		case 'screen':
			m = new MeshStandardMaterial({ color: '#0a1522', emissive: '#4aa3ff', emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1 });
			break;
		case 'led':
			m = new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4e3', emissiveIntensity: 3 });
			break;
		case 'grow':
			m = new MeshStandardMaterial({ color: '#ffffff', emissive: '#ff6fd8', emissiveIntensity: 2.2 });
			break;
		case 'plant':
			m = new MeshStandardMaterial({ color: '#3f9d4a', roughness: 0.8, flatShading: true });
			break;
		case 'glass':
			m = new MeshPhysicalMaterial({ color: '#0d1826', metalness: 0.1, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 });
			break;
		case 'rubber':
			m = new MeshStandardMaterial({ color: '#1a1c1f', roughness: 0.95 });
			break;
		case 'yellow':
			m = new MeshStandardMaterial({ color: '#e5b300', roughness: 0.5 });
			break;
		case 'green':
			m = new MeshStandardMaterial({ color: '#0f3', emissive: '#2f6', emissiveIntensity: 2 });
			break;
		case 'amber':
			m = new MeshStandardMaterial({ color: '#fa0', emissive: '#fb3', emissiveIntensity: 2 });
			break;
		case 'blue':
			m = new MeshStandardMaterial({ color: '#4aa3ff', emissive: '#4aa3ff', emissiveIntensity: 1.5 });
			break;
	}
	m.name = name;
	cache.set(name, m);
	return m;
}

const ghosts = new Map<string, MeshBasicMaterial>();
export function ghostMat(color: string): MeshBasicMaterial {
	let m = ghosts.get(color);
	if (!m) {
		m = new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.38, depthWrite: false });
		ghosts.set(color, m);
	}
	return m;
}

const flats = new Map<string, MeshBasicMaterial>();
/** Flat translucent overlay (zones, footprints). */
export function overlayMat(color: string, opacity: number): MeshBasicMaterial {
	const k = color + opacity;
	let m = flats.get(k);
	if (!m) {
		m = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide });
		flats.set(k, m);
	}
	return m;
}
