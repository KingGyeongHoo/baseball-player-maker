import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js'),catalog=require('../.test-build/lib/sim/pro-event-catalog.js');
const {abilityAdjustedEventOutcomes:adjust,eventAbilityStats}=require('../.test-build/lib/sim/event-ability-probability.js');
const save=require('../.test-build/lib/career-save.js');
let base;
function fixture(position='SS'){
 base??=pc.acknowledgeCareer(pc.createProfessionalDemo('event-ability-check','능력검증','SS'));
 const s=structuredClone(base),p=e.getPlayer(s);s.date='2028-05-01';s.phase='weekStart';s.proWorld.stage='regular';s.careerNotice=null;s.noticeQueue=[];s.careerEventHistory=[];delete s.pendingEventOutcome;delete s.weekProgress;delete s.matchProgress;
 p.position=position;p.primaryRole=e.roleFor(position);p.eligiblePositions=[position];p.injury=null;p.forcedRest=false;p.fatigue=20;delete p.twoWay;
 for(const key of Object.keys(p.stats))p.stats[key]=50;
 return s;
}
function open(s,id,field){
 const p=e.getPlayer(s),game=['PE20','PE21','PE22','PE79','PE80','PE81'].includes(id),chosen=field??(e.isPitcher(p.primaryRole)?'pitching':'batting');
 const event=s.careerEvent=catalog.createProEvent(s,id,{version:1,catalogId:id,channel:game?'game':'general',year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:'first',field:chosen,openedAt:s.date});
 if(game)event.scene={gameId:'probability-game',inning:7,battingSide:0,outs:1,bases:[null,null,null],score:[1,0],batting:chosen==='batting',running:id==='PE81',batterName:'타자',pitcherName:'투수'};
 return event;
}
function seed(s,min,max){for(let value=0;value<100000;value++){const q={rngStates:{...s.rngStates,events:value}},first=e.random(q,'events');if(first>=min&&first<max){s.rngStates.events=value;return;}}assert.fail('missing event roll');}

test('50-percent outcomes range from 25 to 75 percent linearly and never mutate saved weights',()=>{
 const s=fixture(),p=e.getPlayer(s),event=open(s,'PE20'),choice=event.choices[0],original=structuredClone(choice);
 for(const [ability,expected]of [[0,25],[20,35],[50,50],[80,65],[100,75],[-20,25],[120,75]]){
  p.stats.power=ability;const result=adjust(event,choice,p,'contact');
  assert.equal(result[0].weight,expected);assert.equal(result[1].weight,100-expected);assert.equal(result.reduce((sum,row)=>sum+row.weight,0),100);
 }
 assert.deepEqual(choice,original);
});
test('actions use their actual batting, pitching and running skills including the selected two-way field',()=>{
 const s=fixture(),p=e.getPlayer(s),bat=open(s,'PE20');
 assert.deepEqual(eventAbilityStats(bat,bat.choices[0],p,'contact'),['power']);assert.deepEqual(eventAbilityStats(bat,bat.choices[1],p,'contact'),['contact']);
 const steal=open(s,'PE81');assert.deepEqual(eventAbilityStats(steal,steal.choices[0],p,'bq'),['speed']);
 const pitch=open(s,'PE22','pitching');p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'pitching',reputationBonus:0};
 assert.deepEqual(eventAbilityStats(pitch,pitch.choices[0],p,'control'),['velocity']);assert.deepEqual(eventAbilityStats(pitch,pitch.choices[1],p,'control'),['control']);
 const conversion=open(s,'PE33','pitching');assert.deepEqual(eventAbilityStats(conversion,conversion.choices[0],p,'control'),['control']);assert.deepEqual(eventAbilityStats(conversion,conversion.choices[1],p,'control'),['velocity']);
 const physical={...conversion,definitionId:'physical-check'},choice={id:'physical',label:'훈련한다',outcomes:[{weight:50,message:'성장',weeks:{stamina:3,arm:3}},{weight:50,message:'실패',stats:{stamina:-.3}}]};
 p.stats.stamina=100;p.stats.arm=0;assert.equal(adjust(physical,choice,p,'physical')[0].weight,50);
});
test('challenge and stable bases receive a centered ability adjustment within probability limits',()=>{
 const s=fixture('SP'),p=e.getPlayer(s),event=open(s,'PE33');p.stats.control=100;p.stats.velocity=100;
 assert.deepEqual(adjust(event,event.choices[0],p,'control').map(row=>row.weight),[60,40]);assert.deepEqual(adjust(event,event.choices[1],p,'control').map(row=>row.weight),[100,0]);
 p.stats.velocity=50;assert.deepEqual(adjust(event,event.choices[1],p,'control').map(row=>row.weight),[85,15]);
 p.stats.control=0;p.stats.velocity=0;
 assert.deepEqual(adjust(event,event.choices[0],p,'control').map(row=>row.weight),[10,90]);assert.deepEqual(adjust(event,event.choices[1],p,'control').map(row=>row.weight),[60,40]);
});
test('camp jackpots, career decisions, certainty and two beneficial alternatives retain their original chances',()=>{
 const s=fixture(),p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=100;
 for(const id of ['PE08','PE84','PE27']){const event=open(s,id);for(const choice of event.choices)assert.deepEqual(adjust(event,choice,p,'bq'),choice.outcomes);}
 const event=open(s,'PE01');
 const neutral={id:'rest',label:'쉰다',outcomes:[{weight:50,message:'훈련',weeks:{contact:3}},{weight:50,message:'회복',fatigue:-10}]};
 assert.deepEqual(adjust(event,neutral,p,'contact'),neutral.outcomes);
 const certain={id:'one',label:'확인',outcomes:[{weight:100,message:'확인',weeks:{contact:3}}]};assert.deepEqual(adjust(event,certain,p,'contact'),certain.outcomes);
});
test('real choice resolution uses the adjusted threshold once and remains deterministic across reloads',()=>{
 const s=fixture(),p=e.getPlayer(s),event=open(s,'PE20');p.stats.power=100;p.stats.contact=0;seed(s,.7,.74);
 const original=structuredClone(s),next=e.answerCareerEvent(s,event.choices[0].id);
 assert.ok(next.careerEventHistory.at(-1).selectionBonus>0);
 const precision=e.answerCareerEvent(s,event.choices[1].id);assert.ok(precision.careerEventHistory.at(-1).selectionBonus<0);
 assert.deepEqual(s,original);assert.equal(next.rngStates.match,s.rngStates.match);
 const probe={rngStates:{...s.rngStates}};e.random(probe,'events');assert.equal(next.rngStates.events,probe.rngStates.events);
 // Ordinary pre-bonus pending saves still use their frozen outcomes and current skills.
 const pending=fixture(),q=e.getPlayer(pending);open(pending,'PE20');q.stats.power=100;seed(pending,.7,.74);
 const restored=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(pending))).state;
 const direct=e.answerCareerEvent(pending,'choice-1'),loaded=e.answerCareerEvent(restored,'choice-1');
 assert.deepEqual(loaded.careerEventHistory,direct.careerEventHistory);assert.deepEqual(loaded.rngStates,direct.rngStates);
});
