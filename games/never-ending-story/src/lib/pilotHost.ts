/**
 * Loads the rhythm and stirfry pilot chunks from modules/manifest.json.
 * A pinned version with no retained chunk, or a failed fetch, uses the code bundled in this build.
 * Ruleset numbers still come from ruleset.json either way.
 */
import { chunkFile, isPilotManifest, pinnedPilotVersion, type PilotManifest } from './pilotManifest.ts';

export type PilotModule = Record<string, unknown>;

declare global {
  var __NES_LOAD_PILOT__: ((id: string, version?: string | null) => Promise<PilotModule>) | undefined;
}

type PilotGlobal = typeof globalThis & {
  __NES_LOAD_PILOT__?: (id: string, version?: string | null) => Promise<PilotModule>;
};

const BUNDLED: Record<string, () => Promise<PilotModule>> = {
  rhythm: () => import('../modules/rhythm/index.ts') as Promise<PilotModule>,
  stirfry: () => import('../modules/stirfry/index.ts') as Promise<PilotModule>,
};

let manifestTask: Promise<PilotManifest | null> | null = null;

export { pinnedPilotVersion } from './pilotManifest.ts';

export function readPilotManifest(): Promise<PilotManifest | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (!manifestTask) {
    const url = new URL('modules/manifest.json', document.baseURI).href;
    manifestTask = fetch(url, { cache: 'no-store' })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((body) => (isPilotManifest(body) ? body : null))
      .catch(() => null);
  }
  return manifestTask;
}

export async function loadPilot(id: string, version?: string | null): Promise<PilotModule> {
  const pinned = version === undefined ? pinnedPilotVersion(id, typeof location === 'undefined' ? '' : location.hash) : version;
  const manifest = await readPilotManifest();
  const hit = chunkFile(manifest, id, pinned);
  if (hit && typeof document !== 'undefined') {
    try {
      return (await import(/* @vite-ignore */ new URL(hit.file, document.baseURI).href)) as PilotModule;
    } catch {
      /* The retained file is missing or failed. Current bundled code still plays that ruleset. */
    }
  }
  const load = BUNDLED[id];
  if (!load) throw new Error(`unknown pilot module ${id}`);
  return load();
}

/** Chunks call this instead of importing the host, so an old chunk survives a later core deploy. */
export function installPilotHost(): void {
  const host = globalThis as PilotGlobal;
  host.__NES_LOAD_PILOT__ = (id, version) => loadPilot(id, version);
}
