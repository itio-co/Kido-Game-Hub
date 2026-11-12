import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createModelEditor } from '../src/lib/editor/modelEditor';
import { camFromMatched } from '../src/lib/editor/cameraMatch';
import { project } from '../src/lib/editor/camMath';
const controls = vi.hoisted(() => ({ gizmo: null }));
// Exercise the actual editor and GLB loader. Only browser/GPU plumbing is stubbed.
vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, WebGLRenderer: class {
            setPixelRatio() { }
            setSize() { }
            setClearColor() { }
            dispose() { }
            render(scene) { scene.updateMatrixWorld(true); }
        } };
});
vi.mock('three/addons/loaders/GLTFLoader.js', async (importOriginal) => {
    const { GLTFLoader } = await importOriginal();
    return { GLTFLoader: class extends GLTFLoader {
            async loadAsync(url) {
                const bytes = await readFile(new URL(`../public/models/${url}`, import.meta.url));
                this.register(() => ({ name: 'CPU_GEOMETRY_ONLY', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
                return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
            }
        } };
});
vi.mock('three/addons/controls/OrbitControls.js', () => ({ OrbitControls: class extends THREE.EventDispatcher {
        target = new THREE.Vector3();
        update() { }
        dispose() { }
    } }));
vi.mock('three/addons/controls/TransformControls.js', () => ({ TransformControls: class extends THREE.EventDispatcher {
        constructor(...args) { super(); controls.gizmo = this; }
        object;
        getHelper() { return new THREE.Group(); }
        setSize() { }
        setSpace() { }
        setMode() { }
        setTranslationSnap() { }
        setRotationSnap() { }
        setScaleSnap() { }
        dispose() { }
        detach() { this.object = undefined; }
        attach(object) { this.object = object; }
    } }));
const asset = {
    id: 'clock-test', slug: 'flow/living-room/clock', title: 'นาฬิกาแขวน', variants: [],
    ref: { src: 'clock-ref.png', width: 96, height: 108,
        camera: { hfovDeg: 24.616031634856,
            position: new THREE.Vector3(-0.526687510519, -0.034769209310, 1.064529187444),
            quaternion: new THREE.Quaternion(0.102343082966, -0.221152262947, 0.035609945211, 0.969200444575) },
        keyPoints: [{ id: 'Axle', label: 'แกนเข็มนาฬิกา', p: [0, -2.5, 21] }],
    }, orbit: { target: 0.21, distance: 1.05, height: 0.43 },
};
const cam = camFromMatched(asset.ref.camera, 96, 108);
const image = { x0: 0, y0: 0, x1: 96, y1: 108 };
let raf;
let editor;
const flush = () => { const pending = raf.splice(0); pending.forEach(fn => fn(0)); };
beforeEach(() => {
    raf = [];
    vi.stubGlobal('window', Object.assign(new EventTarget(), { devicePixelRatio: 1 }));
    vi.stubGlobal('requestAnimationFrame', (fn) => { raf.push(fn); return raf.length; });
    vi.stubGlobal('ResizeObserver', class {
        observe() { }
        disconnect() { }
    });
    const storage = new Map();
    vi.stubGlobal('localStorage', { getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) });
});
afterEach(() => { editor?.dispose(); editor = undefined; vi.unstubAllGlobals(); });
describe('Bring to image through the full editor', () => {
    it('recovers a collapsed saved clock in one undo step, without resetting unrelated edits', async () => {
        const canvas = Object.assign(new EventTarget(), { clientWidth: 393, clientHeight: 780,
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 393, height: 780 }) });
        editor = createModelEditor(canvas, () => { });
        await editor.load(asset, { id: 'lowpoly', label: 'Test', url: 'clock.glb' });
        const draft = editor.getState();
        draft.parts.forEach(part => { part.position = [200, -100, 700]; part.scale = [0, 0, 0]; });
        draft.parts[0].hidden = true;
        draft.parts[1].deleted = true;
        draft.parts[2].color = '#aabbcc';
        draft.parts[2].pivot = [.01, .02, -.03];
        draft.parts[2].rotation = [5, 10, 15];
        editor.loadState(draft);
        editor.setView('mock');
        flush();
        const originalCamera = JSON.stringify(cam);
        expect(editor.bringToImage(cam, image, editor.pointsOf(null, Infinity))).toBeNull();
        expect(editor.bringProblem).toBe('geometry');
        expect(editor.getState()).toEqual(draft);
        // A bad camera is not silently replaced, and failed recovery creates no edit.
        expect(editor.bringToImage({ ...cam, f: 0 }, image, editor.pointsOf(null, Infinity), true)).toBeNull();
        expect(editor.bringProblem).toBe('camera');
        expect(editor.getState()).toEqual(draft);
        expect(editor.bringToImage(cam, image, editor.pointsOf(null, Infinity), true)?.changed).toBe(true);
        flush();
        const recovered = editor.getState();
        expect(JSON.stringify(cam)).toBe(originalCamera);
        for (const [i, part] of recovered.parts.entries()) {
            const { position, scale, ...rest } = part;
            const { position: oldPosition, scale: oldScale, ...oldRest } = draft.parts[i];
            expect(rest).toEqual(oldRest);
            if (part.deleted)
                expect(part).toEqual(draft.parts[i]);
            else
                expect(scale.every(value => value > 0)).toBe(true);
        }
        for (const point of editor.pointsOf(null, Infinity)) {
            const uv = project(cam, point);
            expect(uv?.[0]).toBeGreaterThan(0);
            expect(uv?.[0]).toBeLessThan(96);
            expect(uv?.[1]).toBeGreaterThan(0);
            expect(uv?.[1]).toBeLessThan(108);
        }
        expect(editor.undoBringToImage()).toBe(true);
        flush();
        expect(editor.getState()).toEqual(draft);
        editor.redo();
        flush();
        expect(editor.getState()).toEqual(recovered);
    });
    for (const file of ['clock.glb', 'clock-master.glb'])
        it(`fits real ${file} and supports repeated Bring, Undo, Redo`, async () => {
            const canvas = Object.assign(new EventTarget(), { clientWidth: 393, clientHeight: 780,
                getBoundingClientRect: () => ({ left: 0, top: 0, width: 393, height: 780 }) });
            editor = createModelEditor(canvas, () => { });
            await editor.load(asset, { id: 'lowpoly', label: 'Test', url: file });
            editor.setView('mock');
            flush();
            const before = editor.getState();
            expect(editor.pointsOf(null, Infinity).length).toBeGreaterThan(0);
            const result = editor.bringToImage(cam, image, editor.pointsOf(null, Infinity));
            expect(result).not.toBeNull();
            flush();
            const after = editor.getState();
            for (const point of editor.pointsOf(null, Infinity)) {
                const uv = project(cam, point);
                expect(uv?.[0]).toBeGreaterThan(0);
                expect(uv?.[0]).toBeLessThan(96);
                expect(uv?.[1]).toBeGreaterThan(0);
                expect(uv?.[1]).toBeLessThan(108);
            }
            expect(editor.bringToImage(cam, image, editor.pointsOf(null, Infinity))?.changed).toBe(false);
            editor.undo();
            flush();
            expect(editor.getState()).toEqual(before);
            editor.redo();
            flush();
            expect(editor.getState()).toEqual(after);
        });
});


