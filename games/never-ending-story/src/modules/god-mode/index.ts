/** Public entry of God Mode. The admin page and API stay in the `god` module. */
export { default as GodFloat } from './GodFloat.svelte';
export { default as GodLogin } from './GodLogin.svelte';
export { godSessionActive } from './sessionProbe';
export { loginGod, classifyGodLoginError } from './login';
export { nextVersionTap, unlockShowsBubble, type TapClock } from './taps';
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
