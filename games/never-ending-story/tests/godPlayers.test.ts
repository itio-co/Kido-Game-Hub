import { playerPageParams } from '../src/modules/god/playerQuery.ts';

declare const process: { exitCode?: number };
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function eq(a: unknown, b: unknown, msg: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

test('playerPageParams defaults to page 1 and 20 per page', () => {
  eq(playerPageParams(new URL('https://games.itio.space/never/api/god/players')), { q: '', page: 1, pageSize: 20 }, 'defaults');
});

test('playerPageParams keeps search and a valid page', () => {
  eq(
    playerPageParams(new URL('https://games.itio.space/never/api/god/players?q=mali&page=3')),
    { q: 'mali', page: 3, pageSize: 20 },
    'search page',
  );
});

test('playerPageParams rejects non-positive pages', () => {
  eq(playerPageParams(new URL('https://x/players?page=0')).page, 1, 'zero');
  eq(playerPageParams(new URL('https://x/players?page=-2')).page, 1, 'negative');
  eq(playerPageParams(new URL('https://x/players?page=foo')).page, 1, 'junk');
});

if (failed) process.exitCode = 1;
else console.log('godPlayers: all tests passed');
