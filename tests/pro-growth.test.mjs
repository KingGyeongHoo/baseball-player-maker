import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  e = require("../.test-build/lib/sim/engine.js"),
  g = require("../.test-build/lib/sim/pro-growth.js");
const events = require("../.test-build/lib/sim/event-system.js");
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function player(physical = 50, position = "SS") {
  const p = e.previewPlayer("prime-" + physical + position, "전성기", position);
  p.careerMode = "pro";
  p.age = 20;
  for (const k of Object.keys(p.stats)) p.stats[k] = physical;
  p.initialStats = { ...p.stats };
  p.professional = {
    employment: "active",
    agedYear: 2027,
    agingOffset: 2,
    peak: { ...p.stats },
  };
  g.initializeAgingProfile(p);
  return p;
}
test("physical quality brings the prime forward and delays decline, with a fixed profile that consumes no randomness", () => {
  for (const [physical, start, end] of [
    [50, 28, 32],
    [60, 27, 33],
    [75, 26, 34],
    [90, 25, 35],
  ]) {
    const p = player(physical);
    assert.equal(g.agingProfile(p).peakStart, start);
    assert.equal(g.agingProfile(p).declineStart, end);
    const profile = structuredClone(g.agingProfile(p));
    for (const k of Object.keys(p.stats)) p.stats[k] = 100;
    g.initializeAgingProfile(p);
    assert.deepEqual(g.agingProfile(p), profile);
  }
  const p = player(75, "SP");
  p.professional.peak.power = p.professional.peak.speed = 1;
  delete p.professional.agingProfile;
  assert.equal(g.agingProfile(p).declineStart, 34);
});
test("physical growth is fast in the twenties, slows during the prime and aging starts only at its end", () => {
  const p = player();
  p.age = 20;
  close(g.ageEfficiency(p, "power"), 1.5);
  p.age = 27;
  close(g.ageEfficiency(p, "power"), 1.1);
  for (const age of [28, 29, 30, 31]) {
    p.age = age;
    assert.ok(g.ageEfficiency(p, "power") <= 0.3);
    const before = { ...p.stats };
    g.applyAging(p, 2028 + age);
    assert.deepEqual(p.stats, before);
  }
  p.age = 32;
  const before = { ...p.stats };
  g.applyAging(p, 2060);
  close(before.speed - p.stats.speed, 0.15);
  close(before.power - p.stats.power, 0.1);
  close(before.contact - p.stats.contact, 0);
  const strong = player(90);
  strong.age = 34;
  const old = { ...strong.stats };
  g.applyAging(strong, 2061);
  assert.deepEqual(strong.stats, old);
  strong.age = 35;
  g.applyAging(strong, 2062);
  assert.ok(strong.stats.speed < old.speed);
});
test("normal training and event growth cannot erase physical aging while technical training can still improve", () => {
  const p = player();
  p.age = 32;
  g.applyAging(p, 2028);
  const before = { ...p.stats };
  for (const k of Object.keys(p.trainingPolicy.tickets))
    p.trainingPolicy.tickets[k] = 5;
  for (let day = 0; day < 200; day++) e.train(p, 1);
  for (const k of ["power", "speed", "velocity", "arm", "stamina", "recovery"])
    close(p.stats[k], before[k]);
  assert.ok(p.stats.contact > before.contact);
  assert.equal(events.eventTrainingReward(p, "power", 12), 0);
  assert.equal(events.eventAwakeningReward(p, "power", 12), 0);
  const snapshot = structuredClone(p);
  assert.deepEqual(g.applyAging(p, 2028), {});
  assert.deepEqual(p, snapshot);
});
test("a multi-year trained career peaks before physical decline and never rerolls the prime or goes below one", () => {
  const p = player(),
    profile = structuredClone(g.agingProfile(p));
  let previous = 0;
  for (let age = 20; age <= 42; age++) {
    p.age = age;
    g.applyAging(p, 2000 + age);
    for (let day = 0; day < 200; day++) e.train(p, 1);
    if (age > 20 && age < 32) assert.ok(p.stats.speed >= previous);
    if (age >= 32) assert.ok(p.stats.speed < previous);
    previous = p.stats.speed;
    assert.equal(p.professional.agingProfile.peakStart, profile.peakStart);
    assert.equal(
      p.professional.agingProfile.declineStart,
      profile.declineStart,
    );
  }
  p.stats.speed = 1;
  p.age = 90;
  g.applyAging(p, 2100);
  assert.equal(p.stats.speed, 1);
});
test("developmental and free-agent discounts affect gains once and do not soften aging losses", () => {
  const p = player(),
    normal = structuredClone(p);
  p.proContract = { status: "developmental" };
  p.professional.employment = "freeAgent";
  e.train(p, 1);
  e.train(normal, 1);
  for (const k of Object.keys(p.stats))
    close(p.stats[k] - 50, (normal.stats[k] - 50) * 0.9 * 0.6);
  p.age = normal.age = 35;
  const a = g.applyAging(p, 2028),
    b = g.applyAging(normal, 2028);
  assert.deepEqual(a, b);
});
test("viewing a legacy profile is pure and non-pro training retains its original growth", () => {
  const p = player();
  delete p.professional.agingProfile;
  const snapshot = structuredClone(p);
  g.agingProfile(p);
  g.ageEfficiency(p, "power");
  assert.deepEqual(p, snapshot);
  delete p.careerMode;
  p.age = 45;
  assert.equal(g.ageEfficiency(p, "power"), 1);
  assert.equal(g.limitPhysicalGrowth(p, "power", 90), 90);
});
test("saves preserve the prime and accumulated physical losses; legacy imports add a profile without aging twice", () => {
  const pc = require("../.test-build/lib/sim/pro-career.js"),
    save = require("../.test-build/lib/career-save.js");
  const s = pc.acknowledgeCareer(
      pc.createProfessionalDemo("prime-save", "전성기저장", "SS"),
    ),
    p = e.getPlayer(s);
  p.age = g.agingProfile(p).declineStart;
  p.professional.agedYear = 2027;
  g.applyAging(p, 2028);
  const stats = { ...p.stats },
    profile = structuredClone(p.professional.agingProfile);
  const loaded = save.decodeCareerSave(
      JSON.stringify(save.encodeCareerSave(s)),
    ).state,
    q = e.getPlayer(loaded);
  assert.deepEqual(q.professional.agingProfile, profile);
  assert.deepEqual(q.stats, stats);
  assert.deepEqual(g.applyAging(q, 2028), {});
  delete p.professional.agingProfile;
  const legacy = save.decodeCareerSave(
    JSON.stringify(save.encodeCareerSave(s)),
  ).state;
  assert.deepEqual(e.getPlayer(legacy).stats, stats);
  assert.equal(e.getPlayer(legacy).professional.agedYear, 2028);
  const invalid = structuredClone(loaded);
  e.getPlayer(invalid).professional.agingProfile.loss.speed = -1;
  assert.throws(() => save.validateCareerState(invalid), /노화/);
});
