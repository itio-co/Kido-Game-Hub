/**
 * @itio/mesh-editor/svelte: optional UI panels (Svelte 5). Types only in v0.0.1; see API.md §11.
 * Components (.svelte) will be shipped from this subpath; the core never imports Svelte.
 */
import type { EditorViewport } from '../core/viewport.js';
import type { SnapSettings } from '../core/snap.js';

export type Locale = 'th' | 'en';

/** Message keys used by the panels. Extend by adding keys here and to the default map. */
export type MessageKey =
  | 'mode.object' | 'mode.vertex' | 'mode.edge' | 'mode.face'
  | 'tool.move' | 'tool.rotate' | 'tool.scale' | 'tool.select'
  | 'select.multi' | 'select.box' | 'select.all' | 'select.none'
  | 'op.extrude' | 'op.inset' | 'op.bevel' | 'op.merge' | 'op.delete' | 'op.duplicate'
  | 'snap.title' | 'snap.grid' | 'snap.angle' | 'snap.vertex' | 'snap.edge' | 'snap.face' | 'snap.alignNormal'
  | 'history.undo' | 'history.redo'
  | 'field.position' | 'field.rotation' | 'field.scale' | 'field.size'
  | 'camera.match' | 'camera.guides' | 'camera.lens' | 'camera.residual'
  | 'file.import' | 'file.exportGlb' | 'file.exportEdits'
  /** `{count}` is replaced with LockedSkippedNotice.count. */
  | 'notice.lockedSkipped' | 'notice.allLocked';

/** Thai + English string per key. Thai is the default locale. */
export type I18nMap = Record<MessageKey, { th: string; en: string }>;

/**
 * CSS custom properties read by every panel (set them on any ancestor). Defaults in API.md §11.
 * `--me-hit` is the minimum touch target (default 44px); layouts are tested at 390×844.
 */
export type ThemeVariable =
  | '--me-bg' | '--me-panel' | '--me-fg' | '--me-muted' | '--me-accent' | '--me-accent-fg'
  | '--me-danger' | '--me-border' | '--me-radius' | '--me-gap' | '--me-hit' | '--me-font'
  | '--me-axis-x' | '--me-axis-y' | '--me-axis-z';

export type Theme = Partial<Record<ThemeVariable, string>>;

/** Props shared by all panels. */
export interface PanelProps {
  viewport: EditorViewport;
  locale?: Locale;
  /** Partial override of the default strings. */
  messages?: Partial<I18nMap>;
}

export interface ToolbarProps extends PanelProps {
  /** Hide mesh ops (object-only editor, as in the current Kido #/editor). */
  objectOnly?: boolean;
}

export interface SnapPanelProps extends PanelProps {
  settings: SnapSettings;
  onchange?: (settings: SnapSettings) => void;
}

export interface TransformFieldsProps extends PanelProps {
  /** Display unit for position / size fields. Default 'cm' (Kido editor shows cm). */
  lengthUnit?: 'm' | 'cm' | 'mm';
}
