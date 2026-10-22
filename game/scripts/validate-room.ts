import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRoom } from '../src/lib/catalog.ts';

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
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
