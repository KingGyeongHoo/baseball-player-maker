import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) return next(resolve('.test-build', specifier.slice(2) + '.js'), context);
  return next(specifier, context);
} });
const e = require('../.test-build/lib/sim/engine.js');
const { createRandomCareer, fieldPositions, pitchingPositions, kindForPosition } = require('../.test-build/lib/player-creation.js');
const Picker = require('../.test-build/app/components/position-picker.js').default;
const Setup = require('../.test-build/app/components/player-setup.js').default;
const sharp = require('sharp');

function entropy(team, seed) { return { getRandomValues(array) { array[0] = team; return array; }, randomUUID() { return seed; } }; }
const picker = (kind, value, mode='school') => renderToStaticMarkup(createElement(Picker, { kind, value, mode, disabled: false, onChange() {}, onKindChange() {} }));

test('initial creation asks only for name, type and position without revealing a school or ability', () => {
  const html = renderToStaticMarkup(createElement(Setup, { onStart() { assert.fail('SSR must not generate a player'); } }));
  assert.ok(html.includes('선수 이름')); assert.ok(html.includes('어떤 선수로 시작할까요?'));
  assert.ok(html.indexOf('투구 손')<html.indexOf('타격 손'));assert.ok(html.indexOf('value="pitcher"')<html.indexOf('value="batter"'));assert.ok(html.indexOf('타격 손')<html.indexOf('value="pitcher"'));
  assert.ok(html.includes('먼저 타자 또는 투수를 선택해 주세요.'));
  for (const forbidden of ['커리어 시드', 'MY-FIRST-SEASON', '능력 재추첨', '서울중앙고', 'PLAYER PROFILE', '<select']) assert.ok(!html.includes(forbidden), forbidden);
  assert.match(html, /type="submit"[^>]*disabled/);
});

