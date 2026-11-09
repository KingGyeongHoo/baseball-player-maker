import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const {leagueLeaders}=require('../.test-build/lib/league-leaders.js');
const {discardRetiredPlayers}=require('../.test-build/lib/sim/retired-records.js');
const {evaluationLeague}=require('../.test-build/lib/sim/player-evaluation.js');
const {developmentCalendar}=require('../.test-build/lib/sim/pro-calendar.js');
const League=require('../.test-build/app/components/pro-league.js').default;
const player=(id,teamId=0)=>({id,name:id,teamId,professional:{employment:'active',agedYear:2030},career:[],seasonStats:e.emptyRecord(),seasonByLevel:{first:e.emptyRecord(),second:e.emptyRecord()}});
function fixture(){
 const calendar=developmentCalendar(2030,true);
 for(const competition of ['pro-first','pro-second']){
  const game=calendar.events.find(g=>g.competitionId===competition);game.status='completed';game.score=[3,1];
 }
 return {careerMode:'pro',playerId:'me',date:'2030-04-01',players:[],teams:Array.from({length:20},(_,id)=>({id,name:'팀'+id,shortName:'T'+id})),calendar,proWorld:{archive:[]}};
}
const rows=(s,level,field,id)=>leagueLeaders(s,level,field).find(board=>board.metric.id===id).rows;
test('leaders separate levels and fields, retain demoted players first-team records, and cap each metric at ten',()=>{
 const s=fixture();
 for(let i=0;i<14;i++){const p=player('p'+String(i).padStart(2,'0'),10);p.seasonByLevel.first.batting={...p.seasonByLevel.first.batting,PA:10,AB:10,H:i,HR:i};p.seasonByLevel.second.batting={...p.seasonByLevel.second.batting,PA:10,AB:10,H:14-i,HR:14-i};s.players.push(p);}
 const retired=player('retired');retired.professional.employment='retired';retired.seasonByLevel.first.batting.PA=10;retired.seasonByLevel.first.batting.HR=100;s.players.push(retired);
 assert.equal(rows(s,'pro-first','batting','HR').length,10);assert.equal(rows(s,'pro-first','batting','HR')[0].player.id,'p13');assert.equal(rows(s,'pro-second','batting','HR')[0].player.id,'p00');
 assert.deepEqual(rows(s,'pro-first','pitching','outs'),[]);
});
test('rate leaders apply playing-time requirements and order ERA and WHIP upward from the lowest value',()=>{
 const s=fixture(),short=player('short'),qualified=player('qualified'),best=player('best');s.players=[short,qualified,best];
 Object.assign(short.seasonByLevel.first.batting,{PA:1,AB:1,H:1});Object.assign(qualified.seasonByLevel.first.batting,{PA:4,AB:4,H:2});
 Object.assign(short.seasonByLevel.first.pitching,{outs:2,BF:3,ER:0});Object.assign(qualified.seasonByLevel.first.pitching,{outs:3,BF:6,ER:1,H:2});Object.assign(best.seasonByLevel.first.pitching,{outs:3,BF:4,ER:0,H:0});
 assert.equal(rows(s,'pro-first','batting','avg')[0].player.id,'qualified');assert.equal(rows(s,'pro-first','batting','avg').length,1);
 assert.deepEqual(rows(s,'pro-first','pitching','era').map(row=>row.player.id),['best','qualified']);assert.equal(rows(s,'pro-first','pitching','whip')[0].value,0);
 // Season totals or postseason performance cannot leak into level rankings.
 short.seasonStats.batting.HR=999;short.seasonPostseason=e.emptyRecord();short.seasonPostseason.batting.HR=999;assert.equal(rows(s,'pro-second','batting','HR').length,0);
 const copy=structuredClone(s);leagueLeaders(s,'pro-first','batting');assert.deepEqual(s,copy);
});
test('retired NPC details are discarded once while recent league totals and the user career remain available',()=>{
 const s=fixture(),me=player('me'),old=player('retired');s.players=[me,old];old.professional.employment='retired';old.seasonByLevel.first.batting.PA=20;old.seasonByLevel.first.batting.H=7;s.proWorld.archive=[old];
 me.professional.employment='retired';const before=evaluationLeague(s,2030,'first');
 assert.equal(discardRetiredPlayers(s),true);assert.deepEqual(s.players,[me]);assert.deepEqual(s.proWorld.archive,[]);assert.deepEqual(evaluationLeague(s,2030,'first'),before);
 assert.equal(discardRetiredPlayers(s),false);assert.deepEqual(evaluationLeague(s,2030,'first'),before);
 const legacy=player('legacy');legacy.professional.employment='retired';legacy.professional.agedYear=2029;legacy.career=[{year:2029,careerMode:'pro',byLevel:structuredClone(old.seasonByLevel)}];legacy.seasonByLevel.first.batting.H=999;s.proWorld.archive=[legacy];
 discardRetiredPlayers(s);assert.equal(s.proWorld.retiredRecords['2029:first'].batting.H,7);assert.equal(s.proWorld.retiredRecords['2030:first'].batting.H,7);
});
test('league page renders separate team and personal standings with clear empty states',()=>{
 const s=fixture();s.players=[player('me',10)];const html=renderToStaticMarkup(createElement(League,{state:s,onRecords(){}}));
 for(const text of ['1군','2군','2군 팀 순위','개인 순위','타자','투수','TOP 10','아직 기록이 없습니다.'])assert.ok(html.includes(text),text);
 for(const removed of ['구단 경기 기록','은퇴 선수','리그 현황','구단 방향과 선수 비용'])assert.ok(!html.includes(removed));
});
