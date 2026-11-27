/** Case-01 item catalog. Identities are written in items.json (UUID, kind, title, slug). */
import { registerItems, type Item } from '../item';
import catalog from './items.json' with { type: 'json' };

registerItems(catalog as Item[]);
