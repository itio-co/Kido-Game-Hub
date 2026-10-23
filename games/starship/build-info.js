// @ts-nocheck – plain Node helper for vite.config.ts (the project has no @types/node)
// Version / commit shown in Options → About (commit = HEAD when the dev server or build started).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** @returns {{ version: string, commit: string }} */
export function buildInfo() {
	const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
	let commit = 'unknown';
	try {
		commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
	} catch {
		/* not a git checkout (e.g. the zip) */
	}
	return { version, commit };
}
