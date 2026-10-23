<script lang="ts">
	/**
	 * Thin Threlte host for an EditorViewport. Pass a full `host` or the `objects` map.
	 * The viewport is created from `useThrelte()`, attached on mount, and disposed on destroy.
	 */
	import type { EditorViewport } from '../core/viewport.js';
	import { useMeshEditor, type ThrelteEditorOptions } from './index.js';

	let { options, viewport = $bindable(null as EditorViewport | null) }: { options: ThrelteEditorOptions; viewport?: EditorViewport | null } = $props();
	// Options are read once: host methods, `getControls` and `snap` close over live state.
	// svelte-ignore state_referenced_locally
	const api = useMeshEditor(options);
	viewport = api.viewport;
</script>
