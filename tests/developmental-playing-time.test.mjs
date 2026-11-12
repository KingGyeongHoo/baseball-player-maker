import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),world=require('../.test-build/lib/sim/pro-world.js');
const {farmGameRoster,proGameTeam}=require('../.test-build/lib/sim/pro-farm-roster.js');
const {farmMinimum}=require('../.test-build/lib/sim/pro-farm.js');
const {proStarterReady}=require('../.test-build/lib/sim/pro-balance.js');
const save=require('../.test-build/lib/career-save.js');
e.params['pro_events.enabled']=0;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('developmental-playing-time','검증','SS'));
function player(s,id,pos,team,ability=65){
  const p=structuredClone(e.getPlayer(template));p.id=id;p.name=id;p.teamId=team;p.position=pos;p.primaryRole=e.roleFor(pos);p.preferredRole=p.primaryRole;p.eligiblePositions=e.isPitcher(p.primaryRole)?["SP","RP","CP"]:[pos];delete p.twoWay;p.throws='R';p.bats='R';p.proContract.status=team>=30?'developmental':'regular';p.fatigue=0;p.injury=null;p.forcedRest=false;p.lastPitched=null;p.trainingPolicy=e.defaultPolicy(p.primaryRole);p.seasonStats=e.emptyRecord();p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.recentAppearances=[];p.recentZ=0;p.age=20;
  for(const key of Object.keys(p.stats))p.stats[key]=ability;
  p.professional.employment='active';p.professional.rookieYear=s.calendar.seasonYear;p.professional.lastAppearance=e.addDays(s.date,-1);delete p.professional.lastEvaluation;delete p.professional.managedUntil;delete p.professional.contract.faTerms;delete p.professional.requestedEvaluationUntil;return p;
}
function fixture(pos='3B'){
  const s=structuredClone(template);s.date=`${s.calendar.seasonYear}-04-01`;s.proWorld.stage='regular';s.careerNotice=null;s.careerEvent=null;s.noticeQueue=[];delete s.matchProgress;delete s.weekProgress;
  const roster=club=>Object.entries(farmMinimum).flatMap(([pos,n])=>Array.from({length:n},(_,i)=>player(s,`${club}-${pos}-${i}`,pos,club+10)));
  s.players=[...roster(0),...roster(1)];const third=player(s,'third',pos,20,80),dev=player(s,'developmental',pos,30,90);s.players.push(third,dev);s.playerId=dev.id;s.postSchool.pro.level='developmental';
  return {s,third,dev};
}
const game=(s,id='farm')=>({id,date:s.date,homeTeamId:10,awayTeamId:11,competitionId:'pro-second',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{},rulesetId:'test'});
test('ordinary selection remains second, then third, then developmental with every lower squad in the pool',()=>{
  const {s,third,dev}=fixture(),second=s.players.find(p=>p.teamId===10&&p.position==='3B'),pool=farmGameRoster(s,10);
  assert.ok(pool.includes(dev));assert.equal(proGameTeam(dev),10);assert.equal(e.lineup(pool,s.date).field[5].id,second.id);
  second.trainingPolicy.mode='rest';assert.equal(e.lineup(pool,s.date).field[5].id,third.id);third.trainingPolicy.mode='rest';assert.equal(e.lineup(pool,s.date).field[5].id,dev.id);
  assert.equal(dev.teamId,30);
});
test('idle evaluation opportunities rotate second, third and developmental hitters even with healthy higher squads',()=>{
  const {s,third,dev}=fixture(),second=s.players.find(p=>p.teamId===10&&p.position==='3B');
  delete second.professional.lastAppearance;delete third.professional.lastAppearance;delete dev.professional.lastAppearance;
  const ids=[],before=e.proSelectionScore(dev);
  for(let day=0;day<3;day++){
    const g=game(s,`rotate-${day}`);s.calendar.events=[...s.calendar.events.filter(g=>g.status==='completed'),g];s.careerNotice=null;
    world.prepareEvaluationOpportunities(s,[g.id]);const chosen=[second,third,dev].find(p=>g.evaluationPlayers.includes(p.id));assert.ok(chosen);ids.push(chosen.id);
    assert.equal(chosen.professional.lastEvaluation,undefined);
    for(const team of [10,11]){const side=world.professionalLineup(s,farmGameRoster(s,team),s.date,g.evaluationPlayers);assert.equal(side.field.length,9,`field ${team}`);assert.ok(side.starter,`starter ${team}`);}
    assert.equal(e.simulateGame(s,g,[]),true);assert.equal(g.status,'completed');assert.ok(chosen.seasonByLevel.second.batting.PA>0);assert.equal(chosen.professional.lastEvaluation,s.date);
    s.date=e.addDays(s.date,1);
  }
  assert.deepEqual(ids,[second.id,third.id,dev.id]);assert.equal(dev.teamId,30);assert.equal(dev.proContract.status,'developmental');assert.equal(dev.seasonByLevel.first.batting.PA,0);assert.ok(e.proSelectionScore(dev)>before);
  const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.ok(restored.players.find(p=>p.id===dev.id).seasonByLevel.second.batting.PA>0);
});
test('a developmental starter receives a real evaluated start and retains real rest rules',()=>{
  const {s,dev}=fixture('SP');delete dev.professional.lastAppearance;
  const g=game(s);s.calendar.events=[g];world.prepareEvaluationOpportunities(s,[g.id]);assert.ok(g.evaluationPlayers.includes(dev.id));
  assert.equal(world.professionalLineup(s,farmGameRoster(s,10),s.date,g.evaluationPlayers).starter.id,dev.id);
  e.simulateGame(s,g,[]);assert.ok(dev.seasonByLevel.second.pitching.BF>0);assert.equal(g.lineup[0][9],dev.id);assert.equal(dev.teamId,30);assert.equal(proStarterReady(s,dev,e.addDays(s.date,1)),false);
});
test('a developmental reliever gets real batters faced in a scheduled evaluation',()=>{
  const {s,dev}=fixture('RP');delete dev.professional.lastAppearance;
  const g=game(s);s.calendar.events=[g];world.prepareEvaluationOpportunities(s,[g.id]);assert.ok(g.evaluationPlayers.includes(dev.id));e.simulateGame(s,g,[]);
  assert.ok(dev.seasonByLevel.second.pitching.BF>0);assert.equal(dev.professional.lastEvaluation,s.date);assert.equal(dev.teamId,30);
});
test('unplayed evaluations do not consume cooldowns or requests and are not reserved twice on one day',()=>{
  const {s,dev}=fixture('CP');delete dev.professional.lastAppearance;dev.professional.requestedEvaluationUntil=e.addDays(s.date,21);
  const first=game(s,'first'),second=game(s,'second');s.calendar.events=[first,second];world.prepareEvaluationOpportunities(s,[first.id,second.id]);
  assert.ok(first.evaluationPlayers.includes(dev.id));assert.ok(!second.evaluationPlayers.includes(dev.id));assert.equal(dev.professional.lastEvaluation,undefined);assert.ok(dev.professional.requestedEvaluationUntil);assert.equal(dev.seasonByLevel.second.pitching.BF,0);
});
test('developmental two-way evaluations follow the current assignment without simultaneous pitching and batting',()=>{
  for(const [origin,assignment] of [['SS','pitching'],['SP','batting']]){
    const {s,dev}=fixture(origin);dev.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:assignment,reputationBonus:0};dev.eligiblePositions=['SS','SP','RP','CP'];delete dev.professional.lastAppearance;
    const g=game(s);s.calendar.events=[g];world.prepareEvaluationOpportunities(s,[g.id]);assert.ok(g.evaluationPlayers.includes(dev.id));e.simulateGame(s,g,[]);
    const r=dev.seasonByLevel.second;
    if(assignment==='pitching'){assert.ok(r.pitching.BF>0);assert.equal(r.batting.PA,0);}else{assert.ok(r.batting.PA>0);assert.equal(r.pitching.BF,0);}
  }
});
test('a developmental closer gets an evaluated closing role, with cooldown only after a real appearance',()=>{
  let appeared=false;
  for(let i=0;i<20&&!appeared;i++){
    const {s,dev}=fixture('CP');delete dev.professional.lastAppearance;s.rngStates.match=e.hash(`developmental-save:${i}`);
    const g=game(s);s.calendar.events=[g];world.prepareEvaluationOpportunities(s,[g.id]);e.simulateGame(s,g,[]);
    if(dev.seasonByLevel.second.pitching.BF>0){assert.equal(dev.professional.lastEvaluation,s.date);appeared=true;}
    else assert.equal(dev.professional.lastEvaluation,undefined);
  }
  assert.ok(appeared);
});
