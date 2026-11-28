// Player roles over HTTP against the real Worker and an in-memory D1 stand-in: default role, GET /players/me,
// promote/demote through God admin, and every way a player or god could try to escalate. Run by `npm test`.
// Uses test-only passwords and tokens; nothing real is read or printed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'worker/index.ts' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));

const sha = (s) => createHash('sha256').update(s).digest('hex');
const PASSWORD = 'test-only-god-password';

/** players: id -> row. `legacy` starts without the role columns, like a database from before this feature. */
function makeDb({ legacy = false } = {}) {
  const players = new Map();
  const state = { columns: !legacy, alters: 0 };
  const needCols = () => { if (!state.columns) throw new Error('D1_ERROR: no such column: role'); };
  const roleOf = (p) => (state.columns ? p.role ?? 'player' : undefined);
  function stmt(sql) {
    const s = sql.replace(/\s+/g, ' ').trim();
    let args = [];
    return {
      bind(...a) { args = a; return this; },
      async first() {
        if (s.startsWith('SELECT playerId, role FROM players WHERE token_hash=?')) {
          needCols();
          for (const [id, p] of players) if (p.token_hash === args[0]) return { playerId: id, role: p.role ?? 'player' };
          return null;
        }
        if (s.startsWith('SELECT token_hash FROM players WHERE playerId=?')) return players.get(args[0]) ? { token_hash: players.get(args[0]).token_hash } : null;
        if (s.startsWith('SELECT role, (token_hash IS NOT NULL) AS registered FROM players WHERE playerId=?')) {
          needCols();
          const p = players.get(args[0]);
          return p ? { role: p.role ?? 'player', registered: p.token_hash ? 1 : 0 } : null;
        }
        if (s.startsWith('SELECT playerId, nickname, created_at, last_seen, (token_hash IS NOT NULL) AS registered, role,')) {
          needCols();
          const p = players.get(args[0]);
          return p ? { playerId: args[0], nickname: p.nickname, created_at: 1, last_seen: 1, registered: p.token_hash ? 1 : 0, role: p.role ?? 'player', role_updated_at: p.role_updated_at ?? null, role_updated_by: p.role_updated_by ?? null } : null;
        }
        if (s.startsWith('SELECT count(*) AS n FROM players p')) { needCols(); return { n: players.size }; }
        if (s.startsWith('SELECT fails, locked_until FROM god_login')) return null;
        if (s.startsWith('SELECT schema_version, state_json') || s.startsWith('SELECT schema_version, room_json')) return null;
        throw new Error('unexpected first: ' + s);
      },
      async all() {
        if (s.startsWith('SELECT p.playerId, p.nickname, p.created_at, p.last_seen, (p.token_hash IS NOT NULL) AS registered, p.role')) {
          needCols();
          return { results: [...players].map(([id, p]) => ({ playerId: id, nickname: p.nickname, registered: p.token_hash ? 1 : 0, role: p.role ?? 'player', role_updated_at: p.role_updated_at ?? null, runs: 0 })) };
        }
        if (s.startsWith('SELECT sessionId, game, difficulty') || s.startsWith('SELECT eventId, status')) return { results: [] };
        throw new Error('unexpected all: ' + s);
      },
      async run() {
        if (s.startsWith('CREATE TABLE IF NOT EXISTS god_login') || s.startsWith('DELETE FROM god_login')) return { meta: { changes: 0 } };
        if (s.startsWith('ALTER TABLE players ADD COLUMN')) {
          state.alters++;
          if (s.includes('ADD COLUMN role TEXT')) {
            if (state.columns) throw new Error('D1_ERROR: duplicate column name: role');
            state.columns = true;
          } else if (!state.columns) throw new Error('order');
          return { meta: { changes: 0 } };
        }
        if (s.startsWith('INSERT INTO players')) {
          const [id, nickname, token_hash] = args;
          const cur = players.get(id);
          if (!cur) players.set(id, { nickname, token_hash });
          else if (cur.token_hash == null) cur.token_hash = token_hash;
          return { meta: { changes: 1 } };
        }
        if (s.startsWith('UPDATE players SET role=?')) {
          needCols();
          const [role, at, by, id, was] = args;
          const p = players.get(id);
          if (!p || (p.role ?? 'player') !== was) return { meta: { changes: 0 } };
          Object.assign(p, { role, role_updated_at: at, role_updated_by: by });
          return { meta: { changes: 1 } };
        }
        if (s.startsWith('UPDATE players SET nickname=?')) {
          const p = players.get(args.at(-1));
          if (p) p.nickname = args[0];
          return { meta: { changes: p ? 1 : 0 } };
        }
        throw new Error('unexpected run: ' + s);
      },
    };
  }
  return { players, state, db: { prepare: stmt, async batch() { return []; } }, roleOf };
}

