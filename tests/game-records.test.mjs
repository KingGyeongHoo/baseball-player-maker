import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const {finishGameRecords,recordLeadChange}=require('../.test-build/lib/sim/game-records.js');
const {packEvaluationRecord,unpackEvaluationRecord}=require('../.test-build/lib/sim/player-evaluation.js');
const {dashboardRecordValues}=require('../.test-build/app/components/dashboard-records.js');
const Dashboard=require('../.test-build/app/components/dashboard-records.js').default;
function line(outs,BF=outs+2,R=0){const r=e.emptyRecord();Object.assign(r.pitching,{outs,BF,R,ER:R});return r;}
function fixture(){return {game:{score:[4,2],lineup:[[],[]],boxScore:{win:line(18),hold:line(6),save:line(3),lose:line(24)}},m:{scoring:{winner:'win',loser:'lose',stints:[{id:'win',side:0,starter:true,lead:0,runners:0,blown:false,exitLead:2},{id:'hold',side:0,starter:false,lead:2,runners:0,blown:false,exitLead:2},{id:'save',side:0,starter:false,lead:2,runners:0,blown:false},{id:'lose',side:1,starter:true,lead:0,runners:0,blown:false}]}}};}
test('finished games assign one win/loss, qualifying holds and the finishing save without double awards',()=>{
 const {game,m}=fixture();finishGameRecords(game,m);
 assert.equal(game.boxScore.win.games.wins,1);assert.equal(game.boxScore.lose.games.losses,1);assert.equal(game.boxScore.hold.games.holds,1);assert.equal(game.boxScore.save.games.saves,1);
 assert.ok(Object.values(game.boxScore).every(r=>r.games.pitching===1));assert.equal(game.boxScore.win.games.holds,0);assert.equal(game.boxScore.save.games.holds,0);
 const short=fixture();short.game.boxScore.win.pitching.outs=12;short.game.boxScore.hold.pitching.outs=12;finishGameRecords(short.game,short.m);assert.equal(short.game.boxScore.hold.games.wins,1);assert.equal(short.game.boxScore.hold.games.holds,0);
});
test('draws, blown leads and non-save leads do not invent pitching decisions or saves',()=>{
 const draw=fixture();draw.game.score=[2,2];finishGameRecords(draw.game,draw.m);assert.ok(Object.values(draw.game.boxScore).every(r=>r.games.wins===0&&r.games.losses===0&&r.games.saves===0));
 const blown=fixture();blown.m.scoring.stints.find(row=>row.id==='hold').blown=true;blown.m.scoring.stints.find(row=>row.id==='save').lead=4;finishGameRecords(blown.game,blown.m);assert.equal(blown.game.boxScore.hold.games.holds,0);assert.equal(blown.game.boxScore.save.games.saves,0);
 const long=fixture();long.m.scoring.stints.find(row=>row.id==='save').lead=8;long.game.boxScore.save.pitching.outs=9;finishGameRecords(long.game,long.m);assert.equal(long.game.boxScore.save.games.saves,1);
});
test('go-ahead runs charge the responsible pitcher and a tie invalidates the previous decision',()=>{
 const game={score:[1,0]},m={pitchers:['home','relief'],scoring:{stints:[{id:'relief',side:1,lead:1,blown:false}]}};
 recordLeadChange(m,game,0,'inherited');assert.equal(m.scoring.winner,'home');assert.equal(m.scoring.loser,'inherited');assert.equal(m.scoring.stints[0].blown,true);
 game.score=[1,1];recordLeadChange(m,game,1,'home');assert.equal(m.scoring.winner,undefined);assert.equal(m.scoring.loser,undefined);
});
test('game totals aggregate and serialize while legacy unknown counts never become fabricated zeroes',()=>{
 const {game,m}=fixture();finishGameRecords(game,m);const total=e.emptyRecord();e.mergeRecord(total,game.boxScore.win);e.mergeRecord(total,game.boxScore.win);assert.equal(total.games.pitching,2);assert.equal(total.games.wins,2);
 assert.deepEqual(unpackEvaluationRecord(packEvaluationRecord(total)),total);
 const legacy=line(12);e.mergeRecord(legacy,game.boxScore.win);assert.equal(legacy.games?.wins,undefined);assert.equal(legacy.games?.pitching,undefined);
 const values=dashboardRecordValues(legacy,true);assert.equal(values.find(([label])=>label==='승')[1],'—');
 const oldPacked=packEvaluationRecord(total).slice(0,20);assert.equal(unpackEvaluationRecord(oldPacked).games,undefined);
});
test('dashboard fields match the requested order in school and pro level views',()=>{
 const r=e.emptyRecord();Object.assign(r.batting,{PA:10,AB:8,H:4,HR:1,RBI:3});r.games={batting:3,pitching:2,wins:1,losses:0,holds:0,saves:1};r.pitching.outs=17;r.pitching.ER=2;
 assert.deepEqual(dashboardRecordValues(r,true).map(([label])=>label),['출전경기','이닝','승','패','홀드','세이브','ERA']);
 assert.deepEqual(dashboardRecordValues(r,false).map(([label])=>label),['출전경기','타수','안타','홈런','타점','타율','OPS']);
 assert.equal(dashboardRecordValues(r,true)[1][1],'5.2');assert.equal(dashboardRecordValues(r,false).find(([label])=>label==='타율')[1],'.500');
 const html=renderToStaticMarkup(createElement(Dashboard,{records:r,levels:[{label:'1군',records:r},{label:'2군',records:e.emptyRecord()}]}));assert.ok(html.includes('1군'));assert.ok(html.includes('2군'));assert.ok(html.includes('시즌 합계'));assert.ok(html.includes('홀드'));assert.ok(!html.includes('WHIP'));
});
test('real simulation counts appearances and decisions once, without changing existing batting/pitching identities',()=>{
 for(const pro of [false,true]){
 const s=pro?pc.acknowledgeCareer(pc.createProfessionalDemo('pro-game-records','집계','SS')):e.createGame('game-records-integration','집계','SS');
 if(!pro)s.playerId='observer';const game=pro?s.calendar.events.find(g=>g.competitionId==='pro-first'):s.calendar.events[0];
 const rosters=[game.homeTeamId,game.awayTeamId].map(id=>s.players.filter(p=>p.teamId===id));
 assert.equal(e.simulateGame(s,game,rosters),true);assert.equal(game.status,'completed');
 const records=Object.values(game.boxScore);assert.ok(records.filter(r=>r.batting.PA>0).every(r=>r.games.batting===1));assert.ok(records.filter(r=>r.pitching.BF>0).every(r=>r.games.pitching===1));
 const decisive=Number(game.score[0]!==game.score[1]);assert.equal(records.reduce((n,r)=>n+r.games.wins,0),decisive);assert.equal(records.reduce((n,r)=>n+r.games.losses,0),decisive);
 for(const [id,record]of Object.entries(game.boxScore)){const p=s.players.find(p=>p.id===id);assert.deepEqual(p.seasonStats.games,record.games);if(pro){assert.deepEqual(p.seasonByLevel.first.games,record.games);assert.deepEqual(p.seasonByClub[String(p.teamId%10)].first.games,record.games);assert.equal(p.seasonByLevel.second.games,undefined);}}
 const before=structuredClone(rosters);assert.equal(e.simulateGame(s,game,rosters),true);assert.deepEqual(rosters,before);
 }
});
