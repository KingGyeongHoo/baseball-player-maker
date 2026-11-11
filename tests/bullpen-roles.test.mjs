import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js'),b=require('../.test-build/lib/sim/pro-balance.js');
e.params['pro_events.enabled']=0;e.params['events.focus_chance']=0;
const base=pc.acknowledgeCareer(pc.createProfessionalDemo('closing-records','기록검증','SS'));
function pitching(outs){const r=e.emptyRecord();r.pitching.outs=outs;r.pitching.BF=outs;return r;}
test('school and pro award the actual setup hold and main/backup closing save, without a resting closer appearing',()=>{
 const original={...e.params};
 // Finish a saved 2-0 lead with no further hits or walks, so deployment and
 // scorekeeping are tested independently of random offensive outcomes.
 e.params['match.bb_min']=0;e.params['match.bb_max']=0;e.params['match.hit_min']=0;e.params['match.hit_max']=0;
 try{for(const professional of [false,true])for(const absent of [false,true]){
  const s=structuredClone(base);s.date='2028-04-10';s.proWorld.stage='regular';s.careerNotice=undefined;s.noticeQueue=[];
  s.players=s.players.filter(p=>p.teamId===0||p.teamId===1);
  if(!professional){delete s.careerMode;for(const p of s.players){delete p.professional;delete p.careerMode;}}
  for(const p of s.players){p.fatigue=0;p.lastPitched=null;p.injury=null;p.forcedRest=false;p.trainingPolicy.mode='light';}
  const rosters=[0,1].map(team=>s.players.filter(p=>p.teamId===team)),main=rosters[0].find(p=>p.position==='CP');
  const normal=b.proBullpenPlan(rosters[0],s.seed,s.date,0),closer=absent?normal.backupCloserId:normal.mainCloserId;
  if(absent)main.lastPitched='2028-04-09';
  const middle=rosters[0].find(p=>p.position==='RP'&&p.id!==normal.backupCloserId);
  const sides=rosters.map(roster=>{const side=e.lineup(roster,s.date);return{field:side.field.map(p=>p.id),order:side.order.map(p=>p.id),starter:side.starter.id,pitchers:side.pitchers.map(p=>p.id)};});
  const homeSP=sides[0].starter,awaySP=sides[1].starter;
  // Both of the preceding two days were actual appearances by the main closer.
  const recent=absent?[{id:'two-days-ago',date:'2028-04-08',competitionId:professional?'pro-first':'school',homeTeamId:0,awayTeamId:1,status:'completed',lineup:[[],[]],boxScore:{[main.id]:pitching(3)}}]:[];
  const game={id:`closing-${professional}-${absent}`,date:s.date,homeTeamId:0,awayTeamId:1,competitionId:professional?'pro-first':'school',status:'inProgress',score:[2,0],innings:[[2,0,0,0,0,0,0,0],Array(8).fill(0)],lineup:sides.map(side=>[...side.order,side.starter]),boxScore:{[homeSP]:pitching(18),[middle.id]:pitching(6),[awaySP]:pitching(24)}};
  // School plans do not use a pro schedule; model an unavailable main there
  // with an actual injury instead of professional workload history.
  if(absent&&!professional)main.injury={startDate:'2028-04-09',unavailableUntil:'2028-04-15',penaltyRemaining:0};
  s.calendar.events=[...recent,game];
  s.matchProgress={gameId:game.id,sides,original:s.players.map(p=>({id:p.id,fatigue:p.fatigue,lastPitched:p.lastPitched})),pitchers:[middle.id,awaySP],usedPitchers:[[homeSP,middle.id],[awaySP]],battingIndex:[0,0],pitchOuts:[6,24],recentEvents:[],defense:[60,60],arm:[60,60],inning:9,battingSide:1,outs:0,pa:0,runs:0,bases:[null,null,null],ready:false,eventFatigue:0,
   scoring:{winner:homeSP,loser:awaySP,stints:[{id:homeSP,side:0,starter:true,lead:0,runners:0,blown:false,exitLead:2},{id:middle.id,side:0,starter:false,lead:2,runners:0,blown:false},{id:awaySP,side:1,starter:true,lead:0,runners:0,blown:false}]}};
  assert.equal(e.simulateGame(s,game,rosters),true);assert.equal(game.status,'completed');
  assert.equal(game.boxScore[middle.id].games.holds,1);assert.equal(game.boxScore[closer].games.saves,1);
  assert.equal(game.boxScore[closer].games.holds,0);if(absent)assert.equal(game.boxScore[main.id]?.pitching.BF??0,0);
  const record=structuredClone(game.boxScore);assert.equal(e.simulateGame(s,game,rosters),true);assert.deepEqual(game.boxScore,record);
 }}finally{Object.assign(e.params,original);}
});
