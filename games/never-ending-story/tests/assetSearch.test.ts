import { filterAssets, type SearchableAsset } from '../src/lib/assetSearch.ts';
declare const process: { exitCode?: number };
let passed = 0; let failed = 0;
const items: SearchableAsset[] = [
  { key: 'nightstand', kind: 'model', title: 'ตู้ข้างเตียง', titleEn: 'Nightstand', slug: 'player-room/nightstand', source: 'assets-src/nightstand/asset.json' },
  { key: 'clock', kind: 'model', title: 'นาฬิกาแขวน', titleEn: 'Wall clock', slug: 'flow/living-room/clock', source: 'assets-src/clock/asset.json' },
  { key: 'image', kind: 'scene', title: 'ห้องนั่งเล่น', titleEn: 'Living room', slug: 'flow/scene/living-room', source: 'public/img/living-wide.jpg' },
];
function test(name: string, fn: () => boolean): void { try { if (!fn()) throw Error(name); passed++; } catch { console.error(`FAIL ${name}`); failed++; } }
test('blank query keeps project order', () => filterAssets(items, '   ', 'all').map(x => x.key).join() === 'nightstand,clock,image');
test('Thai search', () => filterAssets(items, 'นาฬิกา', 'all')[0]?.key === 'clock');
test('case-insensitive English', () => filterAssets(items, 'WALL CLOCK', 'all')[0]?.key === 'clock');
test('source and slug search', () => filterAssets(items, 'public/img', 'all')[0]?.key === 'image');
test('multiple words match across fields', () => filterAssets(items, 'living clock', 'all')[0]?.key === 'clock');
test('category and search intersect', () => filterAssets(items, 'living', 'scene').length === 1);
test('empty result stays empty', () => filterAssets(items, 'missing object', 'all').length === 0);
test('model category alias', () => filterAssets(items, '3d model', 'all').length === 2);
test('sort by name', () => filterAssets(items, '', 'all', 'name').map(x => x.key).join() === 'image,nightstand,clock');
test('sort does not mutate catalog', () => { filterAssets(items, '', 'all', 'name'); return items[0]?.key === 'nightstand'; });
console.log(`assetSearch: ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
