import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { editorFilesPlugin } from './scripts/editorFilesPlugin.mjs';

function modulesPlugin(): Plugin {
  return {
    name: 'nesg-modules',
    async buildStart() {
      // @ts-expect-error module has no types
      const mod = (await import('./scripts/modules.mjs')) as { checkBoundaries(): string[] };
      const errors = mod.checkBoundaries();
      if (errors.length) this.error(`module boundary violations:\n${errors.join('\n')}`);
    },
    async generateBundle() {
      // @ts-expect-error module has no types
      const mod = (await import('./scripts/modules.mjs')) as { buildRegistry(): unknown };
      this.emitFile({ type: 'asset', fileName: 'modules.json', source: JSON.stringify(mod.buildRegistry(), null, 2) });
    },
    configureServer(server) {
      server.middlewares.use('/modules.json', async (_req, res) => {
        // @ts-expect-error module has no types
        const mod = (await import('./scripts/modules.mjs')) as { buildRegistry(): unknown };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(mod.buildRegistry()));
      });
    },
  };
}

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
  plugins: [svelte(), modulesPlugin(), precachePlugin(), editorFilesPlugin()],
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: { main: 'index.html', god: 'god.html' },
      // Shared with the versioned pilot chunks through the import map emitted after this build.
      external: (id: string) => id === 'svelte' || id.startsWith('svelte/'),
    },
  },
});
