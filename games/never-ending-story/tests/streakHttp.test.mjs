// Worker streak endpoints against an in-memory D1 fake: POST /runs, POST /players/me/streak/win, GET /players/me/streak.
// Run by `npm test`. Uses a test-only key; never a real secret.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rolldown } from 'rolldown';

async function load(input) {
  const bundle = await rolldown({ input });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  return import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
}
const { default: worker } = await load('worker/index.ts');
const { packRun } = await load('src/modules/minigame-core/runProto.ts');

const sha = (s) => createHash('sha256').update(s).digest('hex');
const players = new Map(); // playerId -> {token_hash}
const runs = new Map(); // sessionId -> row
const streaks = new Map(); // playerId -> {record_json, rev}
const log = [];
function stmt(sql) {
  let args = [];
  const s = sql.replace(/\s+/g, ' ').trim();
  return {
    bind(...a) { args = a; return this; },
    async first() {
      if (s.startsWith('SELECT playerId FROM players WHERE token_hash=?')) {
        for (const [id, p] of players) if (p.token_hash === args[0]) return { playerId: id };
        return null;
      }
      if (s.startsWith('SELECT token_hash FROM players WHERE playerId=?')) return players.get(args[0]) ?? null;
      if (s.startsWith('SELECT verified FROM runs WHERE sessionId=?')) return runs.get(args[0]) ?? null;
      if (s.startsWith('SELECT record_json, rev FROM player_streak')) return streaks.get(args[0]) ?? null;
      throw new Error('unexpected first: ' + s);
    },
    async run() {
      log.push(s.slice(0, 40));
      if (s.startsWith('CREATE TABLE IF NOT EXISTS player_streak')) return { meta: { changes: 0 } };
      if (s.startsWith('INSERT INTO players')) {
        if (!players.has(args[0])) players.set(args[0], { token_hash: null });
        return { meta: { changes: 1 } };
      }
      if (s.startsWith('INSERT INTO runs')) {
        const [sessionId, playerId] = args;
        const verified = args[13];
        const cur = runs.get(sessionId);
        if (!cur) { runs.set(sessionId, { playerId, verified }); return { meta: { changes: 1 } }; }
        if (verified === 1 && cur.playerId === playerId) { cur.verified = 1; return { meta: { changes: 1 } }; }
        return { meta: { changes: 0 } };
      }
      if (s.startsWith('INSERT INTO player_streak')) {
        const [pid, json, , , , , rev] = args;
        const cur = streaks.get(pid);
        if (!cur) { streaks.set(pid, { record_json: json, rev: 1 }); return { meta: { changes: 1 } }; }
        if (cur.rev !== rev) return { meta: { changes: 0 } };
        streaks.set(pid, { record_json: json, rev: cur.rev + 1 });
        return { meta: { changes: 1 } };
      }
      throw new Error('unexpected run: ' + s);
    },
  };
}
const KEY = 'test-only-streak-key';
const env = { APP_BASE: '/never', ASSETS_KV: {}, DB: { prepare: stmt }, STREAK_TOKEN_KEY: KEY };
const req = (path, init = {}) => new Request('https://games.itio.space/never/api' + path, init);
const PID = 'streak-test-player-01';
const TOKEN = 'test-bearer-not-real';
players.set(PID, { token_hash: sha(TOKEN) });
const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

const realNow = Date.now;
const at = (iso) => { Date.now = () => Date.parse(iso); };

async function win(streakToken) {
  const res = await worker.fetch(req('/players/me/streak/win', { method: 'POST', headers: auth, body: JSON.stringify({ game: 'jig', streakToken }) }), env);
  assert.equal(res.status, 200);
  return (await res.json()).streak;
}
let n = 0;
async function rankedRun(streakToken, score = 1000) {
  n += 1;
  const sessionId = `streak-session-${String(n).padStart(4, '0')}`;
  const token = await packRun({
    sessionId, playerId: PID, nickname: 'T', game: 'cross', difficulty: 'easy', seed: 1234, score, timeMs: 30_000, version: 't',
    timestampMs: Date.now(), challengerSessionId: '', challengerNickname: '', challengerScore: 0, challengerTimeMs: 0, ruleset: '',
  });
  const res = await worker.fetch(req('/runs', { method: 'POST', headers: auth, body: JSON.stringify({ token, streakToken }) }), env);
  assert.equal(res.status, 200, await res.clone().text());
  return { body: await res.json(), token };
}

