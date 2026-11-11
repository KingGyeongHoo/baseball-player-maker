import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const e = require("../.test-build/lib/sim/engine.js");
const pc = require("../.test-build/lib/sim/pro-career.js");
const war = require("../.test-build/lib/sim/pro-war.js");
const a = require("../.test-build/lib/sim/pro-assessment.js");
const market = require("../.test-build/lib/sim/pro-market.js");
const life = require("../.test-build/lib/sim/pro-season.js");
const save = require("../.test-build/lib/career-save.js");
const { careerContractSummary } = require("../.test-build/lib/career-summary.js");
const Assessments = require("../.test-build/app/components/pro-assessments.js").default;
const retired = require("../.test-build/lib/sim/retired-records.js");
const fielding = require("../.test-build/lib/sim/fielding.js");
e.params["pro_events.enabled"]=0;e.params["events.focus_chance"]=0;
const template = pc.acknowledgeCareer(pc.createProfessionalDemo("war-adjustment", "기여도", "SS"));
const close = (x, y) => assert.ok(Math.abs(x - y) < 1e-7, `${x} != ${y}`);

function batting(kind = "average", scale = 1) {
  const r = e.emptyRecord();
  const lines = {
    average: { PA: 600, AB: 540, H: 145, "2B": 28, "3B": 3, HR: 18, BB: 60, SO: 100 },
    good: { PA: 600, AB: 510, H: 180, "2B": 40, "3B": 5, HR: 40, BB: 90, SO: 70 },
    bad: { PA: 600, AB: 570, H: 100, "2B": 15, "3B": 1, HR: 5, BB: 30, SO: 160 },
  };
  for (const [key, n] of Object.entries(lines[kind])) r.batting[key] = n * scale;
  r.games = { batting: 140 * scale };
  return r;
}
function pitching(kind = "average", scale = 1) {
  const r = e.emptyRecord();
  const lines = {
    average: { BF: 750, outs: 540, H: 180, BB: 60, SO: 170, HR: 20, ER: 80 },
    good: { BF: 690, outs: 540, H: 120, BB: 30, SO: 240, HR: 10, ER: 40 },
    bad: { BF: 900, outs: 540, H: 250, BB: 100, SO: 100, HR: 35, ER: 130 },
  };
  for (const [key, n] of Object.entries(lines[kind])) r.pitching[key] = n * scale;
  r.games = { pitching: 30 * scale };
  return r;
}
function fixture(base = 75) {
  const s = structuredClone(template), p = e.getPlayer(s);
  p.professional.assessments = [];
  p.professional.employment = "active";
  p.proContract.status = "regular";
  p.teamId = 0; p.fatigue = 0; p.recentZ = 0;
  delete p.professional.managedUntil;
  for (const key of Object.keys(p.stats)) p.stats[key] = base;
  // Use a large, real-record league reference. No calendar or ability baseline
  // is needed by the contribution model.
  const peer = structuredClone(s.players.find(q => q.id !== p.id));
  peer.seasonByLevel = { first: batting("average", 30), second: batting("average", 15) };
  peer.seasonByLevel.first.pitching = pitching("average", 30).pitching;
  peer.seasonByLevel.second.pitching = pitching("average", 15).pitching;
  s.players = [p, peer];
  p.seasonByLevel = { first: e.emptyRecord(), second: e.emptyRecord() };
  return s;
}

test("equal selection scores produce different season grades and salaries from actual batting contribution without changing live selection", () => {
  const good = fixture(), bad = fixture(), p = e.getPlayer(good), q = e.getPlayer(bad);
  p.seasonByLevel.first = batting("good"); q.seasonByLevel.first = batting("bad");
  const before = structuredClone(p), rng = structuredClone(good.rngStates);
  const estimate = a.currentSeasonAssessment(good, p);
  assert.deepEqual(p, before); assert.deepEqual(good.rngStates, rng);
  const high = a.recordSeasonAssessment(good, p), low = a.recordSeasonAssessment(bad, q);
  assert.equal(e.selectionScore(p), e.selectionScore(q));
  assert.ok(high.score > 75 && low.score < 75);
  assert.ok(high.war.first.batting > low.war.first.batting);
  assert.notEqual(high.grade, low.grade);
  close(estimate.score, high.score);
  assert.ok(market.salaryQuote(p, good.calendar.seasonYear) > market.salaryQuote(q, bad.calendar.seasonYear));
  assert.deepEqual(p.stats, before.stats); assert.equal(p.fatigue, before.fatigue);
});

