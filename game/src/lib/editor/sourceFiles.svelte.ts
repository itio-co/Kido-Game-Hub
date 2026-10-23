/**
 * Source files of the editor's work: game/assets-src/<item>/editor/
 *   camera-match.json        guide lines, point pairs, VP lock / modes, crop rect, solved camera
 *   <variant>.edits.json     model edits (parts state, no undo history)
 *   <variant>-edited.glb     optional exported model
 *
 * The committed files are the baseline; localStorage keeps the in-progress draft. In `npm run dev`
 * the dev-only API (scripts/editorFilesPlugin.mjs) reads and writes the files; elsewhere the
 * baseline is the copy bundled at build time and saving falls back to downloads.
 */
import type { ShowcaseAsset } from '../showcaseAssets';
import type { EditState } from './modelEditor';
import {
  API_HEADER,
  API_PATH,
  FORMAT_EDITS,
  editorDirRel,
  editsFileName,
  itemOfSlug,
  matchFileName,
  sameData,
  stableStringify,
} from './editorFilesCore.mjs';

/** Files committed at build time (also the dev fallback before the API answers). */
const BUNDLED = import.meta.glob('/assets-src/*/editor/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export type FileChange = {
  name: string;
  kind: 'match' | 'edits';
  /** new = no source file yet; modified = differs from the source file. */
  status: 'new' | 'modified';
  /** Variant id for edits files. */
  variant?: string;
  data: Record<string, unknown>;
};

export type SaveResult = { ok: true; dir: string; paths: string[]; changed: number; git: string } | { ok: false; error: string };

type MatchLike = { fileData(): Record<string, unknown>; defaultText: string };

export function editsStorageKey(slug: string, variant: string): string {
  return `kido-editor:${slug}:${variant}`;
}

