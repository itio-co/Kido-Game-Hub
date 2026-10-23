import { describe, expect, expectTypeOf, it } from 'vitest';
import type { EditDocument, EditMesh, KidoModelEdits } from '../src/index.js';
import type { BlenderCamJson } from '../src/camera-match/index.js';

/** Unit cube, 1 m, centred, CCW quads seen from outside. */
const cube: EditMesh = {
  v: [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5],
  f: [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [1, 2, 6, 5],
    [0, 4, 7, 3],
  ],
  fm: [null, null, null, null, null, 'wood'],
};

describe('API contract (types only in v0.0.1)', () => {
  it('a unit cube is a valid EditMesh inside an EditDocument', () => {
    const doc: EditDocument = {
      version: 1,
      objects: [
        {
          id: '00000000-0000-4000-8000-000000000000',
          name: 'cube',
          transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
          mesh: cube,
        },
      ],
    };
    expect(cube.v.length / 3).toBe(8);
    expect(cube.f.every((face) => face.length === 4)).toBe(true);
    expect(cube.fm).toHaveLength(cube.f.length);
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });

  it('keeps the existing cam.json and edits.json shapes', () => {
    expectTypeOf<BlenderCamJson>().toHaveProperty('R');
    expectTypeOf<BlenderCamJson['C']>().toEqualTypeOf<[number, number, number]>();
    expectTypeOf<KidoModelEdits['format']>().toEqualTypeOf<'kido-model-edits/1'>();
  });
});