test("pitching uses strikeouts, walks, homers and earned runs; starter and relief workload scales are comparable", () => {
  const s = fixture(), p = e.getPlayer(s), context = war.createProWarContext(s);
  p.position = "SP"; p.primaryRole = "선발";
  p.seasonByLevel.first = pitching("good");
  const starter = war.proWarAssessment(p, context);
  p.position = "RP"; p.primaryRole = "중간계투";
  p.seasonByLevel.first = pitching("good", 1 / 3);
  const relief = war.proWarAssessment(p, context);
  close(relief.first.pitching * 3, starter.first.pitching);
  close(relief.score, starter.score);
  p.seasonByLevel.first = pitching("bad", 1 / 3);
  assert.ok(war.proWarAssessment(p, context).score < 71);
  p.seasonByLevel.first = e.emptyRecord();
  Object.assign(p.seasonByLevel.first.pitching, { BF: 4, HR: 2, BB: 2, ER: 4 });
  const noOut = war.proWarAssessment(p, context);
  assert.ok(noOut.first.pitching < 0 && noOut.score < 71);
});

test("WAR accumulates with real playing time and combines both halves of a two-way season", () => {
  const s = fixture(), p = e.getPlayer(s), context = war.createProWarContext(s);
  p.seasonByLevel.first = batting("good");
  const full = war.proWarAssessment(p, context);
  p.seasonByLevel.first = batting("good", 0.5);
  const half = war.proWarAssessment(p, context);
  close(full.first.batting, half.first.batting * 2);
  p.twoWay = { pitchingPosition: "SP", battingPosition: "SS", nextAssignment: "batting", reputationBonus: 0 };
  p.seasonByLevel.first.pitching = pitching("good", 0.5).pitching;
  const both = war.proWarAssessment(p, context);
  close(both.first.batting, half.first.batting);
  assert.ok(both.first.pitching > 0 && both.score > half.score);
});

test("tiny samples never project a full-season WAR and the converted score stays within 0–100", () => {
  const s = fixture(), p = e.getPlayer(s);
  p.seasonByLevel.first.batting.PA = 1; p.seasonByLevel.first.batting.AB = 1;
  p.seasonByLevel.first.batting.H = 1; p.seasonByLevel.first.batting.HR = 1;
  const small = a.currentSeasonAssessment(s, p);
  assert.ok(Math.abs(small.score - 71) < 1);
  assert.ok(small.war.first.batting < 1);
  for (const ability of [1, 60, 75, 90, 100]) {
    for (const key of Object.keys(p.stats)) p.stats[key] = ability;
    for (const kind of ["good", "bad"]) {
      p.seasonByLevel.first = batting(kind, 10);
      const score = war.proWarAssessment(p, war.createProWarContext(s)).score;
      assert.ok(score >= 0 && score <= 100);
    }
  }
});

test("farm contribution is separate, discounted and capped; a full first-team season is unaffected by farm padding", () => {
  const farm = fixture(70), major = fixture(70), p = e.getPlayer(farm), q = e.getPlayer(major);
  p.seasonByLevel.second = batting("good"); q.seasonByLevel.first = batting("good");
  const low = a.currentSeasonAssessment(farm, p), high = a.currentSeasonAssessment(major, q);
  assert.equal(low.war.first.batting, 0);
  assert.ok(low.score > 71 && low.score <= 75);
  assert.ok(high.score > low.score);
  p.seasonByLevel.first = batting("average");
  const context = war.createProWarContext(farm), before = war.proWarAssessment(p, context);
  p.seasonByLevel.second = batting("good", 10);
  close(war.proWarAssessment(p, context).score, before.score);
});

