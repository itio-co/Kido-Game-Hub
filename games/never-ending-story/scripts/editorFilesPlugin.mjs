// Dev-only save API for the 3D editor: lets `npm run dev` write the editor's work into
// game/assets-src/<item>/editor/ so it can be committed. Never part of a build (apply: 'serve').
//
//   GET  /__editor/files?item=nightstand   → { ok, item, dir, files: { name: json }, binaries: [{ name, bytes }] }
//   POST /__editor/files                   ← { item, files: [{ name, json } | { name, base64 }] }
//                                          → { ok, dir, written: [{ name, path, bytes, changed }], git }
//
// Guards: loopback clients only, Host must be localhost (DNS rebinding), Origin (when sent) must be the
// same localhost origin, POST needs JSON + the x-kido-editor header (forces a CORS preflight), item and
// file names are whitelisted, the resolved path must stay inside assets-src/<item>/editor (also after
// resolving symlinks), body and file sizes are capped, writes are atomic (temp file + rename).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  API_PATH, API_HEADER, MAX_BODY_BYTES, MAX_GLB_BYTES, MAX_JSON_BYTES,
  editorDirRel, fileKind, isReservedName, isValidItem, normalizeText, stableStringify,
} from '../src/lib/editor/editorFilesCore.mjs';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function isLoopback(addr) {
  return typeof addr === 'string' && (LOOPBACK.has(addr) || /^127\.\d+\.\d+\.\d+$/.test(addr) || /^::ffff:127\./.test(addr));
}
/** `localhost:5173` → `localhost`; `[::1]:5173` → `[::1]`. */
export function hostName(hostHeader) {
  if (typeof hostHeader !== 'string' || !hostHeader) return null;
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(hostHeader.trim().toLowerCase());
  return m ? m[1] : null;
}
export function isLocalHost(hostHeader) {
  const h = hostName(hostHeader);
  return !!h && LOCAL_HOSTS.has(h);
}
/** No Origin (same-origin GET, curl) is fine; otherwise it must be http(s)://<the same local Host>. */
export function isAllowedOrigin(origin, hostHeader) {
  if (origin === undefined) return true;
  if (typeof origin !== 'string' || origin === 'null') return false;
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (!LOCAL_HOSTS.has(u.hostname.toLowerCase())) return false;
  return typeof hostHeader === 'string' && u.host.toLowerCase() === hostHeader.trim().toLowerCase();
}

const inside = (root, p) => {
  const rel = path.relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/**
 * Absolute path of `assetsRoot/<item>/editor/<name>` after validating every piece. The item folder must
 * already exist (no new assets are created this way); `editor/` itself may be missing (mkdir on write).
 */
export function resolveEditorPath(assetsRoot, item, name) {
  if (!isValidItem(item)) throw new HttpError(400, `bad item ${JSON.stringify(String(item).slice(0, 80))}`);
  const kind = name === undefined ? 'dir' : fileKind(name);
  if (!kind || (name !== undefined && isReservedName(name))) throw new HttpError(400, `file name not allowed: ${JSON.stringify(String(name).slice(0, 80))}`);
  const root = path.resolve(assetsRoot);
  const itemDir = path.join(root, item);
  if (!inside(root, itemDir)) throw new HttpError(400, 'path escapes assets-src');
  let st;
  try {
    st = fs.lstatSync(itemDir);
  } catch {
    throw new HttpError(404, `no such asset folder: assets-src/${item}`);
  }
  if (!st.isDirectory() || st.isSymbolicLink()) throw new HttpError(400, 'asset folder must be a real directory');
  const dir = path.join(itemDir, 'editor');
  if (fs.existsSync(dir)) {
    const real = fs.realpathSync(dir);
    if (!inside(fs.realpathSync(root), real) || fs.lstatSync(dir).isSymbolicLink()) throw new HttpError(400, 'editor folder must be a real directory inside assets-src');
  }
  if (name === undefined) return dir;
  const file = path.join(dir, name);
  if (path.dirname(file) !== dir) throw new HttpError(400, 'path escapes the editor folder');
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new HttpError(400, 'refusing to write through a symlink');
  return file;
}

/** Write via a temp file in the same folder + rename (retries briefly on Windows sharing errors). */
export function atomicWrite(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, data);
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      lastErr = err;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err?.code)) break;
      const until = Date.now() + 40 * (i + 1);
      while (Date.now() < until) { /* short spin: an editor/AV scanner holding the file on Windows */ }
    }
  }
  try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  throw lastErr;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new HttpError(413, `body over ${limit} bytes`));
      req.resume();
      return;
    }
    let size = 0;
    const chunks = [];
    let failed = false;
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(413, `body over ${limit} bytes`));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !failed && resolve(Buffer.concat(chunks)));
    req.on('error', (e) => !failed && reject(e));
  });
}

/** Folder for `git add` / messages, relative to the repo root when one is found. */
function displayDir(assetsRoot, item) {
  let d = path.resolve(assetsRoot);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, '.git'))) return path.relative(d, path.join(assetsRoot, item, 'editor')).split(path.sep).join('/');
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return editorDirRel(item);
}

