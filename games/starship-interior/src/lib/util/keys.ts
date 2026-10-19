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
