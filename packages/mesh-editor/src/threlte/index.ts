/**
 * @itio/mesh-editor/threlte: adapter for Threlte (Svelte + three.js) apps.
 * Creates an EditorViewport from `useThrelte()` and maps render / navigation onto the app.
 *
 * `objects` is optional when `host` is passed (the host owns meshes and commits).
 * `controls` / `getControls` receive `setNavigationEnabled` (OrbitControls `.enabled`).
 */
import { onDestroy, onMount } from 'svelte';
import { useThrelte } from '@threlte/core';
import { MeshBasicMaterial, type Camera, type Object3D } from 'three';
import type { EditorHost } from '../core/host.js';
import type { EditorViewport as EditorViewportType, EditorViewportOptions } from '../core/viewport.js';
import { EditorViewport } from '../core/viewport-impl.js';

export type { EditorViewport } from '../core/viewport.js';

export interface ThrelteEditorOptions extends Partial<Omit<EditorViewportOptions, 'scene' | 'camera' | 'domElement'>> {
  /** Map from editable object id to the Threlte-managed THREE object. Used when `host` is omitted. */
  objects?: () => Map<string, Object3D>;
  /** Called with the final value of each commit (`live: false`) for persistence. Used when `host` is omitted. */
  onCommit?: EditorHost['commit'];
  /** Full host. When set, `objects` / `onCommit` are not required. */
  host?: EditorHost;
  /** Camera controls toggled by `setNavigationEnabled`. Read once; prefer `getControls` if the ref appears later. */
  controls?: { enabled: boolean } | null;
  /** Live lookup so a control ref bound after mount is still toggled. */
  getControls?: () => { enabled: boolean } | null | undefined;
}

export type UseMeshEditor = (options: ThrelteEditorOptions) => { viewport: EditorViewportType; host: EditorHost };

const fallbackMaterial = new MeshBasicMaterial();

function fallbackHost(options: ThrelteEditorOptions): EditorHost {
  const objects = options.objects ?? (() => new Map<string, Object3D>());
  return {
    getMesh: () => null,
    commit: (id, mesh, opts) => {
      if (!opts.live) options.onCommit?.(id, mesh, opts);
    },
    onSelectionChange: () => {},
    setNavigationEnabled: () => {},
    requestRender: () => {},
    resolveMaterial: () => fallbackMaterial,
    listObjects: () => [...objects().keys()],
    getObject3D: (id) => objects().get(id) ?? null,
    commitTransform: () => {},
  };
}

/**
 * Call inside a Threlte component. Attaches on mount and disposes on destroy.
 * `requestRender` also calls Threlte `invalidate()`. `setNavigationEnabled` also sets
 * `getControls()?.enabled` (or `controls.enabled`).
 */
export function useMeshEditor(options: ThrelteEditorOptions): { viewport: EditorViewport; host: EditorHost } {
  const { scene, camera, renderer, invalidate } = useThrelte();
  const controlsOf = () => options.getControls?.() ?? options.controls ?? null;
  const base = options.host ?? fallbackHost(options);
  const host: EditorHost = {
    ...base,
    requestRender() {
      base.requestRender();
      invalidate();
    },
    setNavigationEnabled(enabled: boolean) {
      base.setNavigationEnabled(enabled);
      const controls = controlsOf();
      if (controls) controls.enabled = enabled;
    },
  };
  const viewport = new EditorViewport({
    scene,
    camera: camera.current,
    domElement: renderer.domElement,
    host,
    ...(options.snap !== undefined ? { snap: options.snap } : {}),
    ...(options.history ? { history: options.history } : {}),
    ...(options.tapSlopPx !== undefined ? { tapSlopPx: options.tapSlopPx } : {}),
    ...(options.pickRadiusPx !== undefined ? { pickRadiusPx: options.pickRadiusPx } : {}),
  });
  const unsubscribe = camera.subscribe((next: Camera) => viewport.setCamera(next));
  onMount(() => viewport.attach());
  onDestroy(() => {
    unsubscribe();
    viewport.dispose();
  });
  return { viewport, host };
}
