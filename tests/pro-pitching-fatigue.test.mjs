import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const f=require('../.test-build/lib/sim/pro-pitching-fatigue.js');
const balance=require('../.test-build/lib/sim/pro-balance.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('shared pitch cost gives the agreed starter and bullpen budgets',()=>{
  for(const [stamina,rate,starter,relief] of [[50,1.6,50,12],[75,1,80,20],[100,.4,200,50]]){
    close(f.proPitchFatigueRate(stamina),rate);
    assert.equal(f.proPitchStint(0,f.proPitchFatigueRate(stamina),true).budget,starter);
    assert.equal(f.proPitchStint(0,f.proPitchFatigueRate(stamina),false).budget,relief);
  }
  close(f.proPitchFatigueRate(25),2.2);
  assert.equal(f.proPitchStint(8,1,false).budget,12);
  assert.equal(f.proPitchStint(0,.5,false).budget,40);
});
test('each inning uses the frozen 30 percent budget across a save/resume',()=>{
  let w={version:1,stints:{p:f.proPitchStint(0,1,false)}};
  for(const count of [5,4,6]){
    w.stints.p.inningPitches=count;f.finishProPitchingInning(w.stints.p,false);
    assert.equal(w.stints.p.mustExit,false);assert.equal(w.stints.p.budget,20);
    w=JSON.parse(JSON.stringify(w));assert.equal(f.validProPitchWorkload(w),true);
  }
  w.stints.p.inningPitches=7;f.finishProPitchingInning(w.stints.p,false);
  assert.equal(w.stints.p.mustExit,true);
  w.stints.p.rate=0;assert.equal(f.validProPitchWorkload(w),false);
});
test('professional daily recovery replaces old recovery and never goes negative',()=>{
  for(const [recovery,days] of [[50,4],[100,2]]){
    let fatigue=80,recovered=0;
    for(let day=0;day<days;day++){const result=e.trainingFatigueDay(fatigue,recovery,0,1,true);fatigue=result.end;recovered+=result.recovered;}
    close(fatigue,0);close(recovered,80);
  }
  assert.equal(e.trainingFatigueDay(5,100,0,1,true).recovered,5);
  assert.notEqual(e.trainingFatigueDay(80,50,0,1,false).end,60);
});
test('stamina floor and relief fatigue ceiling apply before selection',()=>{
  const p=e.previewPlayer('pitch-floor','투수','SP');p.careerMode='pro';delete p.offseasonShop;
  p.stats.stamina=49.99;assert.equal(f.proStarterEligible(p),false);
  p.stats.stamina=50;assert.equal(f.proStarterEligible(p),true);
  p.primaryRole='중간계투';p.position='RP';p.lastPitched=null;
  p.fatigue=20;assert.equal(balance.proReliefReady(p,'2028-04-01'),false);
  p.fatigue=19;assert.equal(balance.proReliefReady(p,'2028-04-01'),true);
});
test('pitch estimates respect outcome minimums and merge with legacy records',()=>{
  for(const [outcome,minimum] of [['walk',4],['strikeout',3],['inPlay',1]])for(const roll of [0,.5,.999]){
    const n=f.estimatedProPitches(outcome,100,roll);assert.ok(Number.isInteger(n)&&n>=minimum);
  }
  const old=e.emptyRecord(),game=e.emptyRecord();game.pitching.pitches=21;
  e.mergeRecord(old,game);assert.equal(old.pitching.pitches,21);
  e.mergeRecord(old,e.emptyRecord());assert.equal(old.pitching.pitches,21);
});

test('a professional game charges recorded pitches rather than outs',()=>{
  const pc=require('../.test-build/lib/sim/pro-career.js');
  const s=pc.acknowledgeCareer(pc.createProfessionalDemo('pitch-fatigue-game','검증','SS'));
  const game=s.calendar.events.find(g=>g.competitionId==='pro-first'&&g.status==='scheduled'&&g.homeTeamId!==e.getPlayer(s).teamId&&g.awayTeamId!==e.getPlayer(s).teamId);
  assert.ok(game);s.date=game.date;s.proWorld.stage='regular';delete s.careerNotice;delete s.careerEvent;
  const rosters=[game.homeTeamId,game.awayTeamId].map(team=>s.players.filter(p=>p.teamId===team));
  for(const p of rosters.flat()){p.fatigue=0;p.forcedRest=false;p.injury=null;p.lastPitched=null;delete p.offseasonShop;delete p.twoWay;p.stats.stamina=75;}
  assert.equal(e.simulateGame(s,game,rosters),true);assert.equal(game.status,'completed');
  let pitchers=0;
  for(const p of rosters.flat()){
    const record=game.boxScore[p.id]?.pitching;if(!record?.BF)continue;
    pitchers++;assert.ok(record.pitches>=record.BF);close(p.fatigue,Math.min(100,record.pitches));
    assert.equal(p.seasonByLevel.first.pitching.pitches,record.pitches);
  }
  assert.ok(pitchers>=4);
});