const kv = new Map();
const KV = {
  async getWithMetadata() { return { value: null, metadata: null }; },
  async get(key, type) { const raw = kv.get(key); return raw == null ? null : type === 'json' ? JSON.parse(raw) : raw; },
  async put(key, value) { kv.set(key, value); },
  async delete(key) { kv.delete(key); },
};
const call = (env, path, init = {}) => worker.fetch(new Request('https://games.itio.space/never/api' + path, init), env);
const JSON_H = { 'content-type': 'application/json' };

async function adminCookie(env) {
  const res = await call(env, '/god/login', { method: 'POST', headers: JSON_H, body: JSON.stringify({ password: PASSWORD }) });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}
async function register(env, id) {
  const res = await call(env, '/players/register', { method: 'POST', headers: JSON_H, body: JSON.stringify({ playerId: id, nickname: id.slice(0, 6), role: 'super_god' }) });
  assert.equal(res.status, 200);
  return (await res.json()).token;
}
const bearer = (token) => ({ authorization: `Bearer ${token}` });
const roleCall = (env, headers, id, body, extra = {}) => call(env, `/god/players/${id}/role`, { method: 'POST', headers: { ...JSON_H, ...headers }, body: JSON.stringify(body), ...extra });
const meRole = async (env, token) => (await (await call(env, '/players/me', { headers: bearer(token) })).json()).role;

