import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEntities, validateRoom } from '../src/lib/catalog.ts';

const root = dirname(fileURLToPath(import.meta.url));
const file = join(root, '../public/data/player-room.json');
const data: unknown = JSON.parse(readFileSync(file, 'utf8'));

try {
  const catalog = validateRoom(data);
  const sampleSlug = 'player-room/bookshelf/row-1/book-03';
  const bySlug = catalog.getBySlug(sampleSlug);
  const byId = bySlug ? catalog.getById(bySlug.id) : undefined;
  if (!bySlug || bySlug.kind !== 'book' || !byId || byId.slug !== sampleSlug) {
    console.error(`lookup failed for ${sampleSlug}`);
    process.exit(1);
  }
  console.log(`player-room.json ok (${sampleSlug} → ${bySlug.id})`);
  const screens = JSON.parse(readFileSync(join(root, '../public/data/screens.json'), 'utf8'));
  const flow = JSON.parse(readFileSync(join(root, '../public/data/case-flow.json'), 'utf8'));
  const registry = validateEntities(screens, 'screen-registry');
  validateEntities(flow, 'story-flow');
  const real = screens.screens.filter((item) => item.status === 'real').map((item) => item.screen);
  const demo = screens.screens.filter((item) => item.status === 'demo').map((item) => item.screen);
  if (real.join(',') !== 'player-room,return-home') {
    console.error(`real screens should be the player room and the return home: ${real}`);
    process.exit(1);
  }
  if (demo.length < 1 || screens.screens.some((item) => item.status !== 'demo' && item.status !== 'real')) {
    console.error('every screen needs status demo or real');
    process.exit(1);
  }
  if (!registry.getBySlug('screen/living-room')) {
    console.error('missing living-room screen');
    process.exit(1);
  }
  console.log(`screens.json ok (${screens.screens.length} screens, demo ${demo.length})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
