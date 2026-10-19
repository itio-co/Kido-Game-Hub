// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	const __APP_VERSION__: string;
	const __APP_COMMIT__: string;
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
