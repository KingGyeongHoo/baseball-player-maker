import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const {proMatchParameters,proPowerHomeRunTargets:target}=require('../.test-build/lib/sim/pro-balance.js');
const {createProfessionalDemo}=require('../.test-build/lib/sim/pro-career.js');
const stats=n=>Object.fromEntries(Object.keys(e.emptyStats()).map(key=>[key,n]));
const hrRate=p=>(1-p.bb)*p.hit*p.hr;

test('power 80 and 90 reach the requested full-time expectations without changing school probabilities',()=>{
 const pitcher=stats(target.pitching),batter={...stats(target.bq),contact:target.contact},original={...e.params},config=proMatchParameters(e.params);
 for(const row of target.levels){
  const p=e.probabilities({...batter,power:row.power},pitcher,target.defense,target.arm,config),expected=target.plateAppearances*hrRate(p);
  assert.ok(expected>=row.homeRuns[0]&&expected<=row.homeRuns[1],`${row.power}: ${expected}`);
  const school=e.probabilities({...batter,power:row.power},pitcher,target.defense,target.arm);
  assert.equal(school.hr,Math.min(original['match.hr_max'],Math.max(original['match.hr_min'],original['match.hr_base']+original['match.hr_slope']*(row.power-target.pitching))));
 }
 const old={...config,'match.hr_power_bonus':0,'match.hr_elite_slope':0};
 assert.deepEqual(e.probabilities({...batter,power:65},pitcher,70,70,config),e.probabilities({...batter,power:65},pitcher,70,70,old),'ordinary power keeps its old probability');
 assert.deepEqual(e.params,original);
});

test('contact, opposing pitching and effective fatigue still affect power production and all hit types stay bounded',()=>{
 const config=proMatchParameters(e.params),batter={...stats(75),contact:77,power:90},pitcher=stats(70),base=hrRate(e.probabilities(batter,pitcher,70,70,config));
 assert.ok(hrRate(e.probabilities({...batter,contact:50},pitcher,70,70,config))<base);
 assert.ok(hrRate(e.probabilities(batter,stats(85),70,70,config))<base);
 const p=e.previewPlayer('power-fatigue','파워','DH');p.stats=batter;p.stance.batting='level';p.fatigue=0;
 const healthy=hrRate(e.probabilities(e.effective(p),pitcher,70,70,config));p.fatigue=100;
 assert.ok(hrRate(e.probabilities(e.effective(p),pitcher,70,70,config))<healthy);
 let previous=0;for(let power=1;power<=100;power++){
  const probs=e.probabilities({...batter,power},pitcher,70,70,config);assert.ok(probs.hr>=previous);assert.ok(probs.hr>=config['match.hr_min']&&probs.hr<=config['match.hr_max']);assert.ok(probs.hr+probs.double+probs.triple<=1);previous=probs.hr;
 }
});

test('actual professional games reproduce both power targets across fixed healthy lineups and seeds',t=>{
 const source=createProfessionalDemo('power-calibration','검증','DH');
 source.players=source.players.filter(p=>p.teamId===0||p.teamId===1);
 for(const p of source.players){p.stats=stats(70);p.bats='R';p.throws='R';p.stance.batting='level';p.stance.pitching='command';p.stats.velocity/=e.params['stance.command_velocity'];p.stats.control/=e.params['stance.command_control'];p.injury=null;p.forcedRest=false;p.trainingPolicy.mode='train';delete p.twoWay;}
 const focus=source.players.filter(p=>p.teamId===0&&p.position==='1B').at(-1);focus.stats={...stats(target.bq),contact:target.contact};
 source.playerId=focus.id;source.calendar.events=[];source.proWorld.stage='regular';source.careerNotice=null;source.careerEvent=null;
 const positions=['C','SS','CF','2B','1B','3B','LF','RF'];
 const prepared=[0,1].map(team=>{
  const pool=source.players.filter(p=>p.teamId===team),field=positions.map(pos=>pool.find(p=>p.position===pos&&p!==focus).id),pitchers=pool.filter(p=>['SP','RP','CP'].includes(p.position)).map(p=>p.id);
  field.push(team===0?focus.id:pool.find(p=>!field.includes(p.id)&&!e.isPitcher(p.primaryRole)).id);
  return {field,order:[...field],pitchers,starter:pool.find(p=>p.position==='SP').id};
 });
 const oldEvents=e.params['pro_events.enabled'],oldFocus=e.params['events.focus_chance'];
 try{
  e.params['pro_events.enabled']=0;e.params['events.focus_chance']=0;
  for(const row of target.levels){
   let PA=0,HR=0;
   for(let seed=0;seed<12;seed++){
    const s=structuredClone(source);s.seed='power-sample-'+seed;s.rngStates.match=e.hash(s.seed);e.getPlayer(s).stats.power=row.power;
    for(const p of s.players){p.seasonStats=e.emptyRecord();p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.seasonByClub={};}
    for(let day=0;day<144;day++){
     s.date=e.addDays('2028-03-28',day);for(const p of s.players){p.fatigue=0;p.lastPitched=null;}
     const game={id:`power:${seed}:${day}`,date:s.date,competitionId:'pro-first',homeTeamId:0,awayTeamId:1,status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{},proPreparedLineup:structuredClone(prepared)};
     assert.equal(e.simulateGame(s,game,[0,1].map(team=>s.players.filter(p=>p.teamId===team))),true);assert.equal(game.status,'completed');
     const records=game.boxScore[focus.id].batting;PA+=records.PA;HR+=records.HR;
    }
   }
   const per600=HR/PA*target.plateAppearances;t.diagnostic(JSON.stringify({power:row.power,seasons:12,PA,HR,homeRunsPer600PA:per600}));
   assert.ok(per600>=row.homeRuns[0]&&per600<=row.homeRuns[1],`power ${row.power}: ${per600} HR / 600 PA`);
  }
 }finally{e.params['pro_events.enabled']=oldEvents;e.params['events.focus_chance']=oldFocus;}
});
