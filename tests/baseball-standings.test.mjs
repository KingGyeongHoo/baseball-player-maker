import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const {leagueStandings,advanceLeagueTiebreakers}=require('../.test-build/lib/sim/league-standings.js');
const {developmentCalendar}=require('../.test-build/lib/sim/pro-calendar.js');
const {upgradeProSchedule,needsProScheduleUpgrade}=require('../.test-build/lib/sim/pro-schedule.js');
function calendar(teams=[0,1]){return {seasonYear:2028,seasonEnd:'2028-09-10',trainingDays:[],events:[],competitions:[{id:'pro-first',kind:'league',startDate:'2028-03-28',endDate:'2028-09-10',participantTeamIds:teams}]};}
function game(c,a,b,score=[2,1],date='2028-09-10'){const g={id:'g'+c.events.length,date,homeTeamId:a,awayTeamId:b,competitionId:'pro-first',status:'completed',score,innings:[[],[]],lineup:[],boxScore:{}};c.events.push(g);return g;}
function record(c,id,w,l,d=0){for(let i=0;i<w;i++)game(c,id,99);for(let i=0;i<l;i++)game(c,id,99,[0,1]);for(let i=0;i<d;i++)game(c,id,99,[1,1]);}

test('winning percentage outranks total wins, excludes draws and uses wins as the second criterion',()=>{
 const c=calendar([0,1,2]);record(c,0,5,1,4);record(c,1,10,10);record(c,2,10,2);
 const rows=leagueStandings(c,'pro-first');assert.deepEqual(rows.map(r=>r.teamId),[2,0,1]);assert.equal(rows[1].played,10);assert.equal(rows[1].percentage,5/6);assert.equal(rows[0].gamesBehind,0);assert.equal(rows[2].gamesBehind,4);assert.ok(!('points' in rows[0]));
});
test('game difference follows the leader wins/losses, and tied records share a pending rank regardless of run difference',()=>{
 const c=calendar([0,1,2]);record(c,0,8,2);record(c,1,6,4);record(c,2,6,4);c.events.find(g=>g.homeTeamId===2).score=[100,0];
 const rows=leagueStandings(c,'pro-first');assert.equal(rows[0].gamesBehind,0);assert.equal(rows[1].gamesBehind,2);assert.equal(rows[2].gamesBehind,2);assert.equal(rows[1].rank,2);assert.equal(rows[2].rank,2);assert.ok(rows[1].tiePending&&rows[2].tiePending);
});
test('a real tiebreaker resolves equal percentage and wins without changing regular standings totals',()=>{
 const c=calendar();game(c,0,1);game(c,1,0);assert.equal(advanceLeagueTiebreakers(c,'pro-first','2028-09-10'),true);
 const tb=c.events.find(g=>g.tiebreaker);assert.ok(tb);assert.notEqual(new Date(tb.date).getUTCDay(),1);tb.status='completed';tb.score=[0,1];assert.equal(advanceLeagueTiebreakers(c,'pro-first',tb.date),false);
 const rows=leagueStandings(c,'pro-first');assert.deepEqual(rows.map(r=>r.teamId),[1,0]);assert.deepEqual(rows.map(r=>r.rank),[1,2]);assert.ok(rows.every(r=>r.played===2&&r.wins===1&&r.losses===1&&!r.tiePending));
 const count=c.events.length;advanceLeagueTiebreakers(c,'pro-first',tb.date);assert.equal(c.events.length,count);
});
test('a tied tiebreaker remains recorded and schedules a rematch, while three-team ties resolve through games',()=>{
 const c=calendar([0,1,2]);game(c,0,1);game(c,1,2);game(c,2,0);advanceLeagueTiebreakers(c,'pro-first','2028-09-10');
 const first=c.events.find(g=>g.tiebreaker);first.status='completed';first.score=[1,1];advanceLeagueTiebreakers(c,'pro-first',first.date);assert.deepEqual(first.score,[1,1]);
 for(let guard=0;guard<10&&c.competitions[0].tiebreaks.some(t=>!t.done);guard++){const g=c.events.find(g=>g.tiebreaker&&g.status==='scheduled');assert.ok(g);g.status='completed';g.score=[0,1];advanceLeagueTiebreakers(c,'pro-first',g.date);}
 assert.ok(c.competitions[0].tiebreaks.every(t=>t.done));assert.equal(new Set(leagueStandings(c,'pro-first').map(r=>r.rank)).size,3);
});
test('unfinished or future regular games do not generate premature tiebreakers',()=>{
 const c=calendar();game(c,0,1);const g=game(c,1,0);g.status='inProgress';assert.equal(advanceLeagueTiebreakers(c,'pro-first','2028-09-10'),false);assert.ok(!c.events.some(g=>g.tiebreaker));
});
test('pro seasons have Monday off and two three-game series per week with balanced home dates',()=>{
 for(const year of [2028,2030]){const c=developmentCalendar(year,true);assert.equal(c.events.length,1350);assert.ok(c.events.filter(g=>!g.exhibition).every(g=>new Date(g.date).getUTCDay()!==(g.competitionId==='pro-second'?4:1)));assert.ok(c.trainingDays.every(d=>new Date(d).getUTCDay()!==1));
  for(let team=0;team<20;team++){const games=c.events.filter(g=>!g.exhibition&&[g.homeTeamId,g.awayTeamId].includes(team));assert.equal(games.length,team<10?144:117);assert.ok(Math.abs(games.filter(g=>g.homeTeamId===team).length-games.length/2)<=.5);if(team>=10)continue;
    for(let i=0;i<games.length;i+=3){const set=games.slice(i,i+3);assert.equal(set.length,3);assert.ok([2,5].includes(new Date(set[0].date).getUTCDay()));assert.ok(set.every(g=>g.homeTeamId===set[0].homeTeamId&&g.awayTeamId===set[0].awayTeamId));assert.equal(set[2].date,e.addDays(set[0].date,2));if(i>=3)assert.notEqual(games[i-3].homeTeamId+games[i-3].awayTeamId,set[0].homeTeamId+set[0].awayTeamId);}
  }
 }
});
test('old future schedules are rebuilt without changing completed games, counts or players',()=>{
 const c=developmentCalendar(2028,true);delete c.proSeriesVersion;const s={careerMode:'pro',calendar:c,proWorld:{stage:'regular',regularEnd:c.seasonEnd},date:c.events[30].date,players:[]};
 for(const g of c.events)if(g.date<s.date){g.status='completed';g.score=[2,1];}
 const completed=structuredClone(c.events.filter(g=>g.status==='completed')),counts=Array.from({length:20},(_,id)=>c.events.filter(g=>[g.homeTeamId,g.awayTeamId].includes(id)).length);
 assert.equal(needsProScheduleUpgrade(s),true);assert.equal(upgradeProSchedule(s),true);assert.deepEqual(c.events.filter(g=>g.status==='completed'),completed);assert.deepEqual(Array.from({length:20},(_,id)=>c.events.filter(g=>[g.homeTeamId,g.awayTeamId].includes(id)).length),counts);
 assert.ok(c.events.filter(g=>g.status==='scheduled'&&!g.exhibition).every(g=>new Date(g.date).getUTCDay()!==(g.competitionId==='pro-second'?4:1)));assert.equal(upgradeProSchedule(s),false);
});
