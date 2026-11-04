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
  if (mode === 'rest') for (const key of Object.keys(policy.tickets)) policy.tickets[key] = 0;
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

test('normal training generates 25 fatigue even when weekend recovery leaves zero', () => {
  const { state, player, policy } = fixture();
  const result = e.advanceWeek(state, policy, player.stance);
  const fatigue = result.report.fatigue;
  close(fatigue.training, 25); close(fatigue.game, 0); close(fatigue.recovered, 25);
  close(fatigue.peak, 9); close(e.getPlayer(result).fatigue, 0);
  assert.equal(fatigue.days.length, 7);
  assert.deepEqual(fatigue.days.map(day => day.training), [5, 5, 5, 5, 5, 0, 0]);
  assert.ok(fatigue.days.slice(0, 5).every(day => day.peak > 0));
  assertConservation(result);
});

test('weak stamina and recovery leave measurable fatigue after hard training', () => {
  const { state, player, policy } = fixture('hard', 1, 1);
  const forecast = e.fatigueForecast(player, policy);
  const result = e.advanceWeek(state, policy, player.stance);
  close(result.report.fatigue.training, 40.625); close(result.report.fatigue.recovered, 27);
  close(e.getPlayer(result).fatigue, 13.625);
  close(forecast.end, 13.625); close(forecast.peak, result.report.fatigue.peak);
  assertConservation(result);
});

test('forecast distinguishes total training load, available recovery and actual final fatigue', () => {
  const { state, player, policy } = fixture();
  const forecast = e.fatigueForecast(player, policy);
  close(forecast.weeklyTraining, 25); close(forecast.dailyRecovery, 4); close(forecast.recoveryCapacity, 36);
  close(forecast.peak, 9); close(forecast.end, 0);
  const result = e.advanceWeek(state, policy, player.stance);
  close(forecast.end, e.getPlayer(result).fatigue);
  close(result.report.fatigue.recovered, 25); // Unused recovery cannot create negative fatigue.
});

test('rest counts only recovered fatigue and never reports unused capacity as actual recovery', () => {
  const { state, player, policy } = fixture('rest');
  player.fatigue = 10;
  const forecast = e.fatigueForecast(player, policy);
  close(forecast.recoveryCapacity, 56);
  const result = e.advanceWeek(state, policy, player.stance);
  close(result.report.fatigue.training, 0); close(result.report.fatigue.game, 0);
  close(result.report.fatigue.recovered, 10); close(result.report.fatigue.peak, 10);
  close(e.getPlayer(result).fatigue, 0);
  assertConservation(result);
});

test('game fatigue is separate from training and both reconcile with the actual state', () => {
  const { state, player, policy } = fixture();
  state.date = state.calendar.events.find(game => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId).date;
  for (const key of ['contact', 'power', 'speed', 'defense']) player.stats[key] = 100;
  const result = e.advanceWeek(state, policy, player.stance);
  assert.ok(result.report.records.batting.PA > 0);
  assert.ok(result.report.fatigue.game > 0);
  assert.ok(result.report.fatigue.training > 0);
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
