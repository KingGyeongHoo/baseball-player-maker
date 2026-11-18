import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const e = require("../.test-build/lib/sim/engine.js");
const pc = require("../.test-build/lib/sim/pro-career.js");
const a = require("../.test-build/lib/sim/pro-assessment.js");
const m = require("../.test-build/lib/sim/pro-market.js");
const life = require("../.test-build/lib/sim/pro-season.js");
const save = require("../.test-build/lib/career-save.js");
e.params["pro_events.enabled"] = 0;
e.params["events.focus_chance"] = 0;
const template = pc.acknowledgeCareer(
  pc.createProfessionalDemo("assessment-contracts", "누적평가", "SS"),
);
function fixture() {
  const s = structuredClone(template),
    p = e.getPlayer(s);
  p.teamId = 10;
  p.proContract.status = "regular";
  p.fatigue = 0;
  p.recentZ = 0;
  delete p.professional.managedUntil;
  return s;
}
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function season(
  s,
  year,
  score = 70,
  { lower = false, ability = score, injured = false, firstGames = 0 } = {},
) {
  const p = e.getPlayer(s);
  s.calendar.seasonYear = year;
  s.proWorld.year = year;
  s.proWorld.seasonClosed = false;
  s.date = `${year}-10-31`;
  p.teamId = lower ? 20 : 10;
  p.fatigue = 0;
  p.recentZ = 0;
  for (const k of Object.keys(p.stats)) p.stats[k] = ability;
  // Ability and score can differ through the same fatigue adjustment as actual play.
  p.fatigue = (ability - score) / e.params["coach.fatigue_penalty"];
  p.professional.assessmentUsage = {
    year,
    activeDays: 200,
    lowerDays: lower ? 200 : 0,
    upperDays: lower ? 0 : 200,
  };
  p.seasonByLevel = { first: e.emptyRecord(), second: e.emptyRecord() };
  p.seasonByLevel.first.games = { batting: firstGames };
  p.seasonByLevel.first.batting.PA = firstGames;
  if (injured)
    p.evaluationAvailability = {
      year,
      days: 200,
      availableDays: 0,
      injuredDays: 200,
    };
  else delete p.evaluationAvailability;
  // Contract/exit policy fixtures retain historical point ratings. New WAR
  // calculation and cumulative integration are exercised in pro-war.test.mjs.
  const row = a.recordSeasonAssessment(s, p);
  delete row.war; delete row.seasonEvaluation;
  row.score = injured ? null : score;
  row.grade = require("../.test-build/lib/roster-grades.js").rosterGrade(row.score, true);
  const values = p.professional.assessments.flatMap(r => r.score === null ? [] : [r.score]);
  row.cumulative = values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
  row.cumulativeGrade = require("../.test-build/lib/roster-grades.js").rosterGrade(row.cumulative, true);
  return row;
}
test("season evaluations freeze once, average all valid years equally and survive save/load without touching live state", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  season(s, 2028, 71);
  season(s, 2029, 79);
  const row = season(s, 2030, 75);
  close(row.score, 75);
  close(row.cumulative, 75);
  assert.equal(row.cumulativeGrade, "C");
  const frozen = structuredClone(p.professional.assessments);
  p.stats.contact = 100;
  p.fatigue = 90;
  assert.equal(a.recordSeasonAssessment(s, p), row);
  assert.deepEqual(p.professional.assessments, frozen);
  const decoded = save.decodeCareerSave(
    JSON.stringify(save.encodeCareerSave(s)),
  );
  assert.deepEqual(e.getPlayer(decoded.state).professional.assessments, frozen);
});
test("a fully unavailable injury season has no zero rating, does not dilute the average and does not create a refusal", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  season(s, 2028, 71);
  season(s, 2029, 73);
  const row = season(s, 2030, 10, { injured: true });
  assert.equal(row.score, null);
  assert.equal(row.grade, "—");
  close(row.cumulative, 72);
  close(a.assessmentValue(p, 2030).score, 72);
  assert.equal(a.seasonExit(p, 2030), null);
});
test("salary responds to this year and cumulative ratings with 70/30 weights, respects the rookie floor and restrained upper curve", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  season(s, 2028, 60);
  season(s, 2029, 80);
  close(a.assessmentValue(p, 2029).score, 77);
  close(m.salaryQuote(p, 2029), 225_000_000);
  const improved = structuredClone(p);
  improved.professional.assessments[0].score = 80;
  assert.ok(m.salaryQuote(improved, 2029) > m.salaryQuote(p, 2029));
  const currentDown = structuredClone(p);
  currentDown.professional.assessments[1].score = 70;
  assert.ok(m.salaryQuote(currentDown, 2029) < m.salaryQuote(p, 2029));
  assert.equal(a.salaryUnits(0), 1);
  assert.equal(a.salaryUnits(100), 20);
  assert.equal(a.salaryUnits(110), 20);
  for (let score = 1; score <= 100; score++)
    assert.ok(a.salaryUnits(score) >= a.salaryUnits(score - 1));
  const signed = structuredClone(p.professional.contract);
  m.salaryQuote(p, 2029);
  assert.deepEqual(p.professional.contract, signed);
  p.proContract.status = "developmental";
  assert.equal(m.salaryQuote(p, 2029), 30_000_000);
});
test("a sustained cumulative F triggers release for player and NPCs, preserve year pay and future guarantees, and never release twice", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  p.age=34;p.professional.rookieYear=2020;
  for (const year of [2028, 2029]) {
    season(s, year, 65, { lower: true });
    assert.equal(a.seasonExit(p, year), null);
  }
  const contract = p.professional.contract;
  contract.endYear = 2032;
  contract.salary = 50_000_000;
  season(s, 2030, 65, { lower: true });
  assert.equal(a.seasonExit(p, 2030).kind, "post-rookie-evaluation");
  const npc = s.players.find(
    (q) => q.id !== p.id && q.professional.employment === "active",
  );
  npc.age=34;npc.professional.rookieYear=2020;
  npc.professional.assessments = structuredClone(p.professional.assessments);
  npc.teamId = 20;
  npc.professional.contract.endYear = 2032;
  life.closeProfessionalSeason(s);
  assert.equal(p.professional.employment, "freeAgent");
  assert.equal(npc.professional.employment, "freeAgent");
  const notices=[s.careerNotice,...s.noticeQueue??[]];
  const index=notices.findIndex(n=>n?.stoveReport);
  assert.ok(index>=0);
  const report=notices[index].stoveReport;
  assert.equal(report.club,contract.club);
  assert.ok(report.moves.every(row=>row.club===contract.club));
  assert.ok(report.moves.some(row=>row.id===p.id&&row.direction==='released'));
  assert.equal(notices[index+1].title,'방출되었습니다');
  assert.equal(p.teamId, -1);
  assert.equal(p.professional.assessments.length, 3);
  assert.ok(p.professional.salaries.some((r) => r.year === 2030));
  assert.deepEqual(
    p.professional.guarantees.map((r) => r.year),
    [2031, 2032],
  );
  const debt = structuredClone(s.proWorld.clubs.map((c) => c.deadMoney));
  m.applySeasonExitPolicies(s);
  assert.deepEqual(
    s.proWorld.clubs.map((c) => c.deadMoney),
    debt,
  );
});
test("veteran retirement takes precedence over a qualifying release streak", () => {
  const s=fixture(),p=e.getPlayer(s);
  p.age=40;p.professional.rookieYear=2020;
  for(const year of [2028,2029,2030])season(s,year,65,{lower:true});
  assert.ok(a.seasonExit(p,2030));
  life.closeProfessionalSeason(s);
  assert.equal(p.professional.employment,'retired');
  assert.equal(p.professional.movements.at(-1).kind,'은퇴');
  assert.ok(!p.professional.movements.some(row=>row.kind==='방출'));
});
test("reserve metadata records real upper-team play without causing automatic release", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  season(s, 2028, 80, { lower: true });
  season(s, 2029, 80, { lower: true });
  s.calendar.seasonYear = 2030;
  s.date = "2030-10-31";
  p.teamId = 10;
  p.professional.assessmentUsage = {
    year: 2030,
    activeDays: 200,
    lowerDays: 199,
    upperDays: 1,
  };
  a.recordSeasonAssessment(s, p);
  assert.equal(a.seasonExit(p, 2030), null);
  p.professional.assessments.pop();
  p.professional.assessmentUsage = {
    year: 2030,
    activeDays: 200,
    lowerDays: 170,
    upperDays: 30,
  };
  p.seasonByLevel.second.batting.PA = 25;
  assert.equal(a.recordSeasonAssessment(s, p).reserveSeason, false);
  assert.equal(a.seasonExit(p, 2030), null);
});
test("daily squad evidence is counted once per date and reset by year", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  p.teamId = 20;
  a.recordAssessmentDay(s, p);
  a.recordAssessmentDay(s, p);
  assert.equal(p.professional.assessmentUsage.activeDays, 1);
  assert.equal(p.professional.assessmentUsage.lowerDays, 1);
  s.date = e.addDays(s.date, 1);
  p.teamId = 10;
  a.recordAssessmentDay(s, p);
  assert.equal(p.professional.assessmentUsage.upperDays, 1);
  s.calendar.seasonYear++;
  s.date = `${s.calendar.seasonYear}-03-01`;
  a.recordAssessmentDay(s, p);
  assert.equal(p.professional.assessmentUsage.activeDays, 1);
});
test("low first-team appearances never release a player with a healthy cumulative grade", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  p.age = 35;
  for (const year of [2028, 2029]) {
    season(s, year, 80, { firstGames: 20 });
    assert.equal(a.seasonExit(p, year), null);
  }
  const row = season(s, 2030, 80, { firstGames: 20 });
  row.firstTeam = true;
  assert.equal(a.seasonExit(p, 2030), null);
  p.professional.assessments.pop();
  season(s, 2030, 80, { firstGames: 21 });
  assert.equal(a.seasonExit(p, 2030), null);
  season(s, 2031, 80, { firstGames: 20 });
  season(s, 2032, 80, { firstGames: 20 });
  assert.equal(a.seasonExit(p, 2032), null);
});
test("limited appearances cannot release veterans or young players with strong cumulative grades", () => {
  for (const [age, count, growth] of [
    [34, 3, 0],
    [28, 4, 0],
    [23, 5, 0.6],
  ]) {
    const s = fixture(),
      p = e.getPlayer(s);
    p.age = age;
    for (let i = 0; i < count; i++) {
      season(s, 2028 + i, 80, { ability: 80 + growth * i, firstGames: 20 });
      assert.equal(a.seasonExit(p, 2028 + i), null);
    }
    assert.equal(a.seasonExit(p, 2027 + count), null);
  }
});
test("rookie grace excludes the first three years from the F streak, which then needs 3-5 review seasons", () => {
  for (const [age, count, growth] of [
    [34, 3, 0],
    [28, 4, 0],
    [23, 5, 0.6],
  ]) {
    const s = fixture(),
      p = e.getPlayer(s);
    p.age = age;
    for (let i = 0; i < 3; i++) {
      season(s, 2028 + i, 65, { firstGames: 21 });
      assert.equal(a.renewalAssessment(p, 2028 + i).score, null);
      assert.equal(a.seasonExit(p, 2028 + i), null);
    }
    for (let i = 0; i < count; i++) {
      season(s, 2031 + i, 65, { ability: 65 + growth * i, firstGames: 21 });
      assert.equal(a.renewalAssessment(p, 2031 + i).grade, "F");
      assert.equal(!!a.seasonExit(p, 2031 + i), i === count - 1);
    }
    assert.equal(a.seasonExit(p, 2030 + count).kind, "post-rookie-evaluation");
    close(a.assessmentValue(p, 2030 + count).cumulative,65);
  }
});
test("recent season grades control release regardless of a stronger career cumulative grade",()=>{
 const state=fixture(),p=e.getPlayer(state);p.age=35;
 for(const year of [2028,2029,2030])season(state,year,100,{firstGames:0,lower:true});
 for(const year of [2031,2032]){season(state,year,65,{firstGames:0,lower:true});assert.equal(a.seasonExit(p,year),null);}
 season(state,2033,65,{firstGames:0,lower:true});assert.ok(a.assessmentValue(p,2033).cumulative>73);assert.equal(a.seasonExit(p,2033).kind,'post-rookie-evaluation');
});

