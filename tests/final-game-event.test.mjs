import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const {openFinalGameEvent}=require('../.test-build/lib/sim/final-game-event.js'),save=require('../.test-build/lib/career-save.js');
const template=e.createGame('final-game-event','결승선수','SS');
function fixture(){
 const s=structuredClone(template),p=e.getPlayer(s);s.careerEvent=null;s.careerNotice=null;s.noticeQueue=[];p.fatigue=0;p.injury=null;p.forcedRest=false;p.throws='R';
 for(const key of Object.keys(p.stats))p.stats[key]=80;
 const competition={id:'test-cup',name:'청룡기',kind:'tournament',startDate:s.date,endDate:s.date,entryRule:'test',participantTeamIds:[0,1,2,3,4,5,6,7],initialized:true,round:3,roundDates:[s.date,s.date,s.date],byes:[],championTeamId:null};
 const game={id:'test-cup-final',date:s.date,homeTeamId:p.teamId,awayTeamId:p.teamId===0?1:0,competitionId:competition.id,rulesetId:'test',round:3,status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{}};
 s.calendar.events=[game];s.calendar.competitions=[competition];return {s,p,game,rosters:[game.homeTeamId,game.awayTeamId].map(team=>s.players.filter(p=>p.teamId===team))};
}
test('high-school finals always open one baseball choice before play and resume identically after saving',()=>{
 const {s,p,game,rosters}=fixture(),rng={...s.rngStates},stance={...p.stance};
 assert.equal(e.simulateGame(s,game,rosters),false);assert.equal(s.careerEvent.definitionId,'FINAL-GAME');assert.match(s.careerEvent.title,/청룡기 결승/);
 assert.equal(game.status,'scheduled');assert.equal(s.matchProgress,undefined);assert.deepEqual(game.boxScore,{});assert.deepEqual(s.rngStates,rng);
 const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
 let reference;
 for(const initial of [s,loaded]){
  const next=e.answerCareerEvent(initial,initial.careerEvent.choices[0].id),g=next.calendar.events[0],rows=rosters.map(side=>side.map(p=>next.players.find(row=>row.id===p.id)));
  assert.equal(g.finalFocus.field,'batting');assert.equal(g.finalFocus.playerId,p.id);assert.equal(g.finalFocus.effect.bb,.015);
  assert.equal(e.simulateGame(next,g,rows),true);assert.equal(g.status,'completed');assert.equal(next.careerEvent,null);assert.equal(next.careerEventHistory.filter(row=>row.definitionId==='FINAL-GAME').length,1);
  assert.ok(g.boxScore[p.id].batting.PA>0);assert.deepEqual(e.getPlayer(next).stance,stance);
  if(initial===s)reference=structuredClone(g);else assert.deepEqual(g,reference);
 }
});
test('semifinals, bronze games and other countries never trigger the guaranteed final choice',()=>{
 const {s,game,rosters}=fixture();game.round=2;assert.equal(openFinalGameEvent(s,game,rosters),false);
 game.national={stage:'medals',group:1,knockout:true,youth:false};assert.equal(openFinalGameEvent(s,game,rosters),false);
 game.national.group=0;const observer={...s,playerId:'national-observer'};assert.equal(openFinalGameEvent(observer,game,rosters),false);
 assert.equal(openFinalGameEvent(s,game,rosters),true);assert.equal(s.careerEvent.definitionId,'FINAL-GAME');assert.equal(game.national.eventOpened,true);
 s.careerEvent=null;assert.equal(openFinalGameEvent(s,game,rosters),false);
});