/** <variant>.edits.json content for an edit state (deterministic: no timestamps). */
export function editsFileData(asset: ShowcaseAsset, variant: string, state: EditState): Record<string, unknown> {
  const v = asset.variants.find((x) => x.id === variant);
  return {
    format: FORMAT_EDITS,
    asset: asset.slug,
    variant,
    model: v?.url.replace(/^.*\/models\//, 'models/') ?? null,
    parts: state.parts,
  };
}

/** EditState stored in an edits file (null if the file does not look right). */
export function editsStateOf(file: unknown): EditState | null {
  const f = file as { format?: string; parts?: unknown } | null;
  if (!f || f.format !== FORMAT_EDITS || !Array.isArray(f.parts)) return null;
  return { parts: structuredClone(f.parts) as EditState['parts'] };
}

function bundledFor(item: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const prefix = `/assets-src/${item}/editor/`;
  for (const [path, data] of Object.entries(BUNDLED)) if (path.startsWith(prefix)) out[path.slice(prefix.length)] = data;
  return out;
}

function readDraft(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export class SourceFiles {
  readonly asset: ShowcaseAsset;
  readonly item: string | null;
  /** probing → on (dev API answered) / off (no API: production build, preview, or old server). */
  api = $state<'probing' | 'on' | 'off'>('probing');
  /** Source files by name (JSON only). */
  files = $state.raw<Record<string, unknown>>({});
  /** Folder relative to the git root, e.g. game/assets-src/nightstand/editor. */
  dir = $state('');
  changes = $state.raw<FileChange[]>([]);
  saving = $state(false);
  lastSave = $state.raw<(SaveResult & { ok: true }) | null>(null);
  /** "Keep draft" (T.files.keepDraft): hide the badge for the rest of this session. */
  dismissed = $state(false);
  readonly ready: Promise<void>;

  constructor(asset: ShowcaseAsset) {
    this.asset = asset;
    this.item = itemOfSlug(asset.slug);
    this.files = this.item ? bundledFor(this.item) : {};
    this.dir = this.item ? `game/${editorDirRel(this.item)}` : '';
    this.ready = this.probe();
  }

  get hasFiles(): boolean {
    return Object.keys(this.files).length > 0;
  }
  get showBadge(): boolean {
    return this.changes.length > 0 && (this.api === 'on' || this.hasFiles) && !this.dismissed;
  }
  get canRevert(): boolean {
    return this.changes.some((c) => c.status === 'modified');
  }

  private async probe(): Promise<void> {
    if (!this.item || !import.meta.env.DEV) {
      this.api = 'off';
      return;
    }
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 2500);
      const res = await fetch(`${API_PATH}?item=${encodeURIComponent(this.item)}`, {
        headers: { [API_HEADER]: '1' },
        cache: 'no-store',
        signal: ctl.signal,
      });
      clearTimeout(timer);
      const body = res.ok ? ((await res.json()) as { ok?: boolean; dir?: string; files?: Record<string, unknown> }) : null;
      if (body?.ok && body.files) {
        this.files = body.files;
        if (body.dir) this.dir = body.dir;
        this.api = 'on';
        return;
      }
    } catch {
      /* no API */
    }
    this.api = 'off';
  }

  /** Committed camera-match.json (null = none). */
  get matchFile(): unknown {
    return this.files[matchFileName()] ?? null;
  }
  editsFile(variant: string): EditState | null {
    return editsStateOf(this.files[editsFileName(variant)]);
  }

  /** Recompute what differs from the source files (match: live state; edits: the drafts of every variant). */
  refresh(match: MatchLike | null): void {
    const out: FileChange[] = [];
    if (match) {
      const data = match.fileData();
      const file = this.matchFile;
      if (file) {
        if (!sameData(stripDerived(file), stripDerived(data))) out.push({ name: matchFileName(), kind: 'match', status: 'modified', data });
      } else if (stableStringify(data) !== match.defaultText) {
        out.push({ name: matchFileName(), kind: 'match', status: 'new', data });
      }
    }
    for (const v of this.asset.variants) {
      const draft = readDraft(editsStorageKey(this.asset.slug, v.id)) as EditState | null;
      if (!draft || !Array.isArray(draft.parts)) continue; // no draft = same as the file (or untouched)
      const name = editsFileName(v.id);
      const data = editsFileData(this.asset, v.id, draft);
      const file = this.files[name];
      if (!file) out.push({ name, kind: 'edits', status: 'new', variant: v.id, data });
      else if (!sameData(file, data)) out.push({ name, kind: 'edits', status: 'modified', variant: v.id, data });
    }
    if (stableStringify(out.map((c) => [c.name, c.status, c.data])) !== stableStringify(this.changes.map((c) => [c.name, c.status, c.data]))) this.changes = out;
  }

  /** POST the changed files (+ optional GLB) to the dev API. */
  async save(changes: FileChange[], glb?: { name: string; blob: Blob } | null): Promise<SaveResult> {
    if (this.api !== 'on' || !this.item) return { ok: false, error: 'no-api' };
    this.saving = true;
    try {
      const files: ({ name: string; json: unknown } | { name: string; base64: string })[] = changes.map((c) => ({ name: c.name, json: c.data }));
      if (glb) files.push({ name: glb.name, base64: await blobToBase64(glb.blob) });
      const res = await fetch(API_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [API_HEADER]: '1' },
        body: JSON.stringify({ item: this.item, files }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        dir?: string;
        git?: string;
        written?: { name: string; path: string; changed: boolean }[];
      } | null;
      if (!res.ok || !body?.ok) return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
      const next = { ...this.files };
      for (const c of changes) next[c.name] = JSON.parse(stableStringify(c.data));
      this.files = next;
      const result = {
        ok: true as const,
        dir: body.dir ?? this.dir,
        paths: (body.written ?? []).map((w) => w.path),
        changed: (body.written ?? []).filter((w) => w.changed).length,
        git: body.git ?? `git add ${this.dir} && git commit`,
      };
      this.lastSave = result;
      this.dismissed = false;
      return result;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      this.saving = false;
    }
  }
}

/** The `solved` block is derived from `camera`; compare without it. */
function stripDerived(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const { solved: _s, ...rest } = v as Record<string, unknown>;
  return rest;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