// --- The whole flow on a database that already has the columns.
{
  const { db, players } = makeDb();
  const env = { APP_BASE: '/never', ASSETS_KV: KV, DB: db, GOD_ADMIN_PASSWORD: PASSWORD };
  const A = 'role-test-player-a1', B = 'role-test-player-b1', C = 'role-test-player-c1';
  const tokA = await register(env, A);
  const tokB = await register(env, B);
  const tokC = await register(env, C);
  const admin = { cookie: await adminCookie(env) };

  // Default role, and a role in the register body is ignored.
  assert.equal(await meRole(env, tokA), 'player', 'new players are players, even if the client asked for super_god');
  assert.equal((await call(env, '/players/me')).status, 401, 'me needs a token');
  assert.equal((await call(env, '/players/me', { headers: bearer('not-a-real-token') })).status, 401, 'bad token');
  const me = await (await call(env, '/players/me', { headers: bearer(tokA) })).json();
  assert.deepEqual(Object.keys(me).sort(), ['ok', 'playerId', 'role'], 'me exposes id and role only');
  assert.equal(JSON.stringify(me).includes(tokA), false, 'no token in the reply');

  // A plain player cannot reach any god endpoint, nor escalate.
  assert.equal((await call(env, '/god/me')).status, 401, 'anonymous god/me');
  assert.equal((await call(env, '/god/players')).status, 401, 'anonymous list');
  for (const [method, path] of [['GET', '/god/me'], ['GET', '/god/players'], ['GET', '/god/dashboard'], ['GET', '/god/modules'], ['GET', '/god/snapshots'], ['GET', '/god/events']]) {
    const res = await call(env, path, { method, headers: bearer(tokA) });
    assert.equal(res.status, 403, `${method} ${path} as player`);
    assert.equal((await res.json()).error, 'forbidden');
  }
  assert.equal((await call(env, '/god/snapshots', { method: 'POST', headers: { ...JSON_H, ...bearer(tokA) }, body: JSON.stringify({ document: { a: 1 } }) })).status, 403, 'player cannot make snapshots');
  assert.equal((await roleCall(env, bearer(tokA), A, { role: 'god' })).status, 403, 'player cannot promote self');
  assert.equal((await roleCall(env, bearer(tokA), A, { role: 'super_god' })).status, 403, 'player cannot make self super god');
  assert.equal((await roleCall(env, bearer(tokA), B, { role: 'god' })).status, 403, 'player cannot promote others');
  const patch = await call(env, `/players/${A}`, { method: 'PATCH', headers: { ...JSON_H, ...bearer(tokA) }, body: JSON.stringify({ nickname: 'x-nick', role: 'super_god' }) });
  assert.equal(patch.status, 200);
  assert.equal(await meRole(env, tokA), 'player', 'PATCH cannot set a role');
  for (const path of ['/players/me', '/players/me/role', `/players/${A}/role`]) {
    const res = await call(env, path, { method: 'PUT', headers: { ...JSON_H, ...bearer(tokA) }, body: JSON.stringify({ role: 'god' }) });
    assert.ok(res.status >= 400, `no self-service role endpoint ${path}`);
    assert.equal(await meRole(env, tokA), 'player');
  }
  assert.equal((await call(env, '/god/players', { headers: { cookie: 'nes_god=1.forged' } })).status, 401, 'forged cookie');

  // Cross-site writes are refused before anything else.
  const xsite = await roleCall(env, admin, A, { role: 'god' }, { headers: { ...JSON_H, ...admin, origin: 'https://evil.example' } });
  assert.equal(xsite.status, 403);
  assert.equal(await meRole(env, tokA), 'player');

  // The password session lists roles and promotes.
  const listed = await (await call(env, '/god/players', { headers: admin })).json();
  assert.ok(listed.players.length === 3 && listed.players.every((p) => p.role === 'player'), 'list shows role');
  const me0 = await (await call(env, '/god/me', { headers: admin })).json();
  assert.deepEqual([me0.role, me0.via], ['super_god', 'password'], 'password session is super god');
  assert.equal((await roleCall(env, admin, A, { role: 'root' })).status, 400, 'bad role');
  assert.equal((await roleCall(env, admin, 'role-test-missing-1', { role: 'god' })).status, 404, 'unknown player');
  assert.equal((await roleCall(env, admin, 'bad id', { role: 'god' })).status, 400, 'bad id');
  assert.equal((await call(env, `/god/players/${A}/role`, { method: 'POST', headers: { ...JSON_H, ...admin }, body: '{nope' })).status, 400, 'bad json');
  const promoted = await roleCall(env, admin, A, { role: 'god' });
  assert.equal(promoted.status, 200);
  const pj = await promoted.json();
  assert.deepEqual([pj.role, pj.previous, pj.changed], ['god', 'player', true]);
  assert.equal(players.get(A).role_updated_by, 'password', 'audit: who');
  assert.ok(Math.abs(players.get(A).role_updated_at - Date.now()) < 5000, 'audit: when');
  assert.equal(await meRole(env, tokA), 'god', 'player now sees role god');
  assert.equal((await (await roleCall(env, admin, A, { role: 'god' })).json()).changed, false, 'same role is a no-op');

  // A god: share links yes, everything else no, no promoting.
  const gme = await (await call(env, '/god/me', { headers: bearer(tokA) })).json();
  assert.deepEqual([gme.role, gme.via], ['god', 'token']);
  const snap = await call(env, '/god/snapshots', { method: 'POST', headers: { ...JSON_H, ...bearer(tokA) }, body: JSON.stringify({ ttl: '1h', document: { page: { title: 't' } } }) });
  assert.equal(snap.status, 200, 'god can share a snapshot');
  for (const [method, path] of [['GET', '/god/players'], ['GET', '/god/dashboard'], ['GET', '/god/snapshots'], ['DELETE', `/god/players/${B}`], ['PATCH', `/god/players/${B}`]]) {
    assert.equal((await call(env, path, { method, headers: bearer(tokA) })).status, 403, `${method} ${path} as god`);
  }
  assert.equal((await roleCall(env, bearer(tokA), B, { role: 'god' })).status, 403, 'god cannot promote');
  assert.equal((await roleCall(env, bearer(tokA), A, { role: 'super_god' })).status, 403, 'god cannot make self super god');
  assert.equal(await meRole(env, tokB), 'player');

  // Demote.
  const demoted = await roleCall(env, admin, A, { role: 'player' });
  assert.equal((await demoted.json()).role, 'player');
  assert.equal(await meRole(env, tokA), 'player');
  assert.equal((await call(env, '/god/me', { headers: bearer(tokA) })).status, 403, 'demoted player loses God access at once');

  // Unclaimed players cannot hold a role (their id is public on the leaderboard).
  players.set('role-test-unclaimed1', { nickname: 'u', token_hash: null });
  const un = await roleCall(env, admin, 'role-test-unclaimed1', { role: 'god' });
  assert.equal(un.status, 409);
  assert.equal((await un.json()).error, 'not-registered');

  // super_god is designated only through the password session.
  assert.equal((await roleCall(env, admin, B, { role: 'super_god' })).status, 200, 'password session designates a super god');
  assert.equal(await meRole(env, tokB), 'super_god');
  const sme = await (await call(env, '/god/me', { headers: bearer(tokB) })).json();
  assert.deepEqual([sme.role, sme.via], ['super_god', 'token']);
  assert.equal((await call(env, '/god/players', { headers: bearer(tokB) })).status, 200, 'super god player reaches admin API');
  assert.equal((await roleCall(env, bearer(tokB), C, { role: 'god' })).status, 200, 'super god player promotes to god');
  assert.equal(players.get(C).role_updated_by, B, 'audit: super god player id');
  assert.equal((await roleCall(env, bearer(tokB), C, { role: 'player' })).status, 200, 'and demotes');
  const cant = await roleCall(env, bearer(tokB), C, { role: 'super_god' });
  assert.equal(cant.status, 403);
  assert.equal((await cant.json()).error, 'password-required', 'a super god player cannot designate another');
  const self = await roleCall(env, bearer(tokB), B, { role: 'player', confirmSuperGod: true });
  assert.equal(self.status, 403);
  assert.equal((await self.json()).error, 'self-change', 'cannot change own super god away');
  assert.equal(await meRole(env, tokB), 'super_god');
  const noConfirm = await roleCall(env, admin, B, { role: 'god' });
  assert.equal(noConfirm.status, 409);
  assert.equal((await noConfirm.json()).error, 'confirm-required');
  assert.equal(await meRole(env, tokB), 'super_god');
  assert.equal((await roleCall(env, admin, B, { role: 'god', confirmSuperGod: true })).status, 200, 'password session demotes with confirmation');
  assert.equal(await meRole(env, tokB), 'god');
  assert.equal((await call(env, '/god/players', { headers: bearer(tokB) })).status, 403, 'demoted super god loses admin API');

  // Detail shows role + audit; a bad password session stays out.
  const detail = await (await call(env, `/god/players/${B}`, { headers: admin })).json();
  assert.equal(detail.player.role, 'god');
  assert.equal(detail.player.role_updated_by, 'password');
  assert.equal(JSON.stringify(detail).includes('token_hash'), false, 'no token hash in detail');
}

// --- A database from before the feature heals itself and keeps working.
{
  const { db, state } = makeDb({ legacy: true });
  const env = { APP_BASE: '/never', ASSETS_KV: KV, DB: db, GOD_ADMIN_PASSWORD: PASSWORD };
  const A = 'role-legacy-player-a1';
  const tok = await register(env, A);
  assert.equal(state.columns, false, 'registering does not need the columns');
  assert.equal(await meRole(env, tok), 'player', 'legacy rows read as player');
  assert.equal(state.columns, true, 'columns were added on first role read');
  const first = state.alters;
  assert.equal(await meRole(env, tok), 'player');
  assert.equal(state.alters, first, 'no more ALTERs afterwards');
  const admin = { cookie: await adminCookie(env) };
  assert.equal((await roleCall(env, admin, A, { role: 'god' })).status, 200);
  assert.equal(await meRole(env, tok), 'god');
}

// --- No password configured: token roles still gate, and the password path stays closed.
{
  const { db } = makeDb();
  const env = { APP_BASE: '/never', ASSETS_KV: KV, DB: db };
  assert.equal((await call(env, '/god/me')).status, 503, 'not configured');
}
console.log('roles HTTP: default role, GET /players/me, promote/demote, escalation and heal passed');