test("FFFFF releases at five years while FFEFF resets at E and needs a new full streak",()=>{
 const state=fixture(),p=e.getPlayer(state);p.age=23;p.professional.rookieYear=2020;
 for(let i=0;i<5;i++){season(state,2028+i,65,{ability:71+i*.6,firstGames:0,lower:true});assert.equal(!!a.seasonExit(p,2028+i),i===4);}
 assert.match(a.seasonExit(p,2032).reason,/시즌 평가 F/);
 const reset=fixture(),q=e.getPlayer(reset);q.age=35;q.professional.rookieYear=2020;
 for(const [i,score] of [65,65,71,65,65].entries()){season(reset,2028+i,score,{ability:80,firstGames:0,lower:true});assert.equal(a.seasonExit(q,2028+i),null);}
 season(reset,2033,65,{ability:80});assert.equal(a.seasonExit(q,2033).kind,'post-rookie-evaluation');
});

test("consecutive E season grades never trigger the F-only release policy",()=>{
 const state=fixture(),p=e.getPlayer(state);p.age=35;p.professional.rookieYear=2020;
 for(let year=2028;year<=2035;year++){season(state,year,71,{firstGames:0,lower:true});assert.equal(a.seasonExit(p,year),null);}
});

test("old FFF seasons cannot release a player whose recent three seasons are CCC",()=>{
 const state=fixture(),p=e.getPlayer(state);p.age=35;p.professional.rookieYear=2020;
 for(const [i,score] of [60,60,60,77,77,77].entries())season(state,2028+i,score,{ability:80,firstGames:0,lower:true});
 assert.ok(a.assessmentValue(p,2033).cumulative<71);assert.equal(a.seasonExit(p,2033),null);
});

