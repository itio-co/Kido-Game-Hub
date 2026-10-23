/** Build-bar categories for the HUD (catalog items + custom designs). */
import type { ModuleDef } from '$lib/game/types';
export const HUD_CATS = [
	{ id: 'crew', icon: '🛏', label: 'Crew' },
	{ id: 'galley', icon: '🍽', label: 'Galley' },
	{ id: 'health', icon: '🚿', label: 'Hygiene & fitness' },
	{ id: 'systems', icon: '🖥', label: 'Work & systems' },
	{ id: 'seating', icon: '💺', label: 'Launch seats' },
	{ id: 'microg', icon: '🪐', label: 'Micro-g' },
	{ id: 'custom', icon: '📐', label: 'Custom' }
] as const;
export type HudCat = (typeof HUD_CATS)[number]['id'];
const BY_ID: Record<string, HudCat> = {
	bunk: 'crew', crewpod: 'crew', sleepingbag: 'crew', partition: 'crew',
	galley: 'galley', table: 'galley', foodwarmer: 'galley', waterdispenser: 'galley', fridge: 'galley', pantry: 'galley', prepcounter: 'galley', trash: 'galley', foodstation: 'galley', galleytable: 'galley', chair: 'galley',
	hygiene: 'health', zerogtoilet: 'health', treadmill: 'health', ared: 'health',
	workstation: 'systems', workstation2: 'systems', hydroponics: 'systems', eclss: 'systems', locker: 'systems', hatch: 'systems',
	couch: 'seating', pilotcouch: 'seating', couchrow3: 'seating', couchrow4: 'seating',
	handrail: 'microg', footrestraint: 'microg'
};
export function catOf(d: ModuleDef): HudCat {
	if (d.custom || d.id.startsWith('custom')) return 'custom';
	if (BY_ID[d.id]) return BY_ID[d.id];
	if (d.category === 'Galley') return 'galley';
	if (d.category === 'Micro-g') return 'microg';
	if (d.category === 'Crew seating') return 'seating';
	return 'systems';
}
