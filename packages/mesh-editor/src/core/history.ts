import type { EditObject } from './document.js';
import type { EditorHost } from './host.js';
import type { EditMesh } from './mesh.js';
import type { Transform } from './math.js';
import type { Selection } from './selection.js';

/** One undoable step. `do()` is called once on push, again on redo. */
export interface Command {
  label: string;
  do(): void;
  undo(): void;
  /** Optional merge with the previous command (e.g. repeated typed values on the same field). */
  mergeWith?(prev: Command): Command | null;
}

export interface History {
  /** Runs `cmd.do()` and pushes it. Clears the redo stack. */
  push(cmd: Command): void;
  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Label of the next undo / redo step, for UI tooltips. */
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  clear(): void;
  /** Max steps kept (default 100). Oldest dropped first. */
  limit: number;
  /** Returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
}

/** State captured per object by the v1 snapshot command. */
export interface ObjectSnapshot {
  mesh: EditMesh;
  transform: Transform;
}

/**
 * v1 implementation shape: a command holding full before/after snapshots of the touched
 * objects (EditMesh is small JSON, so this is cheap enough for low-poly assets).
 * `do()` / `undo()` write the snapshot back through `EditorHost.commit(…, { live: false })`
 * and restore the selection.
 */
export interface SnapshotCommand extends Command {
  before: Record<string, ObjectSnapshot | null>;
  after: Record<string, ObjectSnapshot | null>;
  selectionBefore: Selection;
  selectionAfter: Selection;
  /** Set when repeated typed edits of the same field should collapse into one step. */
  mergeKey?: string;
}

function cloneMesh(mesh: EditMesh): EditMesh {
  const out: EditMesh = { v: mesh.v.slice(), f: mesh.f.map((face) => face.slice()) };
  if (mesh.fm) out.fm = mesh.fm.slice();
  if (mesh.sm) out.sm = true;
  return out;
}

function cloneTransform(t: Transform): Transform {
  return { position: [...t.position], quaternion: [...t.quaternion], scale: [...t.scale] };
}

function cloneSnap(s: ObjectSnapshot | null): ObjectSnapshot | null {
  if (!s) return null;
  return { mesh: cloneMesh(s.mesh), transform: cloneTransform(s.transform) };
}

function cloneMap(map: Record<string, ObjectSnapshot | null>): Record<string, ObjectSnapshot | null> {
  const out: Record<string, ObjectSnapshot | null> = {};
  for (const [id, snap] of Object.entries(map)) out[id] = cloneSnap(snap);
  return out;
}

function meshEqual(a: EditMesh, b: EditMesh): boolean {
  if (!!a.sm !== !!b.sm) return false;
  if (a.v.length !== b.v.length || a.f.length !== b.f.length) return false;
  for (let i = 0; i < a.v.length; i++) if (a.v[i] !== b.v[i]) return false;
  for (let i = 0; i < a.f.length; i++) {
    const A = a.f[i];
    const B = b.f[i];
    if (!A || !B || A.length !== B.length) return false;
    for (let k = 0; k < A.length; k++) if (A[k] !== B[k]) return false;
  }
  const af = a.fm ?? [];
  const bf = b.fm ?? [];
  if (af.length !== bf.length) return false;
  for (let i = 0; i < af.length; i++) if (af[i] !== bf[i]) return false;
  return true;
}

function transformEqual(a: Transform, b: Transform): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-8;
  return a.position.every((v, i) => close(v, b.position[i] ?? 0)) && a.quaternion.every((v, i) => close(v, b.quaternion[i] ?? 0)) && a.scale.every((v, i) => close(v, b.scale[i] ?? 1));
}

export interface SnapshotCommandInit {
  label: string;
  before: Record<string, ObjectSnapshot | null>;
  after: Record<string, ObjectSnapshot | null>;
  selectionBefore: Selection;
  selectionAfter: Selection;
  host: EditorHost;
  /** Full objects for ids that are created or restored after a delete. */
  objects?: Record<string, EditObject>;
  applySelection?: (selection: Selection) => void;
  /** When set, a following command with the same key replaces this step (typed values). */
  mergeKey?: string;
}

function writeSide(
  host: EditorHost,
  dest: Record<string, ObjectSnapshot | null>,
  other: Record<string, ObjectSnapshot | null>,
  objects: Record<string, EditObject> | undefined,
): void {
  const ids = new Set([...Object.keys(dest), ...Object.keys(other)]);
  for (const id of ids) {
    const d = dest[id] ?? null;
    const o = other[id] ?? null;
    if (d === null) {
      if (o) host.removeObject?.(id);
      continue;
    }
    if (o === null) {
      const src = objects?.[id];
      if (src && host.addObject) host.addObject({ ...src, mesh: d.mesh, transform: d.transform });
      else {
        host.commit(id, d.mesh, { live: false });
        host.commitTransform(id, d.transform, { live: false });
      }
      continue;
    }
    if (!meshEqual(d.mesh, o.mesh)) host.commit(id, d.mesh, { live: false });
    if (!transformEqual(d.transform, o.transform)) host.commitTransform(id, d.transform, { live: false });
  }
}

/** v1 snapshot command. `do` / `undo` write through the host and restore the selection. */
export function createSnapshotCommand(init: SnapshotCommandInit): SnapshotCommand {
  const before = cloneMap(init.before);
  const after = cloneMap(init.after);
  const selectionBefore = init.selectionBefore;
  const selectionAfter = init.selectionAfter;
  const cmd: SnapshotCommand = {
    label: init.label,
    before,
    after,
    selectionBefore,
    selectionAfter,
    ...(init.mergeKey ? { mergeKey: init.mergeKey } : {}),
    do() {
      writeSide(init.host, after, before, init.objects);
      init.applySelection?.(selectionAfter);
    },
    undo() {
      writeSide(init.host, before, after, init.objects);
      init.applySelection?.(selectionBefore);
    },
    mergeWith(prev) {
      const p = prev as SnapshotCommand;
      if (!init.mergeKey || p.mergeKey !== init.mergeKey) return null;
      return createSnapshotCommand({
        ...init,
        before: p.before,
        selectionBefore: p.selectionBefore,
        after,
        selectionAfter,
      });
    },
  };
  return cmd;
}

/** In-memory command stack. Default limit 100. `push` runs `do()` and clears redo. */
export function createHistory(limit = 100): History {
  let undoStack: Command[] = [];
  let redoStack: Command[] = [];
  let max = limit;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const api: History = {
    get limit() {
      return max;
    },
    set limit(value: number) {
      max = value;
      while (undoStack.length > max) undoStack.shift();
    },
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
    get undoLabel() {
      return undoStack.at(-1)?.label ?? null;
    },
    get redoLabel() {
      return redoStack.at(-1)?.label ?? null;
    },
    push(cmd) {
      const prev = undoStack.at(-1);
      const merged = prev && cmd.mergeWith ? cmd.mergeWith(prev) : null;
      cmd.do();
      if (merged) undoStack[undoStack.length - 1] = merged;
      else undoStack.push(cmd);
      while (undoStack.length > max) undoStack.shift();
      redoStack = [];
      emit();
    },
    undo() {
      const cmd = undoStack.pop();
      if (!cmd) return;
      cmd.undo();
      redoStack.push(cmd);
      emit();
    },
    redo() {
      const cmd = redoStack.pop();
      if (!cmd) return;
      cmd.do();
      undoStack.push(cmd);
      emit();
    },
    clear() {
      undoStack = [];
      redoStack = [];
      emit();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return api;
}
