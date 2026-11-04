import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

function fixture(mode = 'normal', stamina = 50, recovery = 50) {
  const state = e.createGame('fatigue-details', '피로검증', 'SS');
  const player = e.getPlayer(state);
  for (const key of Object.keys(player.stats)) player.stats[key] = 50;
  player.stats.stamina = stamina;
  player.stats.recovery = recovery;
  const policy = e.defaultPolicy('센터라인');
  policy.mode = mode;
  if (mode === 'hard') policy.tickets.power = 3;
  if (mode === 'light') { policy.tickets.defense = 1; }
  if (mode === 'rest') for (const key of Object.keys(policy.tickets)) policy.tickets[key] = 0;
  state.calendar.events = []; // Isolate training/recovery from matches and future tournament initialization.
  state.calendar.competitions = [];
  return { state, player, policy };
}

function assertConservation(state) {
  const report = state.report, fatigue = report.fatigue;
  close(report.fatigueBefore + fatigue.training + fatigue.game - fatigue.recovered, report.fatigueAfter);
  for (const key of ['training', 'game', 'recovered']) close(fatigue[key], fatigue.days.reduce((sum, day) => sum + day[key], 0));
  close(fatigue.peak, Math.max(...fatigue.days.map(day => day.peak)));
  for (let i = 0; i < fatigue.days.length; i++) {
    const day = fatigue.days[i];
    close(day.start + day.training + day.game - day.recovered, day.end);
    close(day.start, i ? fatigue.days[i - 1].end : report.fatigueBefore);
    assert.ok(day.recovered >= 0 && day.recovered <= day.peak);
    assert.ok(day.end >= 0 && day.end <= day.peak && day.peak <= 100);
  }
  close(fatigue.days.at(-1).end, e.getPlayer(state).fatigue);
}

test('normal training generates more fatigue than passive recovery', () => {
  const { state, player, policy } = fixture();
  const result = e.advanceWeek(state, policy, player.stance);
  const fatigue = result.report.fatigue;
  close(fatigue.training, 3.45); close(fatigue.game, 0); close(fatigue.recovered, 1.15);
  close(fatigue.peak, 2.85); close(e.getPlayer(result).fatigue, 2.3);
  assert.equal(fatigue.days.length, 7);
  for (const [i, day] of fatigue.days.entries()) close(day.training, i < 5 ? 0.69 : 0);
  assert.ok(fatigue.days.slice(0, 5).every(day => day.peak > 0));
  assertConservation(result);
});

test('weak stamina and recovery leave measurable fatigue after hard training', () => {
  const { state, player, policy } = fixture('hard', 1, 1);
  const forecast = e.fatigueForecast(player, policy);
  const result = e.advanceWeek(state, policy, player.stance);
  close(result.report.fatigue.training, 6.58125); close(result.report.fatigue.recovered, 0.8625);
  close(e.getPlayer(result).fatigue, 5.71875);
  close(forecast.end, 5.71875); close(forecast.peak, result.report.fatigue.peak);
  assertConservation(result);
});

test('forecast distinguishes total training load, available recovery and actual final fatigue', () => {
  const { state, player, policy } = fixture();
  const forecast = e.fatigueForecast(player, policy);
  close(forecast.weeklyTraining, 3.45); close(forecast.dailyRecovery, 0.15); close(forecast.recoveryCapacity, 1.15);
  close(forecast.peak, 2.85); close(forecast.end, 2.3);
  const result = e.advanceWeek(state, policy, player.stance);
  close(forecast.end, e.getPlayer(result).fatigue);
  close(result.report.fatigue.recovered, 1.15);
});

test('recovery reduces current fatigue by a daily fraction rather than resetting it', () => {
  const { state, player, policy } = fixture('rest');
  player.fatigue = 10;
  const forecast = e.fatigueForecast(player, policy);
  const expected = 10 * .68;
  close(forecast.recoveryCapacity, 10 - expected);
  const result = e.advanceWeek(state, policy, player.stance);
  close(result.report.fatigue.training, 0); close(result.report.fatigue.game, 0);
  close(result.report.fatigue.recovered, 10 - expected); close(result.report.fatigue.peak, 10);
  close(e.getPlayer(result).fatigue, expected);
  result.report.fatigue.days.forEach((day, i) => close(day.end, 10 * .68 ** ((i + 1) / 7)));
  assertConservation(result);
});

