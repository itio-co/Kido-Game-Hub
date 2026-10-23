/**
 * @itio/mesh-editor/threlte: adapter for Threlte (Svelte + three.js) apps. Types only in v0.0.1.
 * Builds an EditorHost from the Threlte context so a Threlte scene can host an EditorViewport.
 */
import type * as THREE from 'three';
import type { EditorHost } from '../core/host.js';
import type { EditorViewport, EditorViewportOptions } from '../core/viewport.js';

export interface ThrelteEditorOptions extends Partial<Omit<EditorViewportOptions, 'scene' | 'camera' | 'domElement'>> {
  /** Map from editable object id to the Threlte-managed THREE object. */
  objects: () => Map<string, THREE.Object3D>;
  /** Called with the final value of each commit (`live: false`) for persistence. */
  onCommit?: EditorHost['commit'];
}

/**
 * `useMeshEditor(options)`: call inside a Threlte component. Uses `useThrelte()` for scene,
 * camera, renderer.domElement and `invalidate()` (→ host.requestRender), toggles the app's
 * camera controls for `setNavigationEnabled`, attaches on mount and detaches on destroy.
 */
export type UseMeshEditor = (options: ThrelteEditorOptions) => { viewport: EditorViewport; host: EditorHost };
