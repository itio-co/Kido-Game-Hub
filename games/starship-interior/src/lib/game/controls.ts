/**
 * Key bindings shown in Options → Controls. Keys are physical keys (KeyboardEvent.code), so they work on
 * Thai / AZERTY layouts. `keys` is a list of alternatives; a "+" inside one entry means a chord.
 */
export interface Binding {
	keys: string[];
	action: string;
	note?: string;
}
export interface BindingGroup {
	id: string;
	title: string;
	icon: string;
	touch?: boolean;
	bindings: Binding[];
}

export const CONTROL_GROUPS: BindingGroup[] = [
	{
		id: 'touch',
		title: 'Mobile touch gestures',
		icon: '👆',
		touch: true,
		bindings: [
			{ keys: ['Tap'], action: 'Select a module / pick a card', note: 'Select tool' },
			{ keys: ['Tap', 'Tap again'], action: 'Place: preview, then confirm', note: 'or ✓ Place; ✕ cancels' },
			{ keys: ['Drag'], action: 'Move the selected item / ghost' },
			{ keys: ['1-finger drag'], action: 'Orbit on empty space', note: 'Select tool' },
			{ keys: ['2-finger drag'], action: 'Orbit or pan the camera', note: 'set under Building → Touch' },
			{ keys: ['Pinch'], action: 'Zoom' },
			{ keys: ['⟲', '⟳', '90°'], action: 'Rotate the selection (on-screen buttons)' },
			{ keys: ['Joystick'], action: 'Walk / fly (walk, crew, cruise)' },
			{ keys: ['Drag'], action: 'Look around (walk, crew, cruise)' },
			{ keys: ['Interact'], action: 'Use / sit / climb (hold for more actions)' },
			{ keys: ['▲ Up', '▼ Down'], action: 'Climb at a ladder or hatch' }
		]
	},
	{
		id: 'build',
		title: 'Build',
		icon: '🧱',
		bindings: [
			{ keys: ['1'], action: 'Select tool' },
			{ keys: ['2'], action: 'Place tool' },
			{ keys: ['3'], action: 'Measure tool', note: 'click two points' },
			{ keys: ['4'], action: 'Camera tool' },
			{ keys: ['Click'], action: 'Place / select', note: 'drag a module to move it' },
			{ keys: ['Q', 'E'], action: 'Rotate 15° while placing or with a selection', note: 'also Shift+wheel' },
			{ keys: ['Alt+Q', 'Alt+E'], action: 'Rotate 1°' },
			{ keys: ['R'], action: 'Rotate 90°' },
			{ keys: ['G'], action: 'Snap on / off (0.25 m / 15°)' },
			{ keys: ['Del', 'Backspace', 'Right-click'], action: 'Delete the selection' },
			{ keys: ['L'], action: 'Lock / unlock the selection' },
			{ keys: ['Ctrl+Z'], action: 'Undo lock change' },
			{ keys: ['Ctrl+Shift+Z', 'Ctrl+Y'], action: 'Redo lock change' },
			{ keys: ['PgUp', 'PgDn'], action: 'View deck above / below', note: 'also Shift+Q/E, or Q/E with nothing selected' },
			{ keys: ['Esc'], action: 'Cancel / deselect / back to Select', note: 'again (nothing selected) opens this menu' },
			{ keys: ['F'], action: 'Walk mode on / off' }
		]
	},
	{
		id: 'camera',
		title: 'Camera (build)',
		icon: '🎥',
		bindings: [
			{ keys: ['Left-drag'], action: 'Orbit 360° (on empty space)' },
			{ keys: ['Right-drag'], action: 'Pan' },
			{ keys: ['Middle-drag'], action: 'Orbit' },
			{ keys: ['Wheel', '+', '−'], action: 'Zoom' },
			{ keys: ['←', '→'], action: 'Orbit 15°' },
			{ keys: ['↑', '↓'], action: 'Tilt' },
			{ keys: ['⟲', '⟳', 'Top', 'Iso', 'Reset'], action: 'Camera widget (top-right)' }
		]
	},
	{
		id: 'walk',
		title: 'Walk',
		icon: '🚶',
		bindings: [
			{ keys: ['Click'], action: 'Capture the mouse to look around' },
			{ keys: ['W', 'A', 'S', 'D'], action: 'Move' },
			{ keys: ['Shift'], action: 'Run' },
			{ keys: ['E'], action: 'Interact: use / sit / climb / repair what you look at', note: 'single action acts on key-down' },
			{ keys: ['Shift+E', 'Hold E'], action: 'More actions (pick with 1–9)' },
			{ keys: ['Enter'], action: 'Run the best action' },
			{ keys: ['Space', 'PgUp'], action: 'Climb up at a ladder' },
			{ keys: ['Q', 'C', 'PgDn'], action: 'Climb down at a ladder' },
			{ keys: ['F9'], action: 'Interact debug overlay' },
			{ keys: ['Esc'], action: 'Release the mouse' },
			{ keys: ['F'], action: 'Back to build mode' }
		]
	},
	{
		id: 'crew',
		title: 'Crew control (possess)',
		icon: '🧑‍🚀',
		bindings: [
			{ keys: ['W', 'A', 'S', 'D'], action: 'Move the crew member' },
			{ keys: ['E'], action: 'Interact (best action)' },
			{ keys: ['Shift+E', 'Hold E'], action: 'More actions (1–9)' },
			{ keys: ['X'], action: 'Stop the current activity' },
			{ keys: ['V'], action: 'First / third person' },
			{ keys: ['Space', 'PgUp'], action: 'Climb up' },
			{ keys: ['Q', 'C', 'PgDn'], action: 'Climb down' },
			{ keys: ['Esc'], action: 'Release the crew member' }
		]
	},
	{
		id: 'cruise',
		title: 'Cruise micro-g (6-DOF)',
		icon: '🛰',
		bindings: [
			{ keys: ['W', 'A', 'S', 'D'], action: 'Translate in the body frame' },
			{ keys: ['Space', 'R'], action: 'Up along the body axis' },
			{ keys: ['Ctrl', 'F'], action: 'Down along the body axis' },
			{ keys: ['Z', 'C'], action: 'Roll' },
			{ keys: ['Shift'], action: 'Stronger push-off' },
			{ keys: ['E'], action: 'Interact / fly through a hatch / grab a handhold' },
			{ keys: ['G'], action: 'Grab (stop) when in reach' },
			{ keys: ['T'], action: 'Reorient to deck-up' },
			{ keys: ['PgUp', 'PgDn'], action: 'Auto-fly to the next / previous deck' },
			{ keys: ['X'], action: 'Stop the current activity' },
			{ keys: ['Esc'], action: 'Release' }
		]
	},
	{
		id: 'designer',
		title: 'Equipment designer',
		icon: '📐',
		bindings: [
			{ keys: ['T', 'R', 'S'], action: 'Gizmo: move / rotate / scale' },
			{ keys: ['D'], action: 'Duplicate part' },
			{ keys: ['M'], action: 'Mirror part (object mode) / merge (edit mode)' },
			{ keys: ['Del'], action: 'Delete part / selection' },
			{ keys: ['Tab'], action: 'Object ↔ edit mode' },
			{ keys: ['1', '2', '3', '4'], action: 'Object / vertex / edge / face mode' },
			{ keys: ['E', 'I', 'B'], action: 'Extrude / inset / bevel (edit mode)' },
			{ keys: ['A'], action: 'Select all (edit mode)' },
			{ keys: ['N', 'Shift+N'], action: 'Flip / recalculate normals' },
			{ keys: ['Ctrl+Z', 'Ctrl+Shift+Z'], action: 'Undo / redo' },
			{ keys: ['Esc'], action: 'Deselect' }
		]
	},
	{
		id: 'menu',
		title: 'Menu',
		icon: '⚙',
		bindings: [
			{ keys: ['⚙'], action: 'Open Options (top bar)' },
			{ keys: ['F10', 'O'], action: 'Open / close Options (any mode)' },
			{ keys: ['Esc'], action: 'Close Options' }
		]
	}
];

/** groups filtered by a free-text query (matches action, note or key names) */
export function filterBindings(q: string, touchFirst: boolean): BindingGroup[] {
	const t = q.trim().toLowerCase();
	const groups = touchFirst ? CONTROL_GROUPS : [...CONTROL_GROUPS.filter((g) => !g.touch), ...CONTROL_GROUPS.filter((g) => g.touch)];
	if (!t) return groups;
	return groups
		.map((g) => ({
			...g,
			bindings: g.title.toLowerCase().includes(t)
				? g.bindings
				: g.bindings.filter((b) => b.action.toLowerCase().includes(t) || (b.note ?? '').toLowerCase().includes(t) || b.keys.some((k) => k.toLowerCase() === t || (t.length > 1 && k.toLowerCase().includes(t))))
		}))
		.filter((g) => g.bindings.length);
}
