// Pull-to-refresh is disabled on the game and god admin pages.
// Inner lists still declare overscroll-behavior contain so they scroll locally.
//   node tests/overscroll.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const appCss = read('src/app.css');
assert.match(appCss, /html,\s*body,\s*#app[^}]*overscroll-behavior-y:\s*none/, 'html/body/#app disable pull-to-refresh');
assert.match(appCss, /\.phone\s*\{[^}]*overscroll-behavior-y:\s*none/, '.phone disables pull-to-refresh');
assert.match(appCss, /\.sheet\s*\{[^}]*overscroll-behavior-y:\s*contain/, 'dialogs/sheets still scroll locally');

const flow = read('src/modules/event-core/FlowView.svelte');
assert.match(flow, /\.deduce[^}]*overscroll-behavior-y:\s*contain/, 'case board list still scrolls');
assert.match(flow, /\.note-list[^}]*overscroll-behavior-y:\s*contain/, 'notebook list still scrolls');
assert.match(flow, /\.time-sheet[^}]*overscroll-behavior-y:\s*contain/, 'clock/calendar sheet still scrolls');

const god = read('src/modules/god/God.svelte');
assert.match(god, /:global\(html\),\s*:global\(body\)[^}]*overscroll-behavior-y:\s*none/, 'god html/body disable pull-to-refresh');
assert.match(god, /:global\(#god\)[^}]*overscroll-behavior-y:\s*none/, 'god root disables pull-to-refresh');
assert.match(god, /\.content\s*\{[^}]*overscroll-behavior-y:\s*contain/, 'god content still scrolls locally');
assert.match(god, /table\.wide[^}]*overscroll-behavior:\s*contain/, 'god admin tables still scroll locally');
assert.match(god, /pre\s*\{[^}]*overscroll-behavior-y:\s*contain/, 'god pre blocks still scroll locally');

const bag = read('src/modules/item-box/ItemBox.svelte');
assert.match(bag, /overscroll-behavior-y:\s*contain/, 'bag/item-box list still scrolls locally');

console.log('ok overscroll: game and god admin disable pull-to-refresh; inner lists contain');