test("injured years defer season-grade review, missing years reset it, and appearance counters are irrelevant",()=>{
 const state=fixture(),p=e.getPlayer(state);p.age=35;p.professional.rookieYear=2020;
 season(state,2028,65);season(state,2029,65,{injured:true});season(state,2030,65);assert.equal(a.seasonExit(p,2030),null);
 season(state,2031,65);assert.equal(a.seasonExit(p,2031).kind,'post-rookie-evaluation');
 const gap=fixture(),q=e.getPlayer(gap);q.age=35;q.professional.rookieYear=2020;
 season(gap,2028,65);season(gap,2030,65);season(gap,2031,65);assert.equal(a.seasonExit(q,2031),null);
 season(gap,2032,65).firstGames=null;assert.equal(a.seasonExit(q,2032).kind,'post-rookie-evaluation');
});

test("release offers can only be one-year developmental reentry at another club, depend on age/skill/need, and cannot bypass registration", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  p.age=28;p.professional.rookieYear=2020;
  for (const y of [2027,2028,2029,2030]) season(s,y,65,{lower:true});
  s.proWorld.seasonClosed = true;
  m.applySeasonExitPolicies(s);
  for (const club of s.proWorld.clubs) club.budget = 1e12;
  // Leave real roster members available while making recruitment capacity deterministic.
  for (let club = 0; club < 10; club++)
    for (const q of s.players
      .filter((q) => q.id !== p.id && q.teamId >= 10 && q.teamId % 10 === club)
      .slice(0, 10)) {
      q.teamId = -1;
      q.professional.employment = "freeAgent";
      q.professional.contract = null;
    }
  const denied = p.professional.nonRenewal.club;
  assert.equal(m.offerFor(s, p, denied, 2031, "released"), null);
  const offers = s.proWorld.clubs.flatMap(
    (c) => m.offerFor(s, p, c.id, 2031, "released") ?? [],
  );
  assert.ok(offers.length > 0);
  const offer = offers[0];
  assert.equal(offer.registration, "developmental");
  assert.equal(offer.years, 1);
  assert.equal(offer.salary, 30_000_000);
  assert.throws(
    () => m.signContract(s, p, { ...offer, registration: undefined }),
    /신고 계약/,
  );
  m.signContract(s, p, offer);
  assert.equal(p.proContract.status, "developmental");
  assert.equal(p.teamId, offer.club + 30);
  assert.equal(p.professional.developmentalRetry.deadlineYear, 2031);
  const older = structuredClone(p);
  older.age = 33;
  assert.equal(
    m.offerFor(s, older, (offer.club + 1) % 10, 2031, "released"),
    null,
  );
});
test("a developmental retry deadline alone never releases a player whose cumulative grade is above F", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  season(s, 2028, 80, { lower: true });
  season(s, 2029, 80, { lower: true });
  season(s, 2030, 80, { lower: true });
  p.professional.developmentalRetry = {
    year: 2031,
    deadlineYear: 2031,
    club: 1,
  };
  p.proContract.status = "developmental";
  season(s, 2031, 80, { lower: true });
  assert.equal(a.seasonExit(p,2031),null);
  p.professional.assessments.pop();
  p.proContract.status = "regular";
  assert.equal(season(s, 2031, 74, { lower: true }).reserveSeason, false);
  assert.equal(a.seasonExit(p, 2031), null);
  season(s, 2032, 74, { lower: true });
  assert.equal(a.seasonExit(p, 2032), null);
});
test("legacy saves reconstruct completed seasons only, prefer captured year-end scores, reprice unsigned offers and preserve signed terms", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  season(s, 2028, 79);
  life.closeProfessionalSeason(s);
  m.openContractMarket(s);
  const signed = structuredClone(p.professional.contract);
  s.proWorld.market.offers[0].salary = 9e9;
  delete p.professional.assessments;
  delete s.proWorld.contractRulesVersion;
  const decoded = save.decodeCareerSave(
      JSON.stringify(save.encodeCareerSave(s)),
    ).state,
    q = e.getPlayer(decoded);
  assert.equal(q.professional.assessments.length, 1);
  assert.equal(q.professional.assessments[0].source, "reconstructed");
  const frozen = structuredClone(q.professional.assessments);
  const upgraded = life.upgradeProfessionalState(decoded);
  assert.equal(upgraded.proWorld.contractRulesVersion, 5);
  assert.deepEqual(e.getPlayer(upgraded).professional.contract, signed);
  assert.deepEqual(e.getPlayer(upgraded).professional.assessments, frozen);
  assert.ok(upgraded.proWorld.market.offers.every((o) => o.salary < 1.1e9));
  assert.equal(life.upgradeProfessionalState(upgraded), upgraded);
  const corrupt = structuredClone(upgraded);
  e.getPlayer(corrupt).professional.assessments.push(
    e.getPlayer(corrupt).professional.assessments[0],
  );
  assert.throws(() => save.validateCareerState(corrupt), /출전평가/);
  const rookie = fixture();
  delete e.getPlayer(rookie).professional.assessments;
  a.hydrateAssessments(rookie, e.getPlayer(rookie));
  assert.deepEqual(e.getPlayer(rookie).professional.assessments, []);
});
test("older cumulative-E refusal flags are removed and no longer require developmental registration", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  season(s, 2028, 60);
  p.professional.nonRenewal = {
    year: 2028,
    kind: "low-evaluation",
    reason: "이전 E 기준",
    club: 0,
  };
  s.proWorld.contractRulesVersion = 1;
  assert.equal(a.requiresDevelopmentalOffer(p, 2028), false);
  const upgraded = life.upgradeProfessionalState(s);
  assert.equal(e.getPlayer(upgraded).professional.nonRenewal, undefined);
  assert.equal(upgraded.proWorld.contractRulesVersion, 5);
});
test("first-team games count actual completed appearances, count two-way play once, and exclude postseason, farm, forfeits and registration", () => {
  const s = fixture(),
    p = e.getPlayer(s),
    record = e.emptyRecord();
  record.batting.PA = 3;
  record.pitching.BF = 4;
  record.games = { batting: 1, pitching: 1 };
  const game = (id, competitionId = "pro-first", status = "completed") => ({
    id,
    date: "2028-04-01",
    competitionId,
    status,
    boxScore: { [p.id]: structuredClone(record) },
  });
  s.calendar.events = [
    game("a"),
    game("a"),
    game("b"),
    game("farm", "pro-second"),
    game("post", "pro-playoffs-final"),
    game("void", "pro-first", "forfeit"),
    game("live", "pro-first", "inProgress"),
    game("future", "pro-first", "scheduled"),
  ];
  p.seasonByLevel.first = structuredClone(record);
  p.seasonByLevel.first.batting.PA = 6;
  p.seasonByLevel.first.pitching.BF = 8;
  p.seasonByLevel.first.games = { batting: 2, pitching: 2 };
  assert.equal(a.firstTeamAppearances(s).get(p.id).games, 2);
  const row = a.recordSeasonAssessment(s, p);
  assert.equal(row.firstGames, 2);
  p.teamId = 0;
  p.professional.registration.days = 150;
  assert.equal(a.recordSeasonAssessment(s, p).firstGames, 2);
  assert.equal(
    save
      .decodeCareerSave(JSON.stringify(save.encodeCareerSave(s)))
      .state.players.find((q) => q.id === p.id).professional.assessments[0]
      .firstGames,
    2,
  );
});
test("legacy appearance totals are recovered only when known; unknown two-way overlap never becomes zero games", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  season(s, 2028, 80, { firstGames: 21 });
  life.closeProfessionalSeason(s);
  p.professional.assessments[0].firstGames = undefined;
  a.hydrateAssessments(s, p);
  assert.equal(p.professional.assessments[0].firstGames, 21);
  p.professional.assessments[0].firstGames = undefined;
  const archived = p.career.find(
    (row) => row.year === 2028 && row.careerMode === "pro",
  );
  archived.byLevel.first.pitching.BF = 20;
  archived.byLevel.first.games.pitching = 10;
  a.hydrateAssessments(s, p);
  assert.equal(p.professional.assessments[0].firstGames, null);
  const corrupt = structuredClone(s);
  e.getPlayer(corrupt).professional.assessments[0].firstGames = -1;
  assert.throws(() => save.validateCareerState(corrupt), /출전평가/);
});
test("successful developmental reentry starts a fresh review period without erasing the lifetime rating history", () => {
  const s = fixture(),
    p = e.getPlayer(s);
  p.age = 34;p.professional.rookieYear=2020;
  for (const year of [2028, 2029, 2030])
    season(s, year, 65, { firstGames: 20 });
  s.proWorld.seasonClosed = true;
  m.applySeasonExitPolicies(s);
  assert.equal(p.professional.nonRenewal.kind, "post-rookie-evaluation");
  p.professional.employment = "active";
  p.professional.developmentalRetry = {
    year: 2031,
    deadlineYear: 2031,
    club: 1,
  };
  p.proContract.status = "regular";
  season(s, 2031, 65, { firstGames: 0 });
  assert.equal(a.seasonExit(p, 2031), null);
  assert.equal(a.requiresDevelopmentalOffer(p, 2031), false);
  season(s, 2032, 65, { firstGames: 0 });
  season(s, 2033, 65, { firstGames: 0 });
  assert.equal(a.seasonExit(p, 2033), null);
  season(s, 2034, 65, { firstGames: 0 });
  assert.equal(a.seasonExit(p, 2034).kind, "post-rookie-evaluation");
  assert.equal(p.professional.assessments.length, 7);
});
test("an incomplete game archive cannot reduce a known appearance total below the release threshold", () => {
  const s = fixture(),
    p = e.getPlayer(s),
    record = e.emptyRecord();
  record.batting.PA = 1;
  record.games = { batting: 1 };
  s.calendar.events = [
    {
      id: "only-surviving-game",
      date: "2028-04-01",
      competitionId: "pro-first",
      status: "completed",
      boxScore: { [p.id]: record },
    },
  ];
  p.seasonByLevel.first = structuredClone(record);
  p.seasonByLevel.first.games.batting = 21;
  assert.equal(a.recordSeasonAssessment(s, p).firstGames, 21);
});
test("compact contract history keeps five requested columns without mutating ratings", () => {
  const { createElement } = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const ProAssessments =
    require("../.test-build/app/components/pro-assessments.js").default;
  const s = fixture(),
    p = e.getPlayer(s);
  for (const year of [2028, 2029, 2030])
    season(s, year, 100, { firstGames: 21 });
  for (const year of [2031, 2032, 2033])
    season(s, year, 71, { firstGames: 21 });
  const before = structuredClone(p.professional.assessments),
    html = renderToStaticMarkup(createElement(ProAssessments, { state: s }));
  assert.match(html, /<th>시즌<\/th><th>팀명<\/th><th>시즌평가<\/th><th>점수<\/th><th>연봉<\/th><th>최종 등록<\/th>/);
  assert.doesNotMatch(html, /올해 예상 누적 평가/);
  assert.doesNotMatch(html, /1군 출전경기|최초 3시즌 제외|기준 연봉/);
  assert.ok(html.includes('누적 평가'));assert.ok(html.includes('미평가'));
  assert.doesNotMatch(html, /<td>71\.0<\/td>/);
  assert.deepEqual(p.professional.assessments, before);
});


