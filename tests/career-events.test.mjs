import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const { createCareerEvent } = require('../.test-build/lib/sim/career-events.js');
const { autoPauseReason } = require('../.test-build/lib/auto-progress.js');
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
const fixture = (seed = 'career-events') => {
  const state = e.createGame(seed, '이벤트검증', 'SS');
  state.calendar.events = []; state.calendar.competitions = [];
  return state;
};

test('event choices fit hitter/pitcher roles and include ability, reputation and fatigue consequences', () => {
  const state = fixture(), p = e.getPlayer(state);
  assert.equal(createCareerEvent('coach',p,state.date,6).choices[0].stats.contact,.4);
  p.primaryRole = '선발';
  assert.equal(createCareerEvent('coach',p,state.date,6).choices[0].stats.control,.4);
  const condition = createCareerEvent('condition',p,state.date,6);
  assert.ok(condition.choices[0].fatigue < 0 && condition.choices[1].fatigue > 0);
  assert.equal(condition.choices[1].stats.velocity,.4);
  assert.equal(createCareerEvent('scout',p,state.date,6).choices[1].reputation,2);
});

test('events pause automation and block further weeks until answered, with deterministic independent event RNG', () => {
  const chance=e.params['events.weekly_chance'];
  try {
    e.params['events.weekly_chance']=1;
    const state=fixture(); state.week=6;
    const p=e.getPlayer(state);
    const next=e.advanceWeek(state,p.trainingPolicy,p.stance);
    assert.ok(next.careerEvent);
    assert.match(autoPauseReason(state,next),/이벤트/);
    assert.deepEqual(next,e.advanceWeek(state,p.trainingPolicy,p.stance));
    const snapshot=structuredClone(next);
    assert.throws(()=>e.advanceWeek(next,p.trainingPolicy,p.stance),/이벤트/);
    assert.deepEqual(next,snapshot);
    const answered=e.answerCareerEvent(next,next.careerEvent.choices[0].id);
    assert.equal(answered.careerEvent,null);
    const again=e.advanceWeek(answered,p.trainingPolicy,p.stance);
    assert.equal(again.careerEvent,null,'cooldown prevents another immediate event');
  } finally { e.params['events.weekly_chance']=chance; }
});

test('choice applies actual clamped effects once, records the outcome, and retains reputation bonus after recalculation/promotion', () => {
  const state=fixture(),p=e.getPlayer(state);
  for(const key of Object.keys(p.stats)) p.stats[key]=80;
  p.performanceReputation=55;
  p.reputation=70;
  state.careerEvent=createCareerEvent('coach',p,state.date,6);
  const snapshot=structuredClone(state),before=p.stats.contact;
  const next=e.answerCareerEvent(state,'precision'),after=e.getPlayer(next);
  close(after.stats.contact,before+.4); close(after.reputation,71.06); close(after.fatigue,1);
  assert.equal(after.reputationBonus,1);
  close(next.careerEventHistory[0].stats.contact,.4);
  assert.deepEqual(state,snapshot);
  assert.throws(()=>e.answerCareerEvent(next,'precision'),/없습니다/);
  assert.throws(()=>e.answerCareerEvent(state,'invalid'),/유효하지/);
  after.seasonStats.batting.PA=after.seasonStats.batting.AB=after.seasonStats.batting.H=1;
  next.date='2027-12-20';
  const assessed=e.advanceWeek(next,after.trainingPolicy,after.stance);
  close(e.getPlayer(assessed).reputation,69.06);
  assessed.date='2027-12-27';
  const promoted=e.advanceWeek(assessed,after.trainingPolicy,after.stance);
  close(e.getPlayer(promoted).reputation,69.06);
  assert.equal(e.getPlayer(promoted).reputationBonus,1);
});

test('outcomes report actual changes at ability/fatigue/reputation limits', () => {
  const state=fixture(),p=e.getPlayer(state);
  p.fatigue=1;
  state.careerEvent=createCareerEvent('condition',p,state.date,6);
  const recovered=e.answerCareerEvent(state,'recover');
  close(e.getPlayer(recovered).fatigue,0);
  close(recovered.careerEventHistory[0].fatigue,-1);
  for(const key of Object.keys(p.stats))p.stats[key]=100; p.performanceReputation=100; p.reputation=100;
  state.careerEvent=createCareerEvent('coach',p,state.date,7);
  const capped=e.answerCareerEvent(state,'precision');
  close(capped.careerEventHistory[0].stats.contact,0);
  close(capped.careerEventHistory[0].reputation,0);
});

test('recovery weeks and the initial cooldown do not generate career events', () => {
  const chance=e.params['events.weekly_chance'];
  try {
    e.params['events.weekly_chance']=1;
    let state=fixture('no-early-event'),p=e.getPlayer(state);
    assert.equal(e.advanceWeek(state,p.trainingPolicy,p.stance).careerEvent,null);
    state.week=6;
    const rest=e.policyForMode(p.trainingPolicy,'rest');
    assert.equal(e.advanceWeek(state,rest,p.stance).careerEvent,null);
  } finally { e.params['events.weekly_chance']=chance; }
});