test("league references normalize the run environment, isolate both levels and ignore wins, RBI, postseason and old years", () => {
  const s = fixture(), p = e.getPlayer(s), peer = s.players[1];
  p.seasonByLevel.first = batting("average");
  const before = war.createProWarContext(s);
  const snapshot = structuredClone(s);
  assert.deepEqual(war.createProWarContext(s), before); assert.deepEqual(s, snapshot);
  p.seasonByLevel.first.batting.RBI = 99999; p.seasonByLevel.first.batting.R = 99999;
  p.seasonByLevel.first.games.wins = 144;
  p.seasonPostseason = batting("good", 100);
  p.career.push({ year: 2027, careerMode: "pro", byLevel: { first: batting("good", 100) } });
  s.calendar.events = [{ id: "exhibition", competitionId: "pro-allstar", status: "completed", boxScore: { [p.id]: batting("good", 100) } }];
  s.proWorld.retiredRecords = { "2027:first": batting("good", 100) };
  assert.deepEqual(war.createProWarContext(s), before);
  peer.seasonByLevel.second = batting("good", 100);
  const changed = war.createProWarContext(s);
  assert.deepEqual(changed.first, before.first); assert.notDeepEqual(changed.second, before.second);
  const standard = war.proWarAssessment(p, changed);
  peer.seasonByLevel.first = batting("good", 100);
  const tough = war.proWarAssessment(p, war.createProWarContext(s));
  assert.ok(tough.first.batting < standard.first.batting);
});

test("retiring an NPC preserves this year's league run environment without double-counting their records", () => {
  const s = fixture(), peer = s.players[1];
  const before = war.createProWarContext(s);
  peer.professional.employment = "retired";
  peer.professional.agedYear = s.calendar.seasonYear;
  assert.equal(retired.discardRetiredPlayers(s), true);
  assert.deepEqual(war.createProWarContext(s), before);
  assert.equal(retired.discardRetiredPlayers(s), false);
  assert.deepEqual(war.createProWarContext(s), before);
});

test("healthy unplayed and incomplete legacy records receive zero-WAR points, while full injury and free agency stay unrated", () => {
  const s = fixture(), p = e.getPlayer(s);
  assert.equal(a.currentSeasonAssessment(s, p).score, 71);
  p.seasonByLevel.first.batting.PA = 100;
  assert.equal(a.currentSeasonAssessment(s, p).score, 71);
  p.seasonByLevel.first = e.emptyRecord();
  p.evaluationAvailability = { year: s.calendar.seasonYear, days: 200, availableDays: 0, injuredDays: 200 };
  assert.equal(a.currentSeasonAssessment(s, p).score, null);
  const row = a.recordSeasonAssessment(s, p);
  assert.equal(row.score, null); assert.equal(row.war, undefined);
  delete p.evaluationAvailability; p.professional.employment = "freeAgent";
  assert.equal(a.currentSeasonAssessment(s, p).score, null);
});

test("the season projection, final evaluation, cumulative average and 70/30 contract basis agree and freeze once", () => {
  const s = fixture(), p = e.getPlayer(s), year = s.calendar.seasonYear;
  p.professional.assessments = [{ year: year - 1, date: `${year - 1}-10-31`, score: 73, grade: "D", cumulative: 73, cumulativeGrade: "D", ability: 75, role: p.primaryRole, squad: "first", developmental: false, reserveSeason: false, firstTeam: true, secondOnly: false, firstGames: 140, source: "season-end" }];
  p.seasonByLevel.first = batting("good");
  const projection = careerContractSummary(s);
  const estimate = a.currentSeasonAssessment(s, p), row = a.recordSeasonAssessment(s, p);
  close(projection.seasonScore, row.score); close(projection.projected, row.cumulative);
  close(row.score, estimate.score); close(row.cumulative, (73 + row.score) / 2);
  close(a.assessmentValue(p, year).score, row.score * 0.7 + row.cumulative * 0.3);
  const frozen = structuredClone(row);
  p.fatigue = 100; p.stats.contact = 100; p.seasonByLevel.first = batting("bad");
  assert.equal(a.recordSeasonAssessment(s, p), row); assert.deepEqual(row, frozen);
  const summary = careerContractSummary(s);
  close(summary.projected, frozen.cumulative); assert.deepEqual(summary.war, frozen.war);
});

