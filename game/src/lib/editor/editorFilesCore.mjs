// Shared by the dev-server save API (scripts/editorFilesPlugin.mjs, Node) and the editor UI (browser).
// Pure: no Node or DOM APIs. Types: editorFilesCore.d.mts.

/** Dev-only endpoint (vite serve). */
export const API_PATH = '/__editor/files';
/** Required on POST: a custom header forces a CORS preflight, so a cross-site page cannot post blind. */
export const API_HEADER = 'x-kido-editor';
export const FORMAT_MATCH = 'kido-camera-match-source/1';
export const FORMAT_EDITS = 'kido-model-edits-source/1';
/** Per JSON file (serialised) and per GLB (decoded). */
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_GLB_BYTES = 32 * 1024 * 1024;
/** Whole POST body (GLB travels base64: ×4/3). */
export const MAX_BODY_BYTES = 48 * 1024 * 1024;

const ITEM_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const VARIANT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** `player-room/nightstand` → `nightstand` (the folder under game/assets-src/). */
export function itemOfSlug(slug) {
  const item = String(slug).split('/').pop() ?? '';
  return isValidItem(item) ? item : null;
}
export function isValidItem(item) {
  return typeof item === 'string' && ITEM_RE.test(item);
}
export function isValidVariant(id) {
  return typeof id === 'string' && VARIANT_RE.test(id);
}
export const matchFileName = () => 'camera-match.json';
export const editsFileName = (variant) => `${variant}.edits.json`;
export const glbFileName = (variant) => `${variant}-edited.glb`;

/**
 * What kind of file a name is, or null when the name is not allowed. Only three plain names exist:
 * `camera-match.json`, `<variant>.edits.json`, `<variant>-edited.glb` (lower-case slug chars only, so no
 * separators, dots, drive letters, `..`, NUL or Windows device tricks can get through).
 */
export function fileKind(name) {
  if (typeof name !== 'string' || name.length > 100) return null;
  if (name === 'camera-match.json') return 'match';
  let m = /^(.+)\.edits\.json$/.exec(name);
  if (m && isValidVariant(m[1])) return 'edits';
  m = /^(.+)-edited\.glb$/.exec(name);
  if (m && isValidVariant(m[1])) return 'glb';
  return null;
}
/** Windows reserved device names (CON, NUL, COM1…) are refused even with an extension. */
export function isReservedName(name) {
  return /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(name);
}

/** game/assets-src/<item>/editor (POSIX separators, for messages and `git add`). */
export const editorDirRel = (item) => `game/assets-src/${item}/editor`;

/** Strip a BOM and turn CRLF / CR into LF (files checked out on Windows with autocrlf). */
export function normalizeText(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function normNum(v) {
  if (!Number.isFinite(v)) return null;
  return Object.is(v, -0) ? 0 : v;
}
/** Deep copy with sorted keys, undefined dropped, -0 → 0, non-finite → null (what JSON can say stably). */
export function canonicalize(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return normNum(v);
  if (Array.isArray(v)) return v.map((x) => (x === undefined || typeof x === 'function' ? null : canonicalize(x)));
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const x = v[k];
      if (x === undefined || typeof x === 'function') continue;
      out[k] = canonicalize(x);
    }
    return out;
  }
  return null;
}

const isFlat = (a) => a.every((x) => x === null || typeof x !== 'object');
/**
 * Stable, diff-friendly JSON: keys sorted, 2-space indent, arrays of plain values on one line
 * (points, vectors, matrices rows), LF line ends and a final newline — byte-identical for equal data
 * on every OS.
 */
export function stableStringify(value) {
  const walk = (v, pad) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    const inner = pad + '  ';
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      if (isFlat(v)) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      return `[\n${v.map((x) => inner + walk(x, inner)).join(',\n')}\n${pad}]`;
    }
    const keys = Object.keys(v);
    if (!keys.length) return '{}';
    return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${walk(v[k], inner)}`).join(',\n')}\n${pad}}`;
  };
  return walk(canonicalize(value), '') + '\n';
}
/** Same text ⇔ same data (used to compare a draft with the committed file). */
export const sameData = (a, b) => stableStringify(a) === stableStringify(b);