try {
  // Day 1, 23:59 Bangkok: first story win.
  at('2026-11-23T16:59:00Z');
  let s = await win(null);
  assert.equal(s.view.count, 1);
  assert.equal(s.view.today, '2026-11-23');
  assert.equal(s.check, 'missing');
  assert.equal(s.counted, true);
  assert.equal(s.batteryGranted, false, 'new streak starts full, no grant');
  assert.match(s.token, /^st1\./);
  assert.ok(!s.token.includes('2026'), 'token is not plain text');

  // Same Bangkok day again: not counted twice.
  s = await win(s.token);
  assert.equal(s.check, 'ok');
  assert.equal(s.counted, false);
  assert.equal(s.batteryGranted, false);
  assert.equal(s.view.count, 1);
  assert.equal(s.view.totalWins, 2);

  // 00:01 Bangkok next day (still 23 Nov UTC): a ranked run counts the new day.
  at('2026-11-23T17:01:00Z');
  let r = await rankedRun(s.token);
  assert.equal(r.body.verified, true);
  assert.equal(r.body.streak.view.count, 2);
  assert.equal(r.body.streak.view.today, '2026-11-24');
  assert.equal(r.body.streak.check, 'ok');
  s = r.body.streak;

  // Resubmitting the same ranked run does not count again.
  const again = await worker.fetch(req('/runs', { method: 'POST', headers: auth, body: JSON.stringify({ token: r.token, streakToken: s.token }) }), env);
  assert.equal((await again.json()).streak, undefined);

  // A tampered token is reported, the server record still counts. Skip one day: one battery used.
  at('2026-11-26T03:00:00Z');
  const [v, iv, ct] = s.token.split('.');
  const forged = `${v}.${iv}.${(ct[0] === 'A' ? 'B' : 'A') + ct.slice(1)}`;
  s = await win(forged);
  assert.equal(s.check, 'invalid');
  assert.equal(s.view.count, 3);
  assert.equal(s.counted, true);
  assert.equal(s.batteryGranted, true, 'missed one day then grant +1 back to full');
  assert.equal(s.view.batteries, 2);
  assert.deepEqual(s.view.days.map((d) => d.kind), ['win', 'win', 'saved', 'win']);
  const replay = await win(s.token);
  assert.equal(replay.counted, false);
  assert.equal(replay.batteryGranted, false, 'same-day replay does not grant again');
  assert.equal(replay.view.batteries, 2);
  s = replay;

  // An old (stale) token is reported as stale.
  at('2026-11-27T03:00:00Z');
  const stale = s.token;
  s = await win(stale);
  const s2 = await worker.fetch(req('/players/me/streak', { headers: { ...auth, 'x-streak-token': stale } }), env);
  const read = (await s2.json()).streak;
  assert.equal(read.check, 'stale');
  assert.equal(read.view.count, 4);
  assert.equal(read.view.state, 'done');

  // Read-only GET three days later projects a reset without writing.
  at('2026-12-01T03:00:00Z');
  const before = streaks.get(PID).rev;
  const g = await (await worker.fetch(req('/players/me/streak', { headers: auth }), env)).json();
  assert.equal(g.streak.view.state, 'reset');
  assert.equal(g.streak.view.count, 0);
  assert.equal(g.streak.view.best, 4);
  assert.equal(streaks.get(PID).rev, before, 'GET writes nothing');

  // A zero-score run is not a win.
  r = await rankedRun(s.token, 0);
  assert.equal(r.body.streak, undefined);

  // No bearer: 401. Bad game id: 400.
  assert.equal((await worker.fetch(req('/players/me/streak'), env)).status, 401);
  assert.equal((await worker.fetch(req('/players/me/streak/win', { method: 'POST', headers: auth, body: JSON.stringify({ game: '../x' }) }), env)).status, 400);

  // Without the secret the streak still counts and no token is issued.
  const noKey = await (await worker.fetch(req('/players/me/streak/win', { method: 'POST', headers: auth, body: '{"game":"slide"}' }), { ...env, STREAK_TOKEN_KEY: undefined })).json();
  assert.equal(noKey.streak.token, null);
  assert.equal(noKey.streak.check, 'nokey');
  assert.equal(noKey.streak.view.count, 1);
  assert.equal(noKey.streak.view.batteries, 2);
} finally {
  Date.now = realNow;
}
console.log('streak endpoints: once per day, Bangkok midnight, battery, tamper and stale checks passed');
