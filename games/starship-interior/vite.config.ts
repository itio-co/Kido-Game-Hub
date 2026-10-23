import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { buildInfo } from './build-info.js';

const { version, commit } = buildInfo();

export default defineConfig({
	plugins: [sveltekit()],
	define: { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(commit) },
	server: { host: '0.0.0.0', port: 5173, strictPort: true },
	preview: { host: '0.0.0.0', port: 4173 },
	// single-page 3D app: the page chunk bundles three.js + Threlte (~1.15 MB min, ~310 kB gzip); the vendored
	// draco_decoder.js asset is ~0.7 MB and only loaded on demand. Raise the default 500 kB warning threshold accordingly.
	build: { chunkSizeWarningLimit: 1400 },
	ssr: { noExternal: ['three', '@threlte/core', '@threlte/extras'] }
});