describe('Whole-object selection and editing', () => {
    for (const url of ['clock.glb', 'clock-master.glb', 'nightstand.glb', 'nightstand-master.glb']) {
        it(`moves every live part together, preserves hidden/deleted flags, and undoes exactly: ${url}`, async () => {
            const canvas = Object.assign(new EventTarget(), { clientWidth: 393, clientHeight: 780,
                getBoundingClientRect: () => ({ left: 0, top: 0, width: 393, height: 780 }) });
            let snapshot;
            editor = createModelEditor(canvas, snap => { snapshot = snap; });
            await editor.load(asset, { id: 'selection-test', label: 'Test', url });
            expect(snapshot.selectionMode).toBe('object');
            expect(snapshot.wholeSelected).toBe(true);
            const draft = editor.getState();
            draft.parts[0].hidden = true; draft.parts[1].deleted = true;
            editor.loadState(draft); editor.setSelectionMode('object');
            const before = editor.getState();
            editor.transformWhole('translate', 0, 12);
            const after = editor.getState();
            for (let i = 0; i < after.parts.length; i++) {
                expect(after.parts[i].position[0]).toBeCloseTo(before.parts[i].position[0] + (before.parts[i].deleted ? 0 : .12), 6);
                expect(after.parts[i].hidden).toBe(before.parts[i].hidden);
                expect(after.parts[i].deleted).toBe(before.parts[i].deleted);
            }
            editor.undo(); expect(editor.getState()).toEqual(before);
            editor.redo(); expect(editor.getState()).toEqual(after);
            editor.setSelectionMode('part');
            expect(snapshot.wholeSelected).toBe(false); expect(snapshot.selected).toBeNull();
            const part = after.parts.find(p => !p.deleted && !p.hidden);
            editor.select(part.name);
            expect(snapshot.selected.name).toBe(part.name);
            editor.setValue('position', 1, 42);
            const isolated = editor.getState();
            isolated.parts.forEach((p, i) => { if (p.name !== part.name) expect(p).toEqual(after.parts[i]); });
            editor.undo(); editor.setSelectionMode('object');
            const points = editor.pointsOf(null, Infinity);
            editor.transformWhole('scale', 0, 1.7);
            const scaled = editor.pointsOf(null, Infinity);
            const distance = arr => Math.hypot(...arr[0].map((v,i) => v-arr.at(-1)[i]));
            expect(distance(scaled)).toBeCloseTo(distance(points)*1.7, 5);
            editor.undo(); expect(editor.getState()).toEqual(after);
            editor.transformWhole('rotate', 1, 30);
            expect(distance(editor.pointsOf(null, Infinity))).toBeCloseTo(distance(points), 5);
            editor.undo(); expect(editor.getState()).toEqual(after);
            editor.setSelectionMode('object'); editor.setPivotMode(true);
            expect(snapshot.pivotMode).toBe(false);
            const unchanged = editor.getState();
            editor.transformWhole('scale',0,0); editor.transformWhole('scale',0,-1);
            expect(editor.getState()).toEqual(unchanged);
        });
    }
});