test("season settlement applies identical WAR calibration to NPCs and the player with one shared league snapshot", () => {
  const s = fixture(), p = e.getPlayer(s), peer = s.players[1];
  peer.seasonByLevel = structuredClone(p.seasonByLevel);
  p.seasonByLevel.first = batting("good"); peer.seasonByLevel.first = batting("good");
  peer.professional.assessments = []; peer.professional.employment = "active";
  peer.fatigue = p.fatigue; peer.recentZ = p.recentZ; peer.stats = structuredClone(p.stats);
  peer.primaryRole = p.primaryRole; peer.position = p.position; peer.proContract = structuredClone(p.proContract);
  delete peer.professional.managedUntil;
  const expected = a.currentSeasonAssessment(s, p);
  life.closeProfessionalSeason(s);
  close(p.professional.assessments[0].score, expected.score);
  close(peer.professional.assessments[0].score, expected.score);
  assert.deepEqual(p.professional.assessments[0].war, peer.professional.assessments[0].war);
});

test("new WAR snapshots survive save/load, reject corrupt conversions and leave old assessments, contracts and pay unchanged", () => {
  const s = fixture(), p = e.getPlayer(s);
  p.seasonByLevel.first = batting("good");
  const row = a.recordSeasonAssessment(s, p), contract = structuredClone(p.professional.contract);
  const restored = save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
  assert.deepEqual(e.getPlayer(restored).professional.assessments[0], row);
  assert.deepEqual(e.getPlayer(restored).professional.contract, contract);
  const corrupt = structuredClone(s);
  e.getPlayer(corrupt).professional.assessments[0].war.score = 99;
  assert.throws(() => save.validateCareerState(corrupt), /WAR/);
  e.getPlayer(corrupt).professional.assessments[0].war = null;
  assert.throws(() => save.validateCareerState(corrupt), /WAR/);
  delete row.war;
  const old = structuredClone(row), salary = p.professional.contract.salary;
  a.hydrateAssessments(s, p);
  assert.deepEqual(a.recordSeasonAssessment(s, p), old);
  assert.equal(p.professional.contract.salary, salary);
  assert.deepEqual(e.getPlayer(save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state).professional.assessments[0], old);
});

test("the UI retains appearance grades and explains WAR conversion, defense and unavailable old records", () => {
  const s = fixture(), p = e.getPlayer(s);
  p.seasonByLevel.first = batting("good"); a.recordSeasonAssessment(s, p);
  const html = renderToStaticMarkup(createElement(Assessments, { state: s }));
  for (const label of ["출전평가", "올해 시즌 출전평가", "WAR 환산", "타격·투구·수비·포지션", "수비는 기록이 생긴 경기부터", "2군 수준"]) assert.ok(html.includes(label));
  assert.match(html, /<th>시즌<\/th><th>출전평가<\/th><th>점수<\/th><th>연봉<\/th><th>최종 등록<\/th>/);
});

test("WAR is the entire point rating: identical records stay identical when ability, fatigue, reputation or registration changes",()=>{
  const s=fixture(),p=e.getPlayer(s);p.seasonByLevel.first=batting("good");
  const context=war.createProWarContext(s),expected=war.proWarAssessment(p,context);
  for(const ability of [20,60,80,100]){
    for(const key of Object.keys(p.stats))p.stats[key]=ability;
    p.fatigue=100-ability;p.recentZ=ability/50-1;p.reputation=ability;
    p.proContract.status=ability<80?"developmental":"regular";
    assert.deepEqual(war.proWarAssessment(p,context),expected);
  }
  close(expected.score,Math.max(0,Math.min(100,71+2*expected.equivalentWins)));
  assert.equal(war.proWarRules.scoreAtZero+war.proWarRules.scorePerWin*1.5,74);
  assert.equal(war.proWarRules.scoreAtZero+war.proWarRules.scorePerWin*5.5,82);
});

test("fielding results and actual position innings affect WAR; missing old data and DH fielding never fabricate plays",()=>{
  const s=fixture(),p=e.getPlayer(s),context=war.createProWarContext(s);
  p.seasonByLevel.first=batting("average");const attack=war.proWarAssessment(p,context);
  p.seasonByLevel.first.fielding={version:1,chances:300,plays:220,expectedPlays:200,outs:{SS:3000}};
  const strong=war.proWarAssessment(p,context);
  assert.ok(strong.first.fielding>0&&strong.first.positional>0&&strong.score>attack.score);
  p.seasonByLevel.first.fielding.plays=180;
  const weak=war.proWarAssessment(p,context);assert.ok(weak.first.fielding<0&&weak.score<strong.score);
  p.seasonByLevel.first.fielding={version:1,chances:0,plays:0,expectedPlays:0,outs:{DH:3000}};
  const dh=war.proWarAssessment(p,context);assert.equal(dh.first.fielding,0);assert.ok(dh.first.positional<0);
  delete p.seasonByLevel.first.fielding;
  assert.deepEqual(war.proWarAssessment(p,context),attack);
  for(let n=0;n<100;n++)assert.ok(fielding.fieldingIndex(n)>=0&&fielding.fieldingIndex(n)<8);
});

