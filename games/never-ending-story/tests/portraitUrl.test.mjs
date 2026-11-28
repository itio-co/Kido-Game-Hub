// Portrait still URLs must include the Vite app base (e.g. /never/), not a root-absolute /img/ path.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const base = new URL('../', import.meta.url);
const imageUrlSrc = await fs.readFile(new URL('src/lib/imageUrl.ts', base), 'utf8');
const portraitSrcFile = await fs.readFile(new URL('src/modules/typing/portrait.ts', base), 'utf8');

function transpileWithBase(appBase) {
  const replaced = (imageUrlSrc + '\n' + portraitSrcFile.replace(
    "import { imageUrl } from '../../lib/imageUrl.ts';\n",
    '',
  ).replace("import catalog from './portraits/catalog.json' with { type: 'json' };\n", 'const catalog = [];\n'))
    .replace('import.meta.env.BASE_URL', JSON.stringify(appBase));
  const js = ts.transpileModule(replaced, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}

const underNever = await import(transpileWithBase('/never/'));
assert.equal(
  underNever.portraitSrc('/img/typing/portraits/bjarne-stroustrup.webp'),
  '/never/img/typing/portraits/bjarne-stroustrup.webp',
);
assert.equal(
  underNever.portraitSrc('typing/portraits/bjarne-stroustrup.webp'),
  '/never/img/typing/portraits/bjarne-stroustrup.webp',
);
assert.equal(
  underNever.portraitSrc('img/typing/portraits/bjarne-stroustrup.webp'),
  '/never/img/typing/portraits/bjarne-stroustrup.webp',
);

const relative = await import(transpileWithBase('./'));
assert.equal(
  relative.portraitSrc('/img/typing/portraits/linus-torvalds.webp'),
  './img/typing/portraits/linus-torvalds.webp',
);
assert.ok(!relative.portraitSrc('/img/typing/portraits/linus-torvalds.webp').startsWith('/img/'));

console.log('ok - typist portrait URLs include the app base path');
