/** Public entry of God Mode. The admin page and API stay in the `god` module. */
export { default as GodFloat } from './GodFloat.svelte';
export { default as GodLogin } from './GodLogin.svelte';
export { godSessionActive } from './sessionProbe';
export { godAccessRole } from './access';
export { loginGod, classifyGodLoginError } from './login';
export { nextVersionTap, unlockShowsBubble, type TapClock } from './taps';
export { GOD_MODE_VERSION } from './version';
export {
  GOD_FLOAT_KEY,
  defaultFloatPrefs,
  godAdminLinkVisible,
  godWishVisible,
  godAdminUrl,
  godButtonVisible,
  godFloatVisible,
  loadFloatPrefs,
  parseFloatPrefs,
  saveFloatPrefs,
  type FloatPrefs,
} from './floatState';
export { inspectDocument, inspectText, redact, type InspectPage } from './inspect';
export { failureOf, sendWish, stampText, wishPayload, wishProblem, WISH_MAX_TEXT, type WishFailure, type WishPayload, type WishSent } from './wish';
export { captureElement, dataUrlBytes, SHOT_MAX_BYTES } from './capture';