test("fielding records merge across games and save/load without inventing missing historical innings",()=>{
  const s=fixture(),p=e.getPlayer(s),one=e.emptyRecord(),two=e.emptyRecord(),total=e.emptyRecord();
  one.fielding={version:1,chances:3,plays:2,expectedPlays:1.8,outs:{SS:27}};
  two.fielding={version:1,chances:4,plays:3,expectedPlays:2.5,outs:{CF:24}};
  e.mergeRecord(total,one);e.mergeRecord(total,two);e.mergeRecord(total,e.emptyRecord());
  assert.equal(total.fielding.chances,7);assert.equal(total.fielding.plays,5);close(total.fielding.expectedPlays,4.3);
  assert.deepEqual(total.fielding.outs,{SS:27,CF:24});assert.ok(fielding.validFieldingRecord(total.fielding));
  p.seasonByLevel.first=total;
  const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
  assert.deepEqual(e.getPlayer(restored).seasonByLevel.first.fielding,total.fielding);
});

test("completed pro games record exactly the observed non-HR balls in play and defensive outs, once and reproducibly",()=>{
  const s=structuredClone(template),game=s.calendar.events.find(g=>g.competitionId==="pro-first"),copy=structuredClone(s);
  const run=(state,g)=>{
    state.careerNotice=undefined;state.noticeQueue=[];state.careerEvent=null;
    const rosters=[g.homeTeamId,g.awayTeamId].map(id=>state.players.filter(p=>p.teamId===id));
    assert.equal(e.simulateGame(state,g,rosters),true);assert.equal(g.status,"completed");
  };
  run(s,game);const other=copy.calendar.events.find(g=>g.id===game.id);run(copy,other);
  assert.deepEqual(game.boxScore,other.boxScore);assert.deepEqual(s.rngStates,copy.rngStates);
  const rows=Object.values(game.boxScore),sum=(fn)=>rows.reduce((n,r)=>n+fn(r),0);
  assert.equal(sum(r=>r.fielding?.chances??0),sum(r=>r.batting.AB-r.batting.HR-r.batting.SO));
  assert.equal(sum(r=>r.fielding?.plays??0),sum(r=>r.pitching.outs-r.pitching.SO));
  assert.equal(sum(r=>Object.values(r.fielding?.outs??{}).reduce((n,x)=>n+x,0)),sum(r=>r.pitching.outs)*9);
  for(const r of rows)if(r.fielding)assert.ok(fielding.validFieldingRecord(r.fielding));
  const before=structuredClone(s.players);run(s,game);assert.deepEqual(s.players,before);
});

test("defensive ability changes actual recorded fielding results rather than being added directly to WAR",()=>{
  const result=(defense)=>{
    let saved=0,chances=0;
    for(let i=0;i<8;i++){
      const s=structuredClone(template);s.seed+=`:defense:${i}`;
      s.careerNotice=undefined;s.noticeQueue=[];s.careerEvent=null;
      for(const p of s.players)if(!e.isPitcher(p.primaryRole))p.stats.defense=defense;
      const game=s.calendar.events.find(g=>g.competitionId==="pro-first");
      const rosters=[game.homeTeamId,game.awayTeamId].map(id=>s.players.filter(p=>p.teamId===id));
      assert.equal(e.simulateGame(s,game,rosters),true);assert.equal(game.status,"completed");
      for(const r of Object.values(game.boxScore))if(r.fielding){saved+=r.fielding.plays-r.fielding.expectedPlays;chances+=r.fielding.chances;}
    }
    return saved/chances;
  };
  const strong=result(100),weak=result(1);
  assert.ok(strong>weak,`${strong} should exceed ${weak}`);
});
