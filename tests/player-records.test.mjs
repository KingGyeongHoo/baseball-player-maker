import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const { playerSeasons, totalRecords, recordRates, formatInnings } = require('../.test-build/lib/player-records.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

function record(ab, h, bb, outs, er) {
  const r = e.emptyRecord();
  Object.assign(r.batting, { PA: ab + bb, AB: ab, H: h, BB: bb, GB: ab - h });
  Object.assign(r.pitching, { BF: outs + h + bb, outs, H: h, BB: bb, R: er, ER: er });
  return r;
}

test('past and current seasons appear in calendar order without changing player data', () => {
  const player = { grade: 3, career: [{ year: 2028, grade: 2, records: record(20, 6, 1, 18, 2) }, { year: 2027, grade: 1, records: record(10, 2, 0, 6, 1) }], seasonStats: record(30, 9, 2, 27, 3) };
  const before = structuredClone(player);
  const rows = playerSeasons(player, 2029);
  assert.deepEqual(rows.map(r => [r.year, r.grade, r.current]), [[2027, 1, false], [2028, 2, false], [2029, 3, true]]);
  totalRecords(rows);
  assert.deepEqual(player, before);
});

test('career rates use cumulative denominators rather than averaging season rates', () => {
  const first = record(10, 5, 2, 17, 2), second = record(100, 20, 0, 1, 1);
  const rows = [{ year: 2027, grade: 1, current: false, records: first }, { year: 2028, grade: 2, current: true, records: second }];
  const total = totalRecords(rows), rates = recordRates(total);
  assert.equal(total.batting.AB, 110); assert.equal(total.batting.H, 25); assert.equal(total.batting.PA, 112);
  close(rates.average, 25 / 110); close(rates.obp, 27 / 112); close(rates.era, 4.5); close(rates.whip, 3 * 27 / 18);
  assert.notEqual(rates.average, (.5 + .2) / 2);
  close(rates.ops, rates.obp + rates.slugging);
});

test('zero appearances retain unassessed ratios and valid integer-out innings', () => {
  assert.ok(Object.values(recordRates(e.emptyRecord())).every(value => value === null));
  assert.equal(formatInnings(0), '0.0'); assert.equal(formatInnings(17), '5.2'); assert.equal(formatInnings(18), '6.0');
  const walks = e.emptyRecord(); walks.batting.PA = walks.batting.BB = 2;
  const rates = recordRates(walks); assert.equal(rates.obp, 1); assert.equal(rates.average, null); assert.equal(rates.slugging, null); assert.equal(rates.ops, null);
});

test('current season is counted once even if an archive entry for that year exists', () => {
  const player = { grade: 2, career: [{ year: 2028, grade: 2, records: record(10, 3, 0, 3, 1) }], seasonStats: record(20, 7, 1, 9, 2) };
  const rows = playerSeasons(player, 2028);
  assert.equal(rows.length, 1); assert.equal(totalRecords(rows).batting.H, 7);
});

test('pre-admission records are not fabricated for generated senior players', () => {
  const rows = playerSeasons({ grade: 3, career: [], seasonStats: e.emptyRecord() }, 2027);
  assert.equal(rows.length, 1); assert.equal(rows[0].year, 2027); assert.equal(rows[0].grade, 3);
});

test('actual yearly promotion preserves each season and exposes all three years', () => {
  let state = e.createGame('annual-records', '기록검증', 'SS');
  const first = record(10, 4, 2, 17, 2), second = record(20, 5, 1, 18, 3);
  e.getPlayer(state).seasonStats = structuredClone(first); state.date = '2027-12-27';
  const step = s => e.advanceWeek(s, e.getPlayer(s).trainingPolicy, e.getPlayer(s).stance);
  state = step(state);
  assert.deepEqual(e.getPlayer(state).career[0].records, first);
  assert.deepEqual(e.getPlayer(state).seasonStats, e.emptyRecord());
  e.getPlayer(state).seasonStats = structuredClone(second); state.date = '2028-12-25';
  state = step(step(state));
  const rows = playerSeasons(e.getPlayer(state), state.calendar.seasonYear);
  assert.deepEqual(rows.map(r => r.year), [2027, 2028, 2029]);
  assert.deepEqual(rows[0].records, first); assert.deepEqual(rows[1].records, second);
  assert.deepEqual(rows[2].records, e.emptyRecord());
  const total = totalRecords(rows); assert.equal(total.batting.H, 9); assert.equal(total.pitching.outs, 35);
});
