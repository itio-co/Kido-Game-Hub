// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {}
	interface Window {
		__game?: unknown;
		__exports?: unknown;
		__debug?: {
			toScreen: (x: number, z: number, deck?: number) => { x: number; y: number };
		};
	}
}

export {};
