import { lightVector, parseLayersQuery, planShadow, planShadows, DEFAULT_LIGHT } from '../src/lib/shadows/shadows.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean): void {
  if (ok) passed++;
  else {
    failed++;
    console.error('FAIL', name);
  }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const caster = { x: 100, y: 100, w: 200, h: 100, shadow: { type: 'ground-drop' as const } };
const plan = planShadow(caster, DEFAULT_LIGHT)!;
const [a, b, c, d, e, f] = plan.matrix;
check('floor line is fixed', near(a * 150 + c * 200 + e, 150) && near(b * 150 + d * 200 + f, 200));
check('top lands along the light (up-right at 300deg)', a * 150 + c * 100 + e > 150 && b * 150 + d * 100 + f < 200);
check('moving the caster moves the floor line', near(planShadow(caster, DEFAULT_LIGHT, 0, 30)!.matrix[1] * 0 + planShadow(caster, DEFAULT_LIGHT, 0, 30)!.matrix[3] * 230 + planShadow(caster, DEFAULT_LIGHT, 0, 30)!.matrix[5], 230));
check('none yields null', planShadow({ ...caster, shadow: { type: 'none' } }, DEFAULT_LIGHT) === null);
const contact = planShadow({ ...caster, shadow: { type: 'contact' } }, DEFAULT_LIGHT, 50, 0)!;
check('contact follows x move', contact.kind === 'ellipse' && contact.ellipse.cx > 250);
const [lx, ly, lz] = lightVector(DEFAULT_LIGHT);
check('light vector is unit', near(Math.hypot(lx, ly, lz), 1));
check('light comes from opposite of shadow', lx < 0 && ly < 0);
check('contact adds a second plan', planShadows({ ...caster, shadow: { type: 'ground-drop', contact: 0.8 } }, DEFAULT_LIGHT).length === 2);
const q = parseLayersQuery('#/layers?off=fan,box&move=box:-300:5&shadows=0&angle=10');
check('query parse', q.off.length === 2 && q.move.box[0] === -300 && q.move.box[1] === 5 && !q.shadows && q.angle === 10);
const surf = planShadow({ ...caster, shadow: { type: 'surface-drop', distance: 14, receivers: ['sofa'] } }, DEFAULT_LIGHT)!;
check('surface-drop slides up-right and keeps receivers', surf.kind === 'silhouette' && surf.matrix[4] > 0 && surf.matrix[5] < 0 && surf.receivers?.[0] === 'sofa');
check('no receivers by default', plan.receivers === undefined);
console.log(`shadows: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} shadow checks failed`);
