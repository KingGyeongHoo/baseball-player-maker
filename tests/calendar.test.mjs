import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const c = require('../.test-build/lib/sim/calendar.js');
const e = require('../.test-build/lib/sim/engine.js');

function playCalendar(year, seed) {
  const calendar = c.buildCalendar(year);
  const appearances = new Map();
  for (let date = `${year}-03-01`; date <= `${year}-08-31`; date = e.addDays(date, 1)) {
    c.prepareCompetitions(calendar, date, seed);
    const games = calendar.events.filter(g => g.date === date);
    const ids = games.flatMap(g => [g.homeTeamId, g.awayTeamId]);
    assert.equal(new Set(ids).size, ids.length, `no double header ${date}`);
    for (const game of games) {
      assert.ok(game.homeTeamId !== game.awayTeamId);
      game.status = 'completed';
      game.score = [2, 1];
      if (calendar.competitions.find(comp => comp.id === game.competitionId).kind === 'tournament') game.advancingTeamId = game.homeTeamId;
      appearances.set(game.id, [game.homeTeamId, game.awayTeamId]);
    }
    c.finishCompetitionDay(calendar, date);
  }
  return { calendar, appearances };
}

test('2026 reference preserves official windows for the five national tournaments', () => {
  const calendar = c.buildCalendar(2026);
  assert.deepEqual(calendar.competitions.filter(c => c.kind === 'tournament').map(c => [c.id, c.startDate.slice(5), c.endDate.slice(5)]), [
    ['emart', '03-25', '04-12'], ['gold', '05-02', '05-16'], ['blue', '06-27', '07-11'], ['president', '07-18', '07-30'], ['phoenix', '08-07', '08-27'],
  ]);
  assert.equal(calendar.referenceYear, 2026);
  assert.match(calendar.sourceUrl, /^https:\/\/g1.sports.or.kr/);
});

test('every future season finishes all brackets, respects windows, eliminates losers, and never double-books teams', () => {
  for (const year of [2027, 2028, 2029]) {
    const { calendar } = playCalendar(year, 'calendar-season');
    assert.ok(calendar.events.every(g => g.status === 'completed'));
    for (const competition of calendar.competitions) {
      const games = calendar.events.filter(g => g.competitionId === competition.id);
      assert.ok(games.every(g => g.date >= competition.startDate && g.date <= competition.endDate));
      if (competition.kind === 'league') {
        assert.equal(games.length, 450);
        for (const teamId of competition.participantTeamIds) assert.equal(games.filter(g => [g.homeTeamId, g.awayTeamId].includes(teamId)).length, 9);
        assert.ok(games.every(g => [0, 6].includes(new Date(g.date + 'T00:00:00Z').getUTCDay())));
      } else {
        assert.ok(competition.participantTeamIds.includes(competition.championTeamId));
        assert.equal(games.length, competition.participantTeamIds.length - 1);
        for (const game of games) {
          const loser = game.advancingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
          assert.ok(!games.some(g => g.round > game.round && [g.homeTeamId, g.awayTeamId].includes(loser)));
        }
      }
    }
    const golden = calendar.competitions.find(c => c.id === 'gold'), blue = calendar.competitions.find(c => c.id === 'blue');
    assert.equal(golden.participantTeamIds.length, 60);
    assert.equal(blue.participantTeamIds.length, 50);
    assert.equal(new Set([...golden.participantTeamIds, ...blue.participantTeamIds]).size, 100);
    assert.equal(calendar.competitions.find(c => c.id === 'president').participantTeamIds.length, 40);
  }
});

test('bracket draws are reproducible, change with seed and do not initialize twice', () => {
  const a = c.buildCalendar(2027), b = c.buildCalendar(2027), other = c.buildCalendar(2027);
  for (const [calendar, seed] of [[a, 'same'], [b, 'same'], [other, 'different']]) c.prepareCompetitions(calendar, '2027-03-25', seed);
  assert.deepEqual(a, b);
  const before = structuredClone(a);
  c.prepareCompetitions(a, '2027-03-25', 'same');
  assert.deepEqual(a, before);
  assert.notDeepEqual(a.events.filter(g => g.competitionId === 'emart'), other.events.filter(g => g.competitionId === 'emart'));
});

test('byes advance once and a forfeit winner can advance without manufactured personal records', () => {
  const calendar = c.buildCalendar(2027);
  c.prepareCompetitions(calendar, '2027-03-25', 'byes');
  const competition = calendar.competitions.find(c => c.id === 'emart');
  assert.equal(competition.byes.length, 28);
  const byes = [...competition.byes];
  for (const game of calendar.events.filter(g => g.competitionId === 'emart')) {
    game.status = 'forfeit'; game.forfeitTeamId = game.awayTeamId; game.advancingTeamId = game.homeTeamId;
  }
  c.finishCompetitionDay(calendar, '2027-03-25');
  const next = calendar.events.filter(g => g.competitionId === 'emart' && g.round === 2);
  assert.equal(next.length, 32);
  for (const team of byes) assert.equal(next.filter(g => [g.homeTeamId, g.awayTeamId].includes(team)).length, 1);
  assert.ok(next.every(g => Object.keys(g.boxScore).length === 0));
});

test('league standings count wins, draws, forfeits and provide deterministic tie breaks', () => {
  const calendar = c.buildCalendar(2027);
  const g = calendar.events.find(g => g.competitionId === 'spring');
  g.status = 'forfeit'; g.forfeitTeamId = g.awayTeamId;
  const table = c.leagueTable(calendar, 'spring', Math.floor(g.homeTeamId / 10));
  assert.equal(table[0].teamId, g.homeTeamId);
  assert.equal(table[0].points, 2);
  assert.equal(table.at(-1).teamId, g.awayTeamId);
});