function joinFreshClub(s,club=1,year=2030,kind='fa'){
 const p=e.getPlayer(s);s.players=[p];for(const c of s.proWorld.clubs)c.budget=1e12;
 m.signContract(s,p,{id:`fresh:${club}:${year}`,club,year,years:1,salary:50_000_000,role:'경쟁',kind,negotiated:false,final:true,competition:[]});
 return p;
}
test('club changes retain evaluation history and low appearances never bypass the F requirement',()=>{
 for(const lower of [false,true]){
  const s=fixture(),p=e.getPlayer(s);p.age=34;p.professional.rookieYear=2020;
  for(const year of [2028,2029])season(s,year,80,{lower,firstGames:20});
  const history=structuredClone(p.professional.assessments);joinFreshClub(s);
  for(const year of [2030,2031]){season(s,year,80,{lower,firstGames:20});p.teamId=lower?21:11;assert.equal(a.seasonExit(p,year),null);}
  assert.deepEqual(p.professional.assessments.slice(0,2),history);
  const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state,q=e.getPlayer(restored);
  assert.equal(a.seasonExit(q,2031),null);assert.equal(a.renewalAssessment(q,2031).seasons,2);
  season(s,2032,80,{lower,firstGames:20});p.teamId=lower?21:11;
  assert.equal(a.seasonExit(p,2032),null);assert.equal(p.professional.assessments.length,5);
 }
});
test('renewal refusal uses only the new club cumulative evaluation while salary and career averages retain all seasons',()=>{
 const s=fixture(),p=e.getPlayer(s);p.age=34;p.professional.rookieYear=2020;
 for(const year of [2028,2029])season(s,year,65,{firstGames:40});
 const past=structuredClone(p.professional.assessments);joinFreshClub(s);season(s,2030,80,{firstGames:40});p.teamId=11;
 assert.equal(a.renewalAssessment(p,2030).score,80);assert.equal(a.renewalAssessment(p,2030).seasons,1);assert.equal(a.seasonExit(p,2030),null);
 close(a.assessmentValue(p,2030).cumulative,70);close(p.professional.assessments.at(-1).cumulative,70);assert.deepEqual(p.professional.assessments.slice(0,2),past);
});
test('low evaluation years accumulate afresh after a transfer and eventually trigger a new refusal',()=>{
 const s=fixture(),p=e.getPlayer(s);p.age=34;p.professional.rookieYear=2020;
 for(const year of [2028,2029])season(s,year,65,{firstGames:40});joinFreshClub(s);
 for(const year of [2030,2031,2032]){season(s,year,65,{firstGames:40});p.teamId=11;assert.equal(a.seasonExit(p,year)?.kind??null,year===2032?'post-rookie-evaluation':null);}
});
test('same-club renewals and FA retention cannot reset refusal streaks; returning after another club starts a new stint',()=>{
 for(const kind of ['renewal','fa']){
  const s=fixture(),p=e.getPlayer(s);p.age=34;p.professional.rookieYear=2020;for(const year of [2028,2029])season(s,year,65,{firstGames:20});
  joinFreshClub(s,p.professional.contract.club,2030,kind);season(s,2030,65,{firstGames:20});assert.equal(a.seasonExit(p,2030).kind,'post-rookie-evaluation');assert.equal(p.professional.service.length,1);
 }
 const s=fixture(),p=e.getPlayer(s),originalClub=p.professional.contract.club;p.professional.rookieYear=2020;
 for(const year of [2028,2029])season(s,year,65,{firstGames:40});joinFreshClub(s,1,2030);
 for(const year of [2030,2031]){season(s,year,71,{firstGames:40});p.teamId=11;}
 joinFreshClub(s,originalClub,2032);season(s,2032,80,{firstGames:40});assert.equal(a.renewalAssessment(p,2032).score,80);assert.equal(a.renewalAssessment(p,2032).seasons,1);assert.equal(p.professional.assessments.length,5);
});
