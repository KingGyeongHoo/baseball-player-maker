import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const {
  statKeys
} = require('../.test-build/lib/sim/types.js');
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const newGame = (seed = 'unit') => e.createGame(seed, '테스트', 'SS');
const step = s => e.advanceWeek(s, e.getPlayer(s).trainingPolicy, e.getPlayer(s).stance);
const uniform = (p, n) => {
  for (const k of statKeys) p.stats[k] = n;
};
test('loaded walk pushes only forced runners and preserves pitcher responsibility', () => {
  const runners = ['first', 'second', 'third'].map(name => ({
    name,
    pitcher: 'old-pitcher'
  }));
  const bases = [...runners],
    scores = [];
  const batter = {
    name: 'batter',
    pitcher: 'new-pitcher'
  };
  e.advanceRunners(bases, batter, 0, () => false, r => scores.push(r));
  assert.deepEqual(scores, [runners[2]]);
  assert.equal(scores[0].pitcher, 'old-pitcher');
  assert.deepEqual(bases, [batter, runners[0], runners[1]]);
  const noForce = [null, runners[1], runners[2]];
  e.advanceRunners(noForce, batter, 0, () => false, () => assert.fail('unforced runner scored'));
  assert.deepEqual(noForce, [batter, runners[1], runners[2]]);
});
test('single never lets a trailing runner pass a stopped leading runner', () => {
  const bases = ['first', 'second', null],
    scores = [];
  e.advanceRunners(bases, 'batter', 1, r => r === 'first', r => scores.push(r));
  assert.deepEqual(bases, ['batter', 'first', 'second']);
  assert.deepEqual(scores, []);
});
test('bases-loaded home run scores all four even on a walk-off', () => {
  const bases = ['first', 'second', 'third'],
    scores = [];
  e.advanceRunners(bases, 'batter', 4, () => false, (r, hr) => {
    assert.equal(hr, true);
    scores.push(r);
  });
  assert.deepEqual(scores, ['third', 'second', 'first', 'batter']);
  assert.deepEqual(bases, [null, null, null]);
});
export function assertGame(game, players) {
  if (game.status === 'forfeit') {
    assert.deepEqual(game.boxScore, {});
    return;
  }
  if (game.status !== 'completed') return;
  const rosters = [game.homeTeamId, game.awayTeamId].map(id => players.filter(p => p.teamId === id));
  const totals = rosters.map(roster => {
    const total = e.emptyRecord();
    for (const p of roster) if (game.boxScore[p.id]) e.mergeRecord(total, game.boxScore[p.id]);
    return total;
  });
  for (const [id, {
    batting: b,
    pitching: p
  }] of Object.entries(game.boxScore)) {
    assert.equal(b.PA, b.AB + b.BB, id);
    assert.equal(b.AB, b.H + b.SO + b.GB + b.FB, id);
    assert.ok(b.H >= b["2B"] + b["3B"] + b.HR, id);
    assert.equal(p.R, p.ER, id);
    assert.ok(!(b.PA && p.BF), `same-game two-way ${id}`);
    for (const n of [...Object.values(b), ...Object.values(p)]) assert.ok(Number.isInteger(n) && n >= 0);
  }
  for (const side of [0, 1]) {
    assert.equal(totals[side].batting.R, game.score[side]);
    assert.equal(totals[side].batting.RBI, game.score[side]);
    assert.equal(totals[side].batting.PA, totals[1 - side].pitching.BF);
    assert.equal(totals[side].batting.H, totals[1 - side].pitching.H);
    assert.equal(totals[side].batting.AB - totals[side].batting.H, totals[1 - side].pitching.outs);
    assert.equal(game.innings[side].reduce((a, b) => a + b, 0), game.score[side]);
  }
  assert.ok(game.innings.every(x => x.length <= 12));
}
test('seed reproduces creation and preview without normalizing totals', () => {
  const a = newGame(),
    b = newGame();
  assert.deepEqual(a, b);
  assert.equal(a.players.length, 3000);
  assert.equal(a.teams.length, 100);
  assert.deepEqual(e.previewPlayer('unit', '테스트', 'SS').stats, e.getPlayer(a).stats);
  assert.notDeepEqual(a.players[0].stats, a.players[1].stats);
  assert.equal(a.players.filter(p => p.grade === 3).length, 1000);
  for (const p of a.players) for (const v of Object.values(p.stats)) assert.ok(v >= 1 && v <= 100);
});
test('ticket budgets reject excess, negative, fractional, and nonzero rest', () => {
  const p = e.defaultPolicy('코너 야수');
  assert.equal(e.validPolicy(p), true);
  for (const v of [-1, .5, 6]) {
    const bad = structuredClone(p);
    bad.tickets.contact = v;
    assert.equal(e.validPolicy(bad), false);
  }
  assert.equal(e.validPolicy({
    ...p,
    mode: 'light'
  }), false);
  assert.equal(e.validPolicy({
    ...p,
    mode: 'rest'
  }), false);
  assert.equal(e.validPolicy({
    mode: 'rest',
    tickets: Object.fromEntries(Object.keys(p.tickets).map(k => [k, 0]))
  }), true);
});
test('log growth, diminishing increments, talent multiplier and daily normalization', () => {
  close(e.focusGrowth(0), 0);
  close(e.focusGrowth(1), .1);
  close(e.focusGrowth(5), .25);
  assert.ok(e.focusGrowth(2) - e.focusGrowth(1) > e.focusGrowth(3) - e.focusGrowth(2));
  const p = e.getPlayer(newGame());
  uniform(p, 40);
  p.trainingPolicy = e.defaultPolicy('센터라인');
  p.talent.batting = 1;
  const a = structuredClone(p),
    b = structuredClone(p);
  b.talent.batting = 10;
  e.train(a, 5);
  e.train(b, 5);
  close(b.stats.contact - 40, 2 * (a.stats.contact - 40));
  const c = structuredClone(p);
  for (let i = 0; i < 5; i++) e.train(c, 1);
  close(c.stats.contact, a.stats.contact);
  const noTickets = structuredClone(p);
  for (const k of Object.keys(noTickets.trainingPolicy.tickets)) noTickets.trainingPolicy.tickets[k] = 0;
  e.train(noTickets, 5);
  assert.deepEqual(noTickets.stats, p.stats);
  uniform(p, 100);
  e.train(p, 5);
  assert.equal(p.stats.contact, 100);
  const physical = structuredClone(c);
  physical.talent.batting = 10;
  physical.trainingPolicy.tickets.physical = 3;
  const before = {
    ...physical.stats
  };
  e.train(physical, 5);
  close(physical.stats.stamina - before.stamina, e.focusGrowth(3) / 3);
});
test('physical interpolation and fatigue/injury thresholds', () => {
  close(e.interpolate(1, 1.25, 1, .75), 1.25);
  close(e.interpolate(50, 1.25, 1, .75), 1);
  close(e.interpolate(100, 1.25, 1, .75), .75);
  close(e.injuryRisk(59.99), 0);
  close(e.injuryRisk(60), .005);
  close(e.injuryRisk(79.99), .014995);
  close(e.injuryRisk(80), .02);
  close(e.injuryRisk(100), .06);
  const p = e.getPlayer(newGame());
  uniform(p, 40);
  p.stance = {
    batting: 'level',
    pitching: 'command'
  };
  p.fatigue = 80;
  const a = e.effective(p);
  p.fatigue = 100;
  const b = e.effective(p);
  close(b.contact / a.contact, .85);
  close(a.stamina, b.stamina);
});
test('conditional probabilities match documented equal-40 example', () => {
  const p = e.getPlayer(newGame());
  uniform(p, 40);
  const q = e.probabilities(p.stats, p.stats, 40, 40);
  close(q.bb, .09);
  close(q.hit, .28);
  close((1 - q.bb) * q.hit, .2548);
  close((1 - q.bb) * (1 - q.hit) * q.k, .183456);
  const values = [q.bb, (1 - q.bb) * q.hit, (1 - q.bb) * (1 - q.hit) * q.k, (1 - q.bb) * (1 - q.hit) * (1 - q.k)];
  close(values.reduce((a, b) => a + b), 1);
  for (const n of [1, 40, 100, 120]) {
    uniform(p, n);
    const q = e.probabilities(p.stats, p.stats, n, n);
    assert.ok(q.hr + q.double + q.triple <= 1);
    assert.ok(Object.values(q).every(v => v >= 0 && v <= 1));
  }
  assert.equal(e.ops(e.emptyRecord()), null);
});
test('fictional calendar has no duplicate teams, 200 training days and first-Monday draft', () => {
  for (const year of [2027, 2028, 2029]) {
    const c = e.calendar(year);
    assert.equal(c.sourceKind, 'fictional');
    assert.equal(c.trainingDays.length, 200);
    assert.equal(new Date(c.draftDate + 'T00:00:00Z').getUTCDay(), 1);
    assert.ok(+c.draftDate.slice(-2) <= 7);
    for (const date of new Set(c.events.map(g => g.date))) {
      const ids = c.events.filter(g => g.date === date).flatMap(g => [g.homeTeamId, g.awayTeamId]);
      assert.equal(ids.length, 100);
      assert.equal(new Set(ids).size, 100);
    }
  }
});
test('weekly commit is deterministic, immutable, and identical in worker thread', async () => {
  const s = newGame();
  const before = structuredClone(s);
  const a = step(s);
  assert.deepEqual(s, before);
  assert.deepEqual(a, step(s));
  const worker = new Worker(`const {parentPort}=require('node:worker_threads');const e=require(${JSON.stringify(require.resolve('../.test-build/lib/sim/engine.js'))});parentPort.on('message',s=>parentPort.postMessage(e.advanceWeek(s,e.getPlayer(s).trainingPolicy,e.getPlayer(s).stance)));`, {
    eval: true
  });
  const b = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.postMessage(s);
  });
  await worker.terminate();
  assert.deepEqual(a, b);
  const invalid = structuredClone(e.getPlayer(s).trainingPolicy);
  invalid.tickets.contact = 100;
  assert.throws(() => e.advanceWeek(s, invalid, e.getPlayer(s).stance));
  assert.deepEqual(s, before);
});
test('rest, injury recovery date, forced rest and talent disclosure', () => {
  let s = newGame();
  const p = e.getPlayer(s);
  p.fatigue = 100;
  p.forcedRest = true;
  p.injury = {
    severity: 'moderate',
    startDate: s.date,
    unavailableUntil: e.addDays(s.date, 7),
    originalPenalty: 2,
    penaltyRemaining: 2,
    penaltyRecoverDays: 14
  };
  const before = {
    ...p.stats
  };
  s = step(s);
  assert.deepEqual(e.getPlayer(s).stats, before);
  assert.equal(e.getPlayer(s).injury.penaltyRemaining, 2);
  s = step(s);
  assert.ok(e.getPlayer(s).stats.contact > before.contact);
  assert.ok(e.getPlayer(s).injury.penaltyRemaining < 2);
  const rest = structuredClone(e.getPlayer(s).trainingPolicy);
  rest.mode = 'rest';
  for (const k of Object.keys(rest.tickets)) rest.tickets[k] = 0;
  const snapshot = {
    ...e.getPlayer(s).stats
  };
  s = e.advanceWeek(s, rest, e.getPlayer(s).stance);
  assert.deepEqual(e.getPlayer(s).stats, snapshot);
  assert.equal(e.getPlayer(s).fatigue, 0);
  const player = e.getPlayer(s);
  player.talentExposure.batting = 9.99;
  assert.equal(e.talentLabel(player, 'batting'), '미상');
  player.talentExposure.batting = 10;
  assert.notEqual(e.talentLabel(player, 'batting'), '미상');
  player.talentExposure.batting = 30;
  assert.match(e.talentLabel(player, 'batting'), /\/ 10/);
});
test('completed games preserve PA, outs, hits, runs, and pitcher attribution', () => {
  let s = newGame('games');
  for (let w = 0; w < 10; w++) s = step(s);
  const completed = s.calendar.events.filter(g => g.status === 'completed');
  assert.ok(completed.length >= 100);
  for (const g of completed) assertGame(g, s.players);
  const game = structuredClone(s.calendar.events.find(g => g.status === 'scheduled'));
  const roster = s.players.filter(p => p.teamId === game.homeTeamId);
  roster.forEach(p => {
    p.forcedRest = true;
  });
  e.simulateGame(s, game, [roster, s.players.filter(p => p.teamId === game.awayTeamId)]);
  assert.equal(game.status, 'forfeit');
  assertGame(game, s.players);
});
test('role offer adds eligibility only on acceptance, with cooldown', () => {
  const s = newGame();
  const p = e.getPlayer(s);
  p.roleOffer = '선발';
  const old = {
    ...p.stats
  };
  const refused = e.answerOffer(s, false);
  assert.equal(e.getPlayer(refused).primaryRole, p.primaryRole);
  assert.equal(e.getPlayer(refused).offerCooldown, 8);
  const accepted = e.answerOffer(s, true);
  assert.equal(e.getPlayer(accepted).primaryRole, '선발');
  assert.ok(e.getPlayer(accepted).eligiblePositions.includes('SP'));
  assert.deepEqual(e.getPlayer(accepted).stats, old);
});
test('twelve scoreless innings end in a draw without manufacturing runs', () => {
  const s = newGame('scoreless');
  const g = structuredClone(s.calendar.events[0]);
  const keys = ['match.bb_min', 'match.bb_max', 'match.hit_min', 'match.hit_max'];
  const old = keys.map(k => e.params[k]);
  try {
    for (const k of keys) e.params[k] = 0;
    e.simulateGame(s, g, [s.players.filter(p => p.teamId === g.homeTeamId), s.players.filter(p => p.teamId === g.awayTeamId)]);
    assert.equal(g.status, 'completed');
    assert.deepEqual(g.score, [0, 0]);
    assert.equal(g.innings[0].length, 12);
    assert.equal(g.innings[1].length, 12);
    assertGame(g, s.players);
  } finally {
    keys.forEach((k, i) => {
      e.params[k] = old[i];
    });
  }
});
test('100-PA guard aborts the entire weekly commit and reports seed/game', () => {
  const s = newGame('safety-guard');
  s.date = '2027-04-01';
  const before = structuredClone(s);
  const old = [e.params['match.bb_min'], e.params['match.bb_max']];
  try {
    e.params['match.bb_min'] = e.params['match.bb_max'] = 1;
    assert.throws(() => step(s), /seed=safety-guard, game=/);
    assert.deepEqual(s, before);
  } finally {
    [e.params['match.bb_min'], e.params['match.bb_max']] = old;
  }
});
test('one evaluated player and tied evaluated players receive reputation 50', () => {
  let s = newGame('reputation');
  const p = e.getPlayer(s);
  p.seasonStats.batting.PA = p.seasonStats.batting.AB = p.seasonStats.batting.H = 1;
  s = step(s);
  assert.equal(e.getPlayer(s).reputation, 50);
  assert.equal(s.players.filter(p => p.reputation !== null).length, 1);
  const second = s.players.find(p => p.id !== s.playerId && !e.isPitcher(p.primaryRole));
  second.seasonStats = structuredClone(e.getPlayer(s).seasonStats);
  s = step(s);
  assert.equal(e.getPlayer(s).reputation, 50);
  assert.equal(s.players.find(p => p.id === second.id).reputation, 50);
});
test('three seasons preserve roster size, promote, draft once and block further play', {
  timeout: 120000
}, () => {
  let s = newGame('full-career');
  let count = 0;
  while (s.phase !== 'ended') {
    s = step(s);
    count++;
    assert.equal(s.players.length, 3000);
    assert.ok(count < 140);
  }
  const p = e.getPlayer(s);
  assert.equal(p.grade, 3);
  assert.equal(p.career.length, 2);
  assert.equal(s.date, s.calendar.draftDate);
  assert.equal(s.draft.length, 100);
  assert.equal(new Set(s.draft.map(d => d.playerId)).size, 100);
  assert.equal(s.calendar.seasonYear, 2029);
  assert.ok(p.career.every(c => c.records.batting.PA >= 0));
  assert.throws(() => step(s));
  for (const g of s.calendar.events) assertGame(g, s.players);
});
