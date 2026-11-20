import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const world=require('../.test-build/lib/sim/pro-world.js');

test('DH goes to the best remaining hitter regardless of registered position, defense or DH eligibility',()=>{
 const s=pc.acknowledgeCareer(pc.createProfessionalDemo('open-dh-role','후보포수','C')),base=e.getPlayer(s);
 const roster=['C','SS','CF','2B','1B','3B','LF','RF','C','DH','SP','SP'].map((position,i)=>{
  const p=structuredClone(base);p.id=`dh-${i}`;p.position=position;p.primaryRole=e.roleFor(position);p.eligiblePositions=[position];p.teamId=0;p.throws='R';p.fatigue=0;p.injury=null;p.forcedRest=false;p.trainingPolicy=e.defaultPolicy(p.primaryRole);
  for(const key of Object.keys(p.stats))p.stats[key]=50;
  return p;
 });
 const hitter=roster[8],legacy=roster[9],pitcher=roster[10],dual=roster[11];
 Object.assign(hitter.stats,{contact:90,power:90,bq:90,defense:1,speed:1});
 Object.assign(roster[0].stats,{contact:100,power:100,bq:100});
 Object.assign(legacy.stats,{contact:60,power:60,bq:60,defense:100,speed:100});
 for(const key of Object.keys(pitcher.stats))pitcher.stats[key]=100;
 dual.twoWay={pitchingPosition:'SP',battingPosition:'1B',nextAssignment:'pitching',reputationBonus:0};
 Object.assign(dual.stats,{velocity:100,control:100,movement:100,contact:10,power:10,bq:10});
 const result=e.lineup(roster,s.date,dual);
 assert.equal(result.field[0],roster[0]);assert.equal(result.field[8],hitter);
 assert.equal(hitter.position,'C');assert.deepEqual(hitter.eligiblePositions,['C']);
 assert.equal(new Set(result.field.map(p=>p.id)).size,9);
 const spring=require('../.test-build/lib/sim/pro-spring.js').springLineup(s,roster,s.date);
 assert.equal(spring.field[8],hitter);
 hitter.forcedRest=true;assert.equal(e.lineup(roster,s.date,dual).field[8],legacy);
});

test('professional rest-day lineups choose the strongest DH after the final defensive assignments',()=>{
 const s=pc.acknowledgeCareer(pc.createProfessionalDemo('dh-after-rest','후보야수','SS'));
 s.proWorld.stage='regular';
 const roster=s.players.filter(p=>p.teamId===0);
 for(const p of roster){p.injury=null;p.forcedRest=false;p.fatigue=0;p.trainingPolicy.mode='normal';}
 for(let i=0;i<20;i++){
  const date=e.addDays('2028-04-01',i),result=world.professionalLineup(s,roster,date);
  assert.equal(result.field.length,9);
  const defenders=new Set(result.field.slice(0,8).map(p=>p.id));
  const best=roster.filter(p=>e.available(p,date)&&e.canBatAsDH(p)&&!defenders.has(p.id)).sort(e.compareDesignatedHitters)[0];
  assert.equal(result.field[8].id,best.id);
  assert.equal(result.order.length,9);assert.equal(new Set(result.order.map(p=>p.id)).size,9);
 }
});

test('the DH preparation choice improves batting without starting a fixed-position conversion',()=>{
 const s=pc.acknowledgeCareer(pc.createProfessionalDemo('dh-preparation-role','타격후보','SS'));
 const p=e.getPlayer(s),position=p.position;
 const {createProEvent}=require('../.test-build/lib/sim/pro-event-catalog.js');
 const event=createProEvent(s,'PE11',{version:1,catalogId:'PE11',channel:'general',year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:'third',field:'batting',openedAt:s.date});
 assert.equal(event.choices[0].outcomes[0].proRoleTrial,undefined);
 s.careerEvent=event;
 const next=e.answerCareerEvent(s,event.choices[0].id);
 assert.equal(e.getPlayer(next).position,position);
 assert.equal(e.getPlayer(next).professional.roleTrial,undefined);
});

test('a clear batting starter keeps the position on rotation days and still rests when unavailable',()=>{
 const s=pc.acknowledgeCareer(pc.createProfessionalDemo('clear-starting-hitter','주전선수','SS'));
 const roster=s.players.filter(p=>p.teamId===0),shortstops=roster.filter(p=>p.position==='SS'),[starter,backup]=shortstops;
 assert.ok(backup);
 for(const p of shortstops){for(const stat of Object.keys(p.stats))p.stats[stat]=60;p.injury=null;p.forcedRest=false;}
 Object.assign(starter.seasonByLevel.first.batting,{PA:600,AB:550,H:220,HR:50,BB:50});
 assert.ok(e.selectionScore(starter)-e.selectionScore(backup)>=10);
 const dates=Array.from({length:40},(_,i)=>e.addDays('2028-04-01',i));
 const oldRotationDay=dates.find(date=>e.hash(`${s.seed}:${date}:${starter.id}:rest`)%100<60);
 assert.ok(oldRotationDay);
 for(const date of dates)assert.equal(world.professionalLineup(s,roster,date).field[1].id,starter.id);
 starter.forcedRest=true;
 assert.notEqual(world.professionalLineup(s,roster,oldRotationDay).field[1].id,starter.id);
});

test('an evaluation DH cannot turn an incomplete field into a nine-slot lineup with holes',()=>{
 const s=pc.acknowledgeCareer(pc.createProfessionalDemo('short-evaluation-lineup','평가선수','DH'));
 const base=e.getPlayer(s),positions=['C','SS','CF','2B','1B','3B','DH','DH','SP'];
 const roster=positions.map((position,i)=>{const p=structuredClone(base);p.id=`short-${i}`;p.position=position;p.primaryRole=e.roleFor(position);p.eligiblePositions=[position];p.teamId=10;p.fatigue=0;p.forcedRest=false;p.injury=null;p.trainingPolicy=e.defaultPolicy(p.primaryRole);return p;});
 const dh=roster.filter(p=>p.position==='DH').at(-1),result=world.professionalLineup(s,roster,s.date,[dh.id]);
 const opponent=roster.map(p=>({...structuredClone(p),id:`opponent-${p.id}`,teamId:11}));
 for(const position of ['LF','RF'])opponent.push({...structuredClone(opponent[0]),id:`opponent-${position}`,position,primaryRole:e.roleFor(position),eligiblePositions:[position]});
 s.players=[...roster,...opponent];s.playerId=dh.id;s.careerNotice=null;s.careerEvent=null;delete s.matchProgress;
 const game={id:'short-roster-game',date:s.date,homeTeamId:10,awayTeamId:11,competitionId:'pro-second',round:1,rulesetId:'test',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{},evaluationPlayers:[dh.id]};
 assert.doesNotThrow(()=>e.simulateGame(s,game,[roster,opponent]));
 assert.equal(game.status,'forfeit');
 assert.equal(result.field.length,7);
 assert.ok(Array.from(result.field).every(Boolean));
 assert.ok(Array.from(result.order).every(Boolean));
});
