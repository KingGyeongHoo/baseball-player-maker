import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const pitching = ['velocity', 'control', 'movement'];
const batting = ['contact', 'power', 'speed', 'defense'];
const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;
const initialOvr = (p, pitch) => e.ovr({ ...p, stats: p.initialStats }, pitch);

test('combined OVR adds both disciplines, exceeds 100 for two-way players, and is role independent', () => {
  const template = e.previewPlayer('combined-ovr', '검증', 'SS');
  for (const [pitch, bat, expected] of [[10, 90, 100], [80, 15, 95], [75, 80, 155], [100, 100, 200]]) {
    const p = structuredClone(template);
    for (const key of pitching) p.stats[key] = pitch;
    for (const key of batting) p.stats[key] = bat;
    assert.equal(e.combinedOvr(p), expected);
    p.primaryRole = '선발';
    assert.equal(e.combinedOvr(p), expected);
    assert.equal(e.ovr(p), pitch);
    p.primaryRole = '코너 야수';
    assert.equal(e.ovr(p), bat);
  }
});

test('secondary generation preserves the main abilities, common stats, talent and global RNG stream', () => {
  const chance = e.params['generation.two_way_chance'];
  try {
    for (const position of ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP', 'CP']) {
      e.params['generation.two_way_chance'] = 0;
      const ordinary = e.previewPlayer('generation-isolation', '검증', position);
      e.params['generation.two_way_chance'] = 1;
      const exception = e.previewPlayer('generation-isolation', '검증', position);
      const main = e.isPitcher(ordinary.primaryRole) ? pitching : batting;
      const secondary = e.isPitcher(ordinary.primaryRole) ? batting : pitching;
      for (const key of [...main, 'stamina', 'recovery', 'arm', 'bq']) assert.equal(ordinary.stats[key], exception.stats[key], position + ':' + key);
      assert.deepEqual(ordinary.talent, exception.talent);
      assert.notDeepEqual(secondary.map(k => ordinary.stats[k]), secondary.map(k => exception.stats[k]));
      assert.deepEqual(ordinary.initialStats, ordinary.stats);
      assert.deepEqual(exception.initialStats, exception.stats);
    }
    e.params['generation.two_way_chance'] = 0;
    const ordinary = e.createGame('generation-stream-isolation', '검증', 'SP');
    e.params['generation.two_way_chance'] = 1;
    const exception = e.createGame('generation-stream-isolation', '검증', 'SP');
    assert.deepEqual(ordinary.rngStates, exception.rngStates);
    assert.deepEqual(ordinary.players.map(p => [p.id, p.name, p.talent]), exception.players.map(p => [p.id, p.name, p.talent]));
  } finally {
    e.params['generation.two_way_chance'] = chance;
  }
});

test('fresh generation keeps primary average near 40 and secondary average near 15 across player and NPC positions', () => {
  const groups = { pitcher: { main: [], secondary: [] }, batter: { main: [], secondary: [] } };
  for (let seed = 0; seed < 3; seed++) {
    const state = e.createGame('role-distribution-' + seed, '검증', seed % 2 ? 'SP' : 'SS');
    for (const p of state.players) {
      const pitch = e.isPitcher(p.primaryRole);
      const group = groups[pitch ? 'pitcher' : 'batter'];
      group.main.push(initialOvr(p, pitch));
      group.secondary.push(initialOvr(p, !pitch));
      assert.ok(Object.values(p.initialStats).every(n => n >= 1 && n <= 100));
      assert.ok(Number.isFinite(e.combinedOvr(p)) && e.combinedOvr(p) <= 200);
    }
    const me = e.getPlayer(state);
    assert.equal(state.history[0].ovr, e.overall(me));
    assert.equal(state.history[0].ovrScale,100);
    assert.deepEqual(me.initialStats, me.stats);
    assert.deepEqual(state, e.createGame('role-distribution-' + seed, '검증', seed % 2 ? 'SP' : 'SS'));
  }
  for (const [kind, group] of Object.entries(groups)) {
    assert.ok(Math.abs(mean(group.main) - e.params['generation.mean']) < 1, kind + ' primary mean ' + mean(group.main));
    assert.ok(Math.abs(mean(group.secondary) - 15) < 0.5, kind + ' secondary mean ' + mean(group.secondary));
    assert.ok(group.secondary.filter(n => n >= 30).length / group.secondary.length < 0.01, kind + ' exceptions stay rare');
  }
});

test('rare generation can create an above-average two-way player without capping the sum', () => {
  const chance = e.params['generation.two_way_chance'];
  try {
    e.params['generation.two_way_chance'] = 1;
    const players = Array.from({ length: 40 }, (_, i) => e.previewPlayer('two-way-potential-' + i, '검증', i % 2 ? 'SP' : 'SS'));
    assert.ok(players.some(p => e.ovr(p, true) > e.params['generation.mean'] && e.ovr(p, false) > e.params['generation.mean']));
    for (const p of players) assert.equal(e.combinedOvr(p), e.ovr(p, true) + e.ovr(p, false));
  } finally {
    e.params['generation.two_way_chance'] = chance;
  }
});

test('draft OVR ranking uses primary ratings and two-way averages on the same 100-point scale', () => {
  const template = e.previewPlayer('two-way-ranking', '검증', 'SS');
  const players = [[90, 10], [60, 60], [30, 75]].map(([pitch, bat], index) => {
    const p = structuredClone(template);
    p.id = 'ranking-' + index;
    p.grade = 3;
    if(index===0){p.primaryRole='선발';p.position='SP';}
    if(index===1)p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};
    for (const key of pitching) p.stats[key] = pitch;
    for (const key of batting) p.stats[key] = bat;
    return p;
  });
  assert.deepEqual(e.draftBoard(players).map(p => p.id), ['ranking-0', 'ranking-2', 'ranking-1']);
});
