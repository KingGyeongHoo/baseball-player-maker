import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),life=require('../.test-build/lib/sim/pro-season.js'),world=require('../.test-build/lib/sim/pro-world.js');
const q=require('../.test-build/lib/sim/pro-squads.js'),r=require('../.test-build/lib/roster-records.js'),{RosterTable}=require('../.test-build/app/components/player-roster.js');
e.params['pro_events.enabled']=0;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('four-squads','새신인','SS'));
const fixture=()=>structuredClone(template);
const skills=(p,n)=>{for(const key of Object.keys(p.stats))p.stats[key]=n;p.recentZ=0;p.fatigue=0;p.forcedRest=false;p.injury=null;};
test('regular rookies start in the third squad at full growth, with no independent third or developmental schedule',()=>{
 const s=fixture(),p=e.getPlayer(s);assert.equal(q.proSquad(p.teamId),'third');assert.equal(s.postSchool.pro.level,'third');assert.equal(e.growthMultiplier(p),1);assert.equal(s.teams.length,40);
 assert.ok(s.calendar.events.every(g=>g.homeTeamId<20&&g.awayTeamId<20));assert.ok(!s.calendar.competitions.some(c=>/third|developmental/.test(c.id)));
 for(const rookie of s.players.filter(p=>p.professional.rookieYear===s.calendar.seasonYear))assert.equal(q.proSquad(rookie.teamId),rookie.proContract.status==='developmental'?'developmental':'third');
});
test('annual intake is split 90/10, salaries and growth follow status, and repeated drafts add nobody',()=>{
 const s=fixture(),old=new Set(s.players.map(p=>p.id)),year=s.calendar.seasonYear+1;life.addRookieClass(s,year);const added=s.players.filter(p=>!old.has(p.id)),dev=added.filter(p=>p.proContract.status==='developmental');
 assert.ok(added.length>=90&&added.length<=110);assert.equal(dev.length,Math.round(added.length*.1));
 for(const p of added){const d=p.proContract.status==='developmental';assert.equal(q.proSquad(p.teamId),d?'developmental':'third');assert.equal(e.growthMultiplier(p),d?.9:1);assert.equal(p.professional.contract.salary,d?30_000_000:50_000_000);}
 const ids=s.players.map(p=>p.id);life.addRookieClass(s,year);assert.deepEqual(s.players.map(p=>p.id),ids);life.settleNPCFreeAgents(s,year);assert.equal(s.players.filter(p=>!old.has(p.id)&&p.professional.rookieYear===year).length,added.length);
});
test('one-time organization respects the second-team promotion step and preserves records and contracts',()=>{
 const s=fixture();delete s.proWorld.squadsVersion;const club=0,members=s.players.filter(p=>p.teamId>=0&&p.teamId%10===club&&p.position==='SS');
 const high=members[0],low=members[1],dev=members[2];skills(high,90);skills(low,35);skills(dev,99);high.teamId=20;low.teamId=0;dev.teamId=0;dev.proContract.status='developmental';
 const before=new Map(s.players.map(p=>[p.id,{team:p.teamId,stats:structuredClone(p.stats),records:structuredClone(p.seasonStats),contract:structuredClone(p.professional.contract)}])),rng={...s.rngStates};
 assert.equal(q.reorganizeProSquads(s),true);assert.equal(q.proSquad(high.teamId),'second');assert.equal(q.proSquad(dev.teamId),'developmental');
 for(let club=0;club<10;club++){assert.ok(s.players.filter(p=>p.teamId===club).length<=30);assert.ok(s.players.filter(p=>p.teamId===club+10).length<=30);}
 for(const p of s.players){if(p.teamId>=0&&p.teamId<10)assert.ok(before.get(p.id).team<20);assert.deepEqual(p.stats,before.get(p.id).stats);assert.deepEqual(p.seasonStats,before.get(p.id).records);assert.deepEqual(p.professional.contract,before.get(p.id).contract);}
 assert.deepEqual(s.rngStates,rng);assert.equal(q.reorganizeProSquads(s),false);
});
test('at equal selection scores third-squad players precede developmental players for promotion',()=>{
 const s=fixture(),third=e.getPlayer(s),dev=s.players.find(p=>p.id!==third.id);skills(third,76);skills(dev,82);third.teamId=20;third.proContract.status='regular';dev.teamId=30;dev.proContract.status='developmental';s.players=[dev,third];
 assert.equal(e.selectionScore(third),e.selectionScore(dev));assert.deepEqual(q.reservePromotionCandidates(s,0).map(p=>p.id),[third.id,dev.id]);
});
test('a reserve can play a real second-team evaluation without changing squads and gets only real records',()=>{
 const s=fixture(),p=e.getPlayer(s),team=p.teamId,club=team%10;skills(p,80);const game=s.calendar.events.find(g=>g.competitionId==='pro-second'&&[g.homeTeamId,g.awayTeamId].includes(club+10));s.date=game.date;s.proWorld.stage='regular';
 // Isolate this reserve's turn; other players have already had real appearances.
 for(const other of s.players)if(other.id!==p.id&&other.professional)other.professional.lastAppearance=e.addDays(s.date,-1);
 for(const other of s.players)if(other.id!==p.id&&other.teamId>=10&&other.teamId%10===club&&other.position===p.position)other.trainingPolicy.mode='rest';
 world.prepareEvaluationOpportunities(s,[game.id]);assert.ok(game.evaluationPlayers.includes(p.id));e.simulateGame(s,game,[game.homeTeamId,game.awayTeamId].map(team=>s.players.filter(p=>p.teamId===team)));
 assert.equal(game.status,'completed');assert.equal(p.teamId,team);assert.ok(p.seasonByLevel.second.batting.PA>0);assert.equal(p.seasonStats.games.batting,1);assert.equal(game.proAppearances[p.id].teamId,club+10);assert.equal(p.professional.faDays,0);
 const later=s.calendar.events.find(g=>g.competitionId==='pro-second'&&g.date>game.date&&[g.homeTeamId,g.awayTeamId].includes(club+10));s.date=later.date;world.prepareEvaluationOpportunities(s,[later.id]);assert.ok(!later.evaluationPlayers.includes(p.id));
 const html=renderToStaticMarkup(createElement(RosterTable,{state:s,players:[p],field:'batting',level:'third',assignments:new Map([[p.id,true]]),onSelect(){}}));assert.match(html,/잔류/);assert.doesNotMatch(html,/주전|후보/);assert.match(html,/출전평가/);
});
test('pro grade boundaries center C on 76 and use the same rounded score shown in the roster',()=>{
 for(const [score,grade] of [[70.9,'F'],[71,'E'],[72.9,'E'],[73,'D'],[74.9,'D'],[75,'C'],[76,'C'],[76.9,'C'],[77,'B'],[78.9,'B'],[79,'A'],[81,'A'],[81.1,'S'],[81.04,'A'],[81.06,'S'],[null,'—']])assert.equal(r.rosterGrade(score,true),grade);
 assert.equal(r.rosterGrade(76,false),'A');
});
