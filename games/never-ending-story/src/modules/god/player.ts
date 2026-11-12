/** Player-shell entry. The admin page keeps using index.ts so the game does not have to boot God.svelte. */
export { default as GodFloat } from './GodFloat.svelte';
export { godSessionActive } from './sessionProbe';
export { GOD_VERSION } from './version';
export {
  GOD_FLOAT_KEY,
  defaultFloatPrefs,
  godAdminUrl,
  godButtonVisible,
  godFloatVisible,
  loadFloatPrefs,
  parseFloatPrefs,
  saveFloatPrefs,
  type FloatPrefs,
} from './floatState';
export { inspectDocument, inspectText, redact, type InspectPage } from './inspect';