it('whole-object gizmo drags bake one edit and selection toggles do not alter geometry', async () => {
    const canvas = Object.assign(new EventTarget(), { clientWidth: 390, clientHeight: 844,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) });
    let snapshot;
    editor = createModelEditor(canvas, value => { snapshot = value; });
    await editor.load(asset, { id: 'drag-test', url: 'clock.glb' });
    const original = editor.getState();
    const drag = mutate => {
        const g = controls.gizmo;
        g.dragging = true; g.dispatchEvent({ type: 'dragging-changed', value: true });
        mutate(g.object); g.dispatchEvent({ type: 'objectChange' });
        flush();
        g.dragging = false; g.dispatchEvent({ type: 'dragging-changed', value: false });
    };
    editor.setMode('translate');
    drag(object => { object.position.x += .2; });
    editor.getState().parts.forEach((part,i) => expect(part.position[0]).toBeCloseTo(original.parts[i].position[0]+.2, 6));
    editor.undo(); expect(editor.getState()).toEqual(original);
    editor.setMode('scale'); controls.gizmo.axis = 'Y';
    drag(object => { object.scale.y = 2; });
    editor.getState().parts.forEach((part,i) => part.scale.forEach((v,k) => expect(v).toBeCloseTo(original.parts[i].scale[k]*2,6)));
    editor.undo(); expect(editor.getState()).toEqual(original);
    editor.setMode('rotate');
    drag(object => { object.rotateY(Math.PI / 4); });
    editor.undo(); expect(editor.getState()).toEqual(original);
    for (let i=0;i<3;i++) { editor.setSelectionMode('part'); editor.select(original.parts[0].name); editor.setSelectionMode('object'); }
    expect(editor.getState()).toEqual(original); expect(snapshot.selected).toBeNull(); expect(snapshot.wholeSelected).toBe(true);
});