function listFiles(assetsRoot, item) {
  const dir = resolveEditorPath(assetsRoot, item);
  const files = {};
  const binaries = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      const kind = fileKind(name);
      if (!kind) continue;
      const file = path.join(dir, name);
      const st = fs.lstatSync(file);
      if (!st.isFile()) continue;
      if (kind === 'glb') binaries.push({ name, bytes: st.size });
      else if (st.size <= MAX_JSON_BYTES) {
        try {
          files[name] = JSON.parse(normalizeText(fs.readFileSync(file, 'utf8')));
        } catch {
          files[name] = { error: 'invalid JSON' };
        }
      }
    }
  }
  return { ok: true, item, dir: displayDir(assetsRoot, item), files, binaries };
}

function writeFiles(assetsRoot, body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'body must be a JSON object');
  const { item, files } = body;
  if (!Array.isArray(files) || !files.length || files.length > 16) throw new HttpError(400, 'files must be a non-empty array (≤ 16)');
  // validate everything before touching the disk
  const plan = files.map((f) => {
    if (!f || typeof f !== 'object') throw new HttpError(400, 'bad file entry');
    const file = resolveEditorPath(assetsRoot, item, f.name);
    const kind = fileKind(f.name);
    let data;
    if (kind === 'glb') {
      if (typeof f.base64 !== 'string') throw new HttpError(400, `${f.name}: base64 expected`);
      data = Buffer.from(f.base64, 'base64');
      if (data.length > MAX_GLB_BYTES) throw new HttpError(413, `${f.name}: over ${MAX_GLB_BYTES} bytes`);
      if (data.length < 12 || data.toString('latin1', 0, 4) !== 'glTF') throw new HttpError(400, `${f.name}: not a binary glTF`);
    } else {
      if (!f.json || typeof f.json !== 'object' || Array.isArray(f.json)) throw new HttpError(400, `${f.name}: json object expected`);
      data = Buffer.from(stableStringify(f.json), 'utf8');
      if (data.length > MAX_JSON_BYTES) throw new HttpError(413, `${f.name}: over ${MAX_JSON_BYTES} bytes`);
    }
    return { name: f.name, file, data };
  });
  const names = new Set(plan.map((p) => p.name));
  if (names.size !== plan.length) throw new HttpError(400, 'duplicate file names');
  const dir = displayDir(assetsRoot, item);
  const written = plan.map(({ name, file, data }) => {
    let same = false;
    try {
      const old = fs.readFileSync(file);
      same = fileKind(name) === 'glb' ? old.equals(data) : normalizeText(old.toString('utf8')) === data.toString('utf8');
    } catch { /* new file */ }
    if (!same) atomicWrite(file, data);
    return { name, path: `${dir}/${name}`, bytes: data.length, changed: !same };
  });
  return { ok: true, item, dir, written, git: `git add ${dir} && git commit -m "editor: save ${item} work"` };
}

function send(res, status, obj) {
  const text = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(text);
}

/** Connect-style middleware (exported for tests). */
export function createEditorFilesHandler({ assetsRoot, log = () => {} }) {
  return async function editorFiles(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== API_PATH) return next();
    try {
      if (!isLoopback(req.socket?.remoteAddress)) throw new HttpError(403, 'loopback clients only');
      if (!isLocalHost(req.headers.host)) throw new HttpError(403, 'Host must be localhost');
      if (!isAllowedOrigin(req.headers.origin, req.headers.host)) throw new HttpError(403, 'cross-origin request refused');
      const site = req.headers['sec-fetch-site'];
      if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'cross-site request refused');
      if (req.method === 'GET' || req.method === 'HEAD') {
        send(res, 200, listFiles(assetsRoot, url.searchParams.get('item')));
        return;
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        throw new HttpError(405, 'GET or POST');
      }
      if (req.headers[API_HEADER] !== '1') throw new HttpError(403, `missing ${API_HEADER} header`);
      if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'application/json expected');
      const raw = await readBody(req, MAX_BODY_BYTES);
      let body;
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        throw new HttpError(400, 'invalid JSON');
      }
      const out = writeFiles(assetsRoot, body);
      for (const w of out.written) log(`${w.changed ? 'wrote' : 'unchanged'} ${w.path} (${w.bytes} B)`);
      send(res, 200, out);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) log(`error: ${err?.stack ?? err}`);
      send(res, status, { ok: false, error: err instanceof HttpError ? err.message : 'internal error' });
    }
  };
}

/** Vite plugin: dev server only. */
export function editorFilesPlugin() {
  let assetsRoot = '';
  return {
    name: 'kido-editor-files',
    apply: 'serve',
    config() {
      // Saving must not trigger HMR / a full reload of the editor (the files are also bundled as baselines).
      return { server: { watch: { ignored: ['**/assets-src/*/editor/**'] } } };
    },
    configResolved(config) {
      assetsRoot = path.join(config.root, 'assets-src');
    },
    configureServer(server) {
      const logger = server.config.logger;
      server.middlewares.use(createEditorFilesHandler({ assetsRoot, log: (m) => logger.info(`[editor-files] ${m}`, { timestamp: true }) }));
    },
  };
}