test('batter field contains all eight fielders and a separate designated hitter, with no pitchers', () => {
  const html = picker('batter', 'SS');
  for (const position of ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']) assert.ok(html.includes(`value="${position}"`), position);
  for (const position of ['SP', 'RP', 'CP']) assert.ok(!html.includes(`value="${position}"`));
  assert.equal((html.match(/type="radio"/g) || []).length, 11);
  assert.ok(html.includes('selection-ballpark'));
  const p = Object.fromEntries(fieldPositions.map(p => [p.id, p]));
  assert.ok(p.C.y > p['1B'].y && p.C.x === 50);
  assert.ok(p['1B'].x > 50 && p['3B'].x < 50);
  assert.ok(p['2B'].x > 50 && p['2B'].y < p['1B'].y);
  assert.ok(p.SS.x < 50 && p.SS.y < p['3B'].y);
  assert.ok(p.LF.x < p.CF.x && p.CF.x < p.RF.x);
  assert.ok([p.LF, p.CF, p.RF].every(p => p.y < 40));
});

test('school and pro selection both retain starter, middle relief and closer roles', async () => {
  const school=picker('pitcher','RP');
  assert.equal((school.match(/type="radio"/g)||[]).length,5);for(const pos of ['SP','RP','CP'])assert.ok(school.includes(`value="${pos}"`));assert.ok(school.includes('>중간계투</b>'));assert.ok(school.includes('>마무리</b>'));assert.ok(!school.includes('>불펜</b>'));
  const html = picker('pitcher', 'SP','pro');
  assert.equal((html.match(/type="radio"/g) || []).length, 5);
  assert.ok(!html.includes('selection-ballpark'));
  for (const pose of pitchingPositions) {
    assert.ok(html.includes(`value="${pose.id}"`)); assert.ok(html.includes(pose.pose));
    const metadata = await sharp('public' + pose.image).metadata();
    assert.equal(metadata.hasAlpha, true); assert.ok(metadata.width > 500 && metadata.height > 500);
    assert.equal(kindForPosition(pose.id), 'pitcher');
  }
  for (const p of fieldPositions) assert.equal(kindForPosition(p.id), 'batter');
});

test('random assignment replaces the chosen school freshman slot and preserves the 3,000-player world', () => {
  for (const [team, position] of [[0, 'C'], [37, 'SS'], [99, 'SP']]) {
    const state = createRandomCareer('  새선수  ', position, entropy(team, `new-${team}`));
    const player = e.getPlayer(state);
    assert.equal(player.teamId, team); assert.equal(player.position, position); assert.equal(player.name, '새선수'); assert.equal(player.grade, 1);
    assert.equal(state.players.length, 3000); assert.equal(state.players.filter(p => p.teamId === team).length, 30);
    assert.equal(state.players.filter(p => p.teamId === team && p.grade === 1).length, 10);
    assert.equal(player.primaryRole, e.roleFor(position));
    const advanced = e.advanceWeek(state, player.trainingPolicy, player.stance);
    assert.equal(e.getPlayer(advanced).teamId, team); assert.equal(advanced.week, 2);
  }
});

test('fresh entropy creates different abilities for repeated starts with the same name and role', () => {
  const first = createRandomCareer('같은이름', 'SS', entropy(24, 'random-first'));
  const second = createRandomCareer('같은이름', 'SS', entropy(24, 'random-second'));
  assert.notEqual(first.seed, second.seed);
  assert.notDeepEqual(e.getPlayer(first).stats, e.getPlayer(second).stats);
  assert.deepEqual(e.getPlayer(first).talentExposure, { batting: 0, pitching: 0 });
});

test('school sampling rejects biased overflow and validates the required user choices', () => {
  let draws = 0;
  const source = { getRandomValues(array) { array[0] = ++draws === 1 ? 0xffffffff : 199; return array; }, randomUUID() { return 'overflow'; } };
  const state = createRandomCareer('테스트', 'RP', source);
  assert.equal(draws, 2); assert.equal(e.getPlayer(state).teamId, 99);
  assert.throws(() => createRandomCareer('   ', 'SP', source), /이름/);
  assert.throws(() => createRandomCareer('테스트', 'unknown', source), /포지션/);
  for (const team of [-1, 100, .5]) assert.throws(() => e.createGame('invalid', '테스트', 'SP', team), /학교/);
});

test('throwing and batting hands are independent choices, persist into pro careers and saves, and do not reroll skills',()=>{
  const {createRandomProCareer}=require('../.test-build/lib/player-creation.js'),{handednessLabel}=require('../.test-build/lib/player-handedness.js'),storage=require('../.test-build/lib/career-save.js');
  const baseline=createRandomCareer('손선택','SS',entropy(2,'hands-test')),before=e.getPlayer(baseline);
  for(const throwing of ['R','L'])for(const batting of ['R','L']){
    const state=createRandomCareer('손선택','SS',entropy(2,'hands-test'),undefined,{throws:throwing,bats:batting}),p=e.getPlayer(state);
    assert.equal(p.throws,throwing);assert.equal(p.bats,batting);assert.deepEqual(p.stats,before.stats);assert.deepEqual(p.talent,before.talent);assert.deepEqual(state.rngStates,baseline.rngStates);
    const restored=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(state))).state;assert.equal(e.getPlayer(restored).throws,throwing);assert.equal(e.getPlayer(restored).bats,batting);
  }
  const pro=createRandomProCareer('왼손선수','SP',17,entropy(2,'pro-hands'),{throws:'L',bats:'R'});assert.equal(handednessLabel(e.getPlayer(pro)),'좌투우타');assert.equal(handednessLabel({}),'우투우타');
  const html=renderToStaticMarkup(createElement(Setup,{onStart(){}}));for(const label of ['투구 손','타격 손','우투','좌투','우타','좌타'])assert.ok(html.includes(label),label);
  const invalid=structuredClone(baseline);e.getPlayer(invalid).throws='both';assert.throws(()=>storage.encodeCareerSave(invalid),/투구·타격/);
});
