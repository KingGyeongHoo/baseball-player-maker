import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-9);

test('training has a small baseline injury risk at zero fatigue and fatigue adds further risk', () => {
  close(e.injuryRisk(0, true), .0005);
  close(e.injuryRisk(0, false), 0);
  assert.ok(e.injuryRisk(60, true) > e.injuryRisk(60));
  assert.ok(e.injuryRisk(80, true) > e.injuryRisk(60, true));
  assert.ok(e.injuryRisk(100, true) < 1);
});

test('only actual training can cause baseline injuries, including when training adds no fatigue', () => {
  const risk = e.params['injury.training_base_risk'], cost = e.params['fatigue.ticket_cost'];
  try {
    e.params['injury.training_base_risk'] = 1;
    e.params['fatigue.ticket_cost'] = 0;
    for (const kind of ['training', 'recovery', 'offseason', 'zero-tickets']) {
      const state = e.createGame('training-injury', '훈련부상', 'SS');
      state.calendar.events = []; state.calendar.competitions = [];
      const player = e.getPlayer(state);
      let policy = player.trainingPolicy;
      if (kind === 'recovery') policy = e.policyForMode(policy, 'rest');
      if (kind === 'offseason') state.date = '2027-12-20';
      if (kind === 'zero-tickets') policy = { mode: 'normal', tickets: Object.fromEntries(Object.keys(policy.tickets).map(k=>[k,0])) };
      const before = structuredClone(state);
      const result = e.advanceWeek(state, policy, player.stance);
      assert.equal(e.getPlayer(result).fatigue, 0);
      assert.deepEqual(state, before);
      if (kind === 'training') {
        assert.equal(e.getPlayer(result).injury.startDate, state.date);
        assert.ok(result.report.messages.some(m=>m.includes('부상')));
      } else assert.equal(e.getPlayer(result).injury, null, kind);
    }
  } finally {
    e.params['injury.training_base_risk'] = risk;
    e.params['fatigue.ticket_cost'] = cost;
  }
});
