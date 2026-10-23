/**
 * Live door openness per placed item ("deck:uid" → 0 closed … 1 open), written by the crew sim
 * every frame and read by the door leaves in the renderer (plain map: no reactivity per frame).
 * Missing key = resting state of the door.
 */
export const doorOpen = new Map<string, number>();
export function doorValue(key: string | null | undefined, restOpen = false): number {
	if (!key) return restOpen ? 1 : 0;
	return doorOpen.get(key) ?? (restOpen ? 1 : 0);
}
