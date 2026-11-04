import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const { teamStrength, teamRankings } = require('../.test-build/lib/team-strength.js');
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
const game = e.createGame('team-power', '전력검증', 'SS');

test('team scores equal the exact starter 1 / reserve 0.5 weighted mean without mutating players', () => {
  const before = structuredClone(game.players);
  const t = teamStrength(game.players, 0);
  assert.equal(t.members.length, 30);
  assert.equal(t.starters, 15);
  assert.equal(new Set(t.members.filter(m => m.slot).map(m => m.player.id)).size, 15);
  assert.equal(t.totalWeight, 22.5);
  close(t.overall, t.members.reduce((sum,m) => sum+m.score*m.weight,0) / 22.5);
  assert.ok(t.members.every(m => m.slot ? m.weight === 1 : m.weight === .5));
  assert.deepEqual(game.players, before);
});

test('a starter ability increase contributes twice as much as a reserve increase when slots remain fixed', () => {
  const players = game.players.filter(p => p.teamId === 0).map(p => structuredClone(p));
  for (const [i,p] of players.entries()) for (const key of Object.keys(p.stats)) p.stats[key] = 40 + i / 2;
  const base = teamStrength(players, 0);
  const starter = base.members.find(m => m.weight === 1 && !m.pitching);
  const reserve = base.members.find(m => m.weight === .5 && !m.pitching);
  const improve = member => players.map(p => p.id === member.player.id ? { ...p, stats: Object.fromEntries(Object.entries(p.stats).map(([k,v]) => [k, v + .01])) } : p);
  const one = teamStrength(improve(starter), 0), half = teamStrength(improve(reserve), 0);
  assert.deepEqual(one.members.filter(m=>m.slot).map(m=>m.player.id).sort(), base.members.filter(m=>m.slot).map(m=>m.player.id).sort());
  assert.deepEqual(half.members.filter(m=>m.slot).map(m=>m.player.id).sort(), base.members.filter(m=>m.slot).map(m=>m.player.id).sort());
  close(one.overall-base.overall, 2*(half.overall-base.overall));
});

test('batting and defense exclude pure pitchers, pitching excludes pure hitters', () => {
  const players = structuredClone(game.players);
  const before = teamStrength(players, 0);
  for (const p of players.filter(p=>p.teamId === 0 && e.isPitcher(p.primaryRole))) {
    p.stats.contact = p.stats.power = p.stats.speed = p.stats.defense = p.stats.arm = p.stats.bq = 100;
    p.stats.velocity = p.stats.control = p.stats.movement = 100;
  }
  const after = teamStrength(players, 0);
  close(before.batting, after.batting);
  close(before.defense, after.defense);
  assert.ok(after.pitching > before.pitching);
});

test('rankings cover all teams, stay bounded, and update after roster ability changes', () => {
  const ranks = teamRankings(game);
  assert.equal(ranks.length, 100);
  assert.equal(new Set(ranks.map(t=>t.teamId)).size, 100);
  for (const t of ranks) for (const key of ['overall','batting','defense','pitching']) assert.ok(t[key] >= 1 && t[key] <= 100);
  assert.ok(ranks.every((t,i) => i === 0 || ranks[i-1].overall >= t.overall));
  const players = structuredClone(game.players);
  for (const p of players.filter(p=>p.teamId === 99)) for (const k of Object.keys(p.stats)) p.stats[k] = 100;
  const top = teamRankings({ teams: game.teams, players })[0];
  assert.equal(top.teamId, 99); close(top.overall,100);
});

test('unfilled slots and empty rosters produce finite scores and stable base strength during rest', () => {
  const empty = teamStrength([], 0);
  assert.equal(empty.overall, 0); assert.equal(empty.totalWeight, 0);
  const base = teamStrength(game.players, 0);
  const players = structuredClone(game.players);
  for (const p of players) { p.fatigue = 100; p.forcedRest = true; p.trainingPolicy = e.policyForMode(p.trainingPolicy,'rest'); }
  close(teamStrength(players, 0).overall, base.overall);
  assert.ok(Number.isFinite(teamStrength([players[0]],0).overall));
});
