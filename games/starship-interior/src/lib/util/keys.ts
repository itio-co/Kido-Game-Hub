/**
 * Keyboard helpers. All game shortcuts match `KeyboardEvent.code` (physical key), never `key`,
 * so they work with any layout (Thai, AZERTY, …) and with an IME active.
 */
const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', '']);
/** true only while the user is typing into a text field (sliders, checkboxes, buttons don't count) */
export function isTyping(e: Event): boolean {
	const t = e.target as HTMLElement | null;
	if (!t || !t.tagName) return false;
	if (t.isContentEditable) return true;
	if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
	if (t.tagName === 'INPUT') return TEXT_TYPES.has(((t as HTMLInputElement).type || '').toLowerCase());
	return false;
}

/** Thai Kedmanee characters → physical key (only used when a browser / remote desktop reports no `code`) */
const THAI: Record<string, string> = { 'ำ': 'KeyE', 'ฎ': 'KeyE', 'ไ': 'KeyW', '"': 'KeyW', 'ฟ': 'KeyA', 'ฤ': 'KeyA', 'ห': 'KeyS', 'ฆ': 'KeyS', 'ก': 'KeyD', 'ฏ': 'KeyD', 'ๆ': 'KeyQ', '๐': 'KeyQ', 'แ': 'KeyC', 'ฉ': 'KeyC', 'ป': 'KeyX', ')': 'KeyX', 'ด': 'KeyF', 'โ': 'KeyF', 'อ': 'KeyV', 'ฮ': 'KeyV' };
/**
 * Physical key of an event. Normally `e.code`; some setups (remote desktop, VMs, a few IMEs or virtual
 * keyboards) send an empty / "Unidentified" code – then fall back to keyCode (A–Z, 0–9, Enter, Space, Esc)
 * or the Thai character.
 */
export function keyCode(e: KeyboardEvent): string {
	if (e.code && e.code !== 'Unidentified') return e.code;
	const k = e.keyCode || e.which || 0;
	if (k >= 65 && k <= 90) return 'Key' + String.fromCharCode(k);
	if (k >= 48 && k <= 57) return 'Digit' + String.fromCharCode(k);
	const named: Record<number, string> = { 13: 'Enter', 32: 'Space', 27: 'Escape', 9: 'Tab', 16: 'ShiftLeft', 33: 'PageUp', 34: 'PageDown', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' };
	if (named[k]) return named[k];
	if (e.key && e.key.length === 1) {
		if (/^[a-z]$/i.test(e.key)) return 'Key' + e.key.toUpperCase();
		if (THAI[e.key]) return THAI[e.key];
	}
	return e.code || '';
}
/** drop focus from a button / slider / select so game keys (Space, Enter, arrows, letters) don't operate it */
export function releaseFocus() {
	if (typeof document === 'undefined') return;
	const a = document.activeElement as HTMLElement | null;
	if (!a || a === document.body) return;
	if (a.tagName === 'TEXTAREA' || a.isContentEditable) return;
	if (a.tagName === 'INPUT' && TEXT_TYPES.has(((a as HTMLInputElement).type || '').toLowerCase())) return;
	a.blur();
}
