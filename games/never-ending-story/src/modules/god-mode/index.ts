/** Public entry of God Mode. The admin page and API stay in the `god` module. */
export { default as GodFloat } from './GodFloat.svelte';
export { godSessionActive } from './sessionProbe';
export { GOD_MODE_VERSION } from './version';
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
