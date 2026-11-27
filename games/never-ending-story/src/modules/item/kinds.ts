/** Built-in reusable item kinds. Identities are written in kinds.json (UUID, kind, title, slug). */
import { registerKinds, type ItemKindRecord } from './catalog';
import catalog from './kinds.json' with { type: 'json' };

registerKinds(catalog as ItemKindRecord[]);
