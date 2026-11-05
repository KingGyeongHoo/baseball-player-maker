import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AutoProgress, autoPauseReason, cancelPendingSimulation } = require('../.test-build/lib/auto-progress.js');
const e = require('../.test-build/lib/sim/engine.js');
// Keep scheduler integration independent of the separately tested focus event.
e.params['events.focus_chance']=0;

function clock() {
  let id = 0;
  const pending = new Map();
  const controller = new AutoProgress(500, (callback, delay) => {
    assert.equal(delay, 500);
    pending.set(++id, callback);
    return id;
  }, timer => pending.delete(timer));
  return { controller, pending, tick() {
    const entries = [...pending.entries()];
    pending.clear();
    for (const [, callback] of entries) callback();
  } };
}

const snapshot = () => ({ phase: 'weekStart', playerId: 'me', players: [{ id: 'me', roleOffer: null, injury: null, forcedRest: false }] });

test('automatic weeks stay sequential: one scheduled tick and no self-repeat while a week is running', () => {
  const { controller, pending, tick } = clock();
  let requests = 0;
  controller.schedule(() => requests++);
  assert.equal(pending.size, 0);
  controller.start();
  controller.schedule(() => requests++);
  controller.schedule(() => requests++);
  assert.equal(pending.size, 1);
  tick(); tick();
  assert.equal(requests, 1);
  controller.schedule(() => requests++); // The caller schedules after its worker commits.
  tick();
  assert.equal(requests, 2);
});

test('pause cancels the next week without discarding the current completed week', () => {
  const { controller, pending, tick } = clock();
  let commits = 0;
  controller.start();
  controller.schedule(() => commits++);
  tick();
  controller.schedule(() => commits++);
  controller.pause();
  assert.equal(pending.size, 0);
  tick();
  assert.equal(commits, 1);
  assert.equal(controller.active, false);
});

test('recovering a decision invalidates queued worker replies before terminating and clears the busy lock',()=>{
  let commits=0,terminated=0;const request={current:7},locked={current:true};
  const worker={current:{terminate(){terminated++;if(request.current===7&&locked.current)commits++;}}};
  const timer={current:setTimeout(()=>{commits++;},1000)};
  cancelPendingSimulation({worker,request,locked,timer});
  assert.equal(request.current,8);assert.equal(locked.current,false);assert.equal(worker.current,null);assert.equal(timer.current,null);assert.equal(terminated,1);assert.equal(commits,0);
  cancelPendingSimulation({worker,request,locked,timer});assert.equal(terminated,1);assert.equal(request.current,9);
});

test('stale callbacks cannot revive after pause and restart or clear the new pending tick', () => {
  const { controller, pending, tick } = clock();
  let requests = 0;
  controller.start();
  controller.schedule(() => requests += 100);
  const stale = [...pending.values()][0];
  controller.pause();
  controller.start();
  controller.schedule(() => requests++);
  stale();
  controller.schedule(() => requests += 10);
  assert.equal(pending.size, 1);
  tick();
  assert.equal(requests, 1);
});

test('effect cleanup cancels its closure and the next schedule uses the latest state', () => {
  const { controller, tick } = clock();
  let week;
  controller.start();
  controller.schedule(() => { week = 1; });
  controller.cancelScheduled();
  controller.schedule(() => { week = 2; });
  tick();
  assert.equal(week, 2);
  assert.equal(controller.active, true);
});

test('a new injury stops automation while an existing injury can continue through recovery', () => {
  const previous = snapshot(), next = structuredClone(previous);
  next.players[0].injury = { startDate: '2027-04-03' };
  assert.match(autoPauseReason(previous, next), /부상/);
  assert.equal(autoPauseReason(next, structuredClone(next)), null);
  const recovered = structuredClone(next); recovered.players[0].injury = null;
  assert.equal(autoPauseReason(next, recovered), null);
});

test('role offers, new forced rest and the draft stop automation', () => {
  const previous = snapshot();
  const offered = structuredClone(previous); offered.players[0].roleOffer = '선발';
  assert.match(autoPauseReason(previous, offered), /역할 제안/);
  const forced = structuredClone(previous); forced.players[0].forcedRest = true;
  assert.match(autoPauseReason(previous, forced), /강제 휴식/);
  assert.equal(autoPauseReason(forced, structuredClone(forced)), null);
  const ended = structuredClone(offered); ended.phase = 'ended';
  assert.match(autoPauseReason(previous, ended), /드래프트/);
});

test('automatic progress runs real weeks with the same policy and can resume after pausing', () => {
  let state = e.createGame('auto-integration', '자동진행', 'SS');
  const policy = structuredClone(e.getPlayer(state).trainingPolicy);
  const stance = { ...e.getPlayer(state).stance };
  const { controller, tick } = clock();
  function next() {
    const previous = state;
    state = e.advanceWeek(state, policy, stance);
    const reason = autoPauseReason(previous, state);
    if (reason) controller.pause();
  }
  controller.start();
  for (let i = 0; i < 3; i++) { controller.schedule(next); tick(); }
  assert.equal(state.week, 4);
  assert.deepEqual(e.getPlayer(state).trainingPolicy, policy);
  assert.deepEqual(e.getPlayer(state).stance, stance);
  controller.pause(); controller.schedule(next); tick();
  assert.equal(state.week, 4);
  controller.start(); controller.schedule(next); tick();
  assert.equal(state.week, 5);
});