test('game fatigue is separate from training and both reconcile with the actual state', () => {
  const { state, player, policy } = fixture();
  state.calendar.events = e.calendar(2027).events;
  state.date = state.calendar.events.find(game => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId).date;
  for (const key of ['contact', 'power', 'speed', 'defense']) player.stats[key] = 100;
  const result = e.advanceWeek(state, policy, player.stance);
  assert.ok(result.report.records.batting.PA > 0);
  assert.ok(result.report.fatigue.game > 0);
  assert.ok(result.report.fatigue.training > 0);
  assertConservation(result);
});

test('all full budgets accumulate fatigue, in light < normal < hard order, even at maximum fitness', () => {
  for (const [stamina, recovery] of [[1, 1], [50, 50], [100, 100]]) {
    const ends = [];
    for (const mode of ['light', 'normal', 'hard']) {
      const { state, player, policy } = fixture(mode, stamina, recovery);
      const forecast = e.fatigueForecast(player, policy);
      const result = e.advanceWeek(state, policy, player.stance);
      assert.ok(forecast.weeklyTraining > forecast.recoveryCapacity);
      assert.ok(e.getPlayer(result).fatigue > 0);
      close(forecast.end, e.getPlayer(result).fatigue);
      assertConservation(result);
      ends.push(forecast.end);
    }
    assert.ok(ends[0] < ends[1] && ends[1] < ends[2]);
  }
});

test('selecting recovery clears tickets while even the weakest recovery gradually relieves high fatigue', () => {
  const { state, player, policy } = fixture('hard', 1, 1);
  const before = structuredClone(policy);
  const rest = e.policyForMode(policy, 'rest');
  assert.deepEqual(policy, before);
  assert.equal(e.ticketsUsed(rest), 0);
  assert.ok(e.validPolicy(rest));
  player.fatigue = 100;
  player.forcedRest = true;
  state.calendar.events = e.calendar(2027).events;
  const result = e.advanceWeek(state, rest, player.stance);
  close(result.report.fatigue.training, 0);
  close(result.report.fatigue.game, 0);
  const expected = 100 * (1 - (1 - .68 ** (1 / 7)) * .75) ** 7;
  close(result.report.fatigue.recovered, 100 - expected);
  close(e.getPlayer(result).fatigue, expected);
  assert.equal(e.getPlayer(result).forcedRest, false);
  assertConservation(result);
});

test('off-season does not report training load or hide a nonexistent fatigue peak', () => {
  const { state, player, policy } = fixture();
  state.date = '2027-12-20';
  const result = e.advanceWeek(state, policy, player.stance);
  close(result.report.fatigue.training, 0); close(result.report.fatigue.game, 0);
  close(result.report.fatigue.recovered, 0); close(result.report.fatigue.peak, 0);
  assertConservation(result);
});

test('four consecutive training weeks accumulate one tenth of the previous baseline without filling fatigue', () => {
  for (const [mode, expected] of [['light', 3.8], ['normal', 9.2], ['hard', 16.46]]) {
    const { state, player, policy } = fixture(mode);
    let result = state;
    for (let week = 0; week < 4; week++) {
      result = e.advanceWeek(result, policy, player.stance);
      assertConservation(result);
    }
    close(e.getPlayer(result).fatigue, expected);
    assert.equal(e.getPlayer(result).forcedRest, false);
  }
  close(e.params['fatigue.ticket_cost'], .3);
  close(e.params['fatigue.field_game'], 1);
  close(e.params['fatigue.pitch_out'], .1);
  close(e.params['fatigue.no_out_cost'], .025);
  close(e.params['fatigue.recovery_policy'], 1 - .68 ** (1 / 7));
});

