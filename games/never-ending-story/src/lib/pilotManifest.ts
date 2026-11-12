/** Pure manifest math for the rhythm/stirfry pilot. No DOM and no network. */

export const PILOT_IDS = ['rhythm', 'stirfry'] as const;
export type PilotId = (typeof PILOT_IDS)[number];

export type PilotChunk = { file: string; hash: string; sourceHash?: string; firstBuild?: number };
export type PilotModuleRecord = {
  current: string;
  retained: string[];
  versions: Record<string, PilotChunk>;
};
export type PilotManifest = {
  format: 1;
  /** App build that wrote this manifest. Module versions keep their own firstBuild. */
  build?: number;
  modules: Record<string, PilotModuleRecord>;
};

export function emptyManifest(): PilotManifest {
  return { format: 1, modules: {} };
}

export function isPilotManifest(value: unknown): value is PilotManifest {
  if (!value || typeof value !== 'object') return false;
  const modules = (value as { modules?: unknown }).modules;
  return (value as { format?: unknown }).format === 1 && !!modules && typeof modules === 'object';
}

/** Pinned version when that chunk exists; otherwise null so the caller uses bundled code. */
export function pinnedPilotVersion(id: string, hash: string): string | null {
  const match = new RegExp(`(?:^|[+/])${id}@(\\d+\\.\\d+\\.\\d+)(?=[+/]|$)`).exec(hash);
  return match?.[1] ?? null;
}

export function chunkFile(manifest: PilotManifest | null, id: string, version: string | null): { version: string; file: string } | null {
  const mod = manifest?.modules[id];
  if (!mod) return null;
  if (version) {
    const chunk = mod.versions[version];
    return chunk ? { version, file: chunk.file } : null;
  }
  const chunk = mod.versions[mod.current];
  return chunk ? { version: mod.current, file: chunk.file } : null;
}

/** Keep every published version. The local build chooses `current`. A changed hash for an existing version is refused. */
export function mergeManifests(remote: PilotManifest | null, local: PilotManifest): { manifest: PilotManifest; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set([...Object.keys(remote?.modules ?? {}), ...Object.keys(local.modules)]);
  const modules: Record<string, PilotModuleRecord> = {};
  for (const id of [...ids].sort()) {
    const prev = remote?.modules[id];
    const next = local.modules[id];
    const versions: Record<string, PilotChunk> = { ...(prev?.versions ?? {}) };
    for (const [version, chunk] of Object.entries(next?.versions ?? {})) {
      const old = versions[version];
      if (old && old.hash !== chunk.hash) {
        errors.push(`${id}@${version} is already published as ${old.hash}, not ${chunk.hash}`);
        continue;
      }
      versions[version] = old
        ? { ...chunk, ...old, sourceHash: old.sourceHash ?? chunk.sourceHash, firstBuild: old.firstBuild ?? chunk.firstBuild }
        : chunk;
    }
    const current = next?.current && versions[next.current] ? next.current : prev?.current;
    if (!current || !versions[current]) continue;
    modules[id] = { current, retained: Object.keys(versions).sort(compareSemver), versions };
  }
  return { manifest: { format: 1, modules }, errors };
}

export function uploadPlan(remote: PilotManifest | null, local: PilotManifest): { upload: PilotChunk[]; errors: string[] } {
  const { errors } = mergeManifests(remote, local);
  const upload: PilotChunk[] = [];
  for (const [id, mod] of Object.entries(local.modules)) {
    const prev = remote?.modules[id];
    for (const [version, chunk] of Object.entries(mod.versions)) {
      if (!prev?.versions[version]) upload.push(chunk);
    }
  }
  return { upload, errors };
}

export function rollbackManifest(manifest: PilotManifest, id: string, version: string): PilotManifest {
  const mod = manifest.modules[id];
  if (!mod?.versions[version]) throw new Error(`no retained chunk for ${id}@${version}`);
  return {
    format: 1,
    modules: {
      ...manifest.modules,
      [id]: { ...mod, current: version, retained: mod.retained },
    },
  };
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
