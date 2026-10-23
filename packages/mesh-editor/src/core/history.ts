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
}