test('the same game produces one tenth of the old player fatigue without changing its records', () => {
  const original = e.createGame('fatigue-game-scale', '피로검증', 'SP');
  const current = structuredClone(original), previous = structuredClone(original);
  const currentGame = current.calendar.events[0], previousGame = previous.calendar.events[0];
  const play = (state, game) => e.simulateGame(state, game, [game.homeTeamId, game.awayTeamId].map(teamId => state.players.filter(p => p.teamId === teamId)));
  play(current, currentGame);
  const keys = ['fatigue.field_game', 'fatigue.pitch_out', 'fatigue.no_out_cost'];
  const saved = keys.map(key => e.params[key]);
  try {
    keys.forEach((key, i) => { e.params[key] = [10, 1, .25][i]; });
    play(previous, previousGame);
  } finally {
    keys.forEach((key, i) => { e.params[key] = saved[i]; });
  }
  assert.equal(currentGame.status, 'completed');
  assert.deepEqual(currentGame.boxScore, previousGame.boxScore);
  assert.deepEqual(currentGame.score, previousGame.score);
  assert.ok(current.players.some(p => p.fatigue > 0));
  current.players.forEach((p, i) => close(p.fatigue, previous.players[i].fatigue / 10));
});

test('recovery remembers the training type and allocation through repeated selections and cancellation', () => {
  for (const mode of ['light', 'normal', 'hard']) {
    const { policy } = fixture(mode);
    const original = structuredClone(policy);
    const rest = e.policyForMode(policy, 'rest');
    assert.equal(e.ticketsUsed(rest), 0);
    assert.deepEqual(rest.previousTraining, original);
    assert.deepEqual(e.policyForMode(rest, 'rest'), rest);
    assert.deepEqual(e.policyForMode(structuredClone(rest), mode), original);
    rest.previousTraining.tickets.contact = 0;
    assert.deepEqual(policy, original);
  }
});

test('recovery stays selected across weeks until the player explicitly restores the saved setup', () => {
  const { state, player, policy } = fixture('hard');
  player.fatigue = 40;
  const original = structuredClone(state);
  const rest = e.policyForMode(policy, 'rest');
  const recovered = e.advanceWeek(state, rest, player.stance);
  assert.equal(recovered.report.fatigue.training, 0);
  assert.equal(recovered.report.fatigue.game, 0);
  close(e.getPlayer(recovered).fatigue, 40 * .68);
  assert.deepEqual(e.getPlayer(recovered).stats, player.stats);
  assert.deepEqual(e.getPlayer(recovered).trainingPolicy, rest);
  assert.ok(!recovered.report.messages.some(message => message.includes('자동 복귀')));
  assert.deepEqual(state, original);
  const stillResting = e.advanceWeek(recovered, e.getPlayer(recovered).trainingPolicy, player.stance);
  assert.equal(stillResting.report.fatigue.training, 0);
  assert.equal(stillResting.report.fatigue.game, 0);
  assert.deepEqual(e.getPlayer(stillResting).stats, player.stats);
  assert.deepEqual(e.getPlayer(stillResting).trainingPolicy, rest);
  close(e.getPlayer(stillResting).fatigue, 40 * .68 ** 2);
  const restored = e.policyForMode(e.getPlayer(stillResting).trainingPolicy, rest.previousTraining.mode);
  assert.deepEqual(restored, policy);
  const next = e.advanceWeek(stillResting, restored, player.stance);
  assert.ok(next.report.fatigue.training > 0);
  assert.ok(e.getPlayer(next).stats.power > player.stats.power);
  assert.deepEqual(e.getPlayer(next).trainingPolicy, policy);
  const edited = structuredClone(policy);
  edited.tickets.power = 2;
  edited.tickets.physical = 1;
  assert.deepEqual(e.policyForMode(edited, 'rest').previousTraining, edited);
});

test('recovery without a saved valid plan stays in recovery', () => {
  const { state, player, policy } = fixture('rest');
  assert.equal(e.getPlayer(e.advanceWeek(state, policy, player.stance)).trainingPolicy.mode, 'rest');
  policy.previousTraining = { mode: 'hard', tickets: { ...policy.tickets, power: 99 } };
  assert.equal(e.getPlayer(e.advanceWeek(state, policy, player.stance)).trainingPolicy.mode, 'rest');
});
