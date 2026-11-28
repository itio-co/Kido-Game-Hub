// Role policy (src/lib/roles.ts): ordering, normalizing, who may change whom, and the lazy column heal. Run by `npm test`.
import { atLeast, checkRoleChange, ensureRoleColumns, isRole, normalizeRole, playerRoleByTokenHash, withRoleColumns, type Principal, type RoleDb } from '../src/lib/roles.ts';

declare const process: { exitCode?: number };
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function eq(a: unknown, b: unknown, msg: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

const password: Principal = { role: 'super_god', via: 'password', playerId: null };
const superToken: Principal = { role: 'super_god', via: 'token', playerId: 'super-player-01' };
const godToken: Principal = { role: 'god', via: 'token', playerId: 'god-player-0001' };
const playerToken: Principal = { role: 'player', via: 'token', playerId: 'plain-player-01' };
const target = (role: 'player' | 'god' | 'super_god', registered = true) => ({ playerId: 'target-player-01', role, registered });

await test('roles are ordered player < god < super_god', () => {
  eq(atLeast('player', 'god'), false, 'player>=god');
  eq(atLeast('god', 'god'), true, 'god>=god');
  eq(atLeast('god', 'super_god'), false, 'god>=super');
  eq(atLeast('super_god', 'god'), true, 'super>=god');
});

await test('unknown stored values fall back to player', () => {
  eq(normalizeRole(undefined), 'player', 'undefined');
  eq(normalizeRole(null), 'player', 'null');
  eq(normalizeRole('admin'), 'player', 'admin');
  eq(normalizeRole('GOD'), 'player', 'case');
  eq(normalizeRole('super_god'), 'super_god', 'super');
  eq(isRole('god'), true, 'isRole');
  eq(isRole('root'), false, 'isRole root');
});

await test('password session promotes player to god and demotes back', () => {
  eq(checkRoleChange({ actor: password, target: target('player'), next: 'god' }), { ok: true, next: 'god', changed: true }, 'promote');
  eq(checkRoleChange({ actor: password, target: target('god'), next: 'player' }), { ok: true, next: 'player', changed: true }, 'demote');
});

await test('same role is a no-op', () => {
  eq(checkRoleChange({ actor: password, target: target('god'), next: 'god' }), { ok: true, next: 'god', changed: false }, 'noop');
});

await test('players and gods cannot change roles', () => {
  eq(checkRoleChange({ actor: playerToken, target: target('player'), next: 'god' }), { ok: false, error: 'not-allowed' }, 'player');
  eq(checkRoleChange({ actor: godToken, target: target('player'), next: 'god' }), { ok: false, error: 'not-allowed' }, 'god promotes');
  eq(checkRoleChange({ actor: godToken, target: target('god'), next: 'player' }), { ok: false, error: 'not-allowed' }, 'god demotes');
});

await test('a player token cannot change its own role', () => {
  const self = { playerId: superToken.playerId!, role: 'super_god' as const, registered: true };
  eq(checkRoleChange({ actor: superToken, target: self, next: 'player', confirmSuperGod: true }), { ok: false, error: 'self-change' }, 'self');
  const selfGod = { playerId: godToken.playerId!, role: 'god' as const, registered: true };
  eq(checkRoleChange({ actor: godToken, target: selfGod, next: 'super_god' }), { ok: false, error: 'not-allowed' }, 'god to super');
});

await test('super_god is granted and removed only through the password session', () => {
  eq(checkRoleChange({ actor: superToken, target: target('god'), next: 'super_god' }), { ok: false, error: 'password-required' }, 'token grants');
  eq(checkRoleChange({ actor: superToken, target: target('super_god'), next: 'god', confirmSuperGod: true }), { ok: false, error: 'password-required' }, 'token removes');
  eq(checkRoleChange({ actor: password, target: target('god'), next: 'super_god' }), { ok: true, next: 'super_god', changed: true }, 'password grants');
});

await test('a super god token can promote and demote ordinary players', () => {
  eq(checkRoleChange({ actor: superToken, target: target('player'), next: 'god' }).ok, true, 'promote');
  eq(checkRoleChange({ actor: superToken, target: target('god'), next: 'player' }).ok, true, 'demote');
});

await test('demoting a super god needs explicit confirmation', () => {
  eq(checkRoleChange({ actor: password, target: target('super_god'), next: 'god' }), { ok: false, error: 'confirm-required' }, 'no flag');
  eq(checkRoleChange({ actor: password, target: target('super_god'), next: 'god', confirmSuperGod: true }).ok, true, 'flag');
});

await test('unknown roles are rejected and unclaimed players cannot be promoted', () => {
  eq(checkRoleChange({ actor: password, target: target('player'), next: 'root' }), { ok: false, error: 'bad-role' }, 'root');
  eq(checkRoleChange({ actor: password, target: target('player'), next: undefined }), { ok: false, error: 'bad-role' }, 'undefined');
  eq(checkRoleChange({ actor: password, target: target('player', false), next: 'god' }), { ok: false, error: 'not-registered' }, 'unclaimed god');
  eq(checkRoleChange({ actor: password, target: target('player', false), next: 'super_god' }), { ok: false, error: 'not-registered' }, 'unclaimed super');
});

/** A D1 stand-in that starts without the role columns, like a database from before 0.6.40. */
function oldDb(): { db: RoleDb; log: string[]; hasColumns: () => boolean } {
  let cols = false;
  const log: string[] = [];
  const db: RoleDb = {
    prepare(sql: string) {
      const s = sql.replace(/\s+/g, ' ');
      return {
        bind() { return this; },
        async first<T>() {
          if (!cols) throw new Error('D1_ERROR: no such column: role');
          return { playerId: 'p-one-0001', role: 'god' } as T;
        },
        async run() {
          log.push(s);
          if (s.startsWith('ALTER TABLE players ADD COLUMN role TEXT')) {
            if (cols) throw new Error('D1_ERROR: duplicate column name: role');
            cols = true;
          } else if (s.startsWith('ALTER TABLE players ADD COLUMN') && !cols) {
            throw new Error('order');
          } else if (s.startsWith('ALTER TABLE players ADD COLUMN')) {
            throw new Error('D1_ERROR: duplicate column name: x');
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };
  return { db, log, hasColumns: () => cols };
}

await test('a database without role columns is healed on first read, once', async () => {
  const { db, log, hasColumns } = oldDb();
  eq(await playerRoleByTokenHash(db, 'hash'), { playerId: 'p-one-0001', role: 'god' }, 'role read after heal');
  eq(hasColumns(), true, 'columns added');
  const adds = log.filter((l) => l.startsWith('ALTER')).length;
  eq(adds, 3, 'three ALTERs');
  await playerRoleByTokenHash(db, 'hash');
  eq(log.filter((l) => l.startsWith('ALTER')).length, 3, 'no more ALTERs on the happy path');
});

await test('ensureRoleColumns can run again and ignores duplicate columns', async () => {
  const { db } = oldDb();
  await ensureRoleColumns(db);
  await ensureRoleColumns(db);
});

await test('other database errors are not swallowed', async () => {
  let threw = false;
  try { await withRoleColumns({ prepare: () => { throw new Error('boom'); } } as unknown as RoleDb, async () => { throw new Error('boom'); }); } catch { threw = true; }
  eq(threw, true, 'rethrown');
});

if (failed) process.exitCode = 1;
else console.log('roles: all tests passed');
