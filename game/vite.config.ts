import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

function precachePlugin(): Plugin {
  let outDir = '';
  return {
    name: 'nesg-precache',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      // precache.mjs is a Node build script and has no declaration file.
      // @ts-expect-error module has no types
      return import('./scripts/precache.mjs').then((mod) =>
        (mod as { generatePrecache(dir: string): Promise<void> }).generatePrecache(outDir),
      );
    },
  };
}

export default defineConfig({
  plugins: [svelte(), precachePlugin()],
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { chunkSizeWarningLimit: 800 },
});
