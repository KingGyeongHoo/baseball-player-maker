import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const a=require('../.test-build/lib/sim/pro-allstar.js'),c=require('../.test-build/lib/sim/pro-allstar-calendar.js'),calendar=require('../.test-build/lib/sim/pro-calendar.js');
const save=require('../.test-build/lib/career-save.js'),League=require('../.test-build/app/components/pro-league.js').default;
const Allstar=require('../.test-build/app/components/pro-allstar.js').default;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('allstar-rules','올스타선수','SS'));
function fixture(){const s=structuredClone(template);s.date='2028-05-01';s.careerNotice=undefined;s.noticeQueue=[];s.proWorld.stage='regular';
 const mine=e.getPlayer(s);mine.teamId=0;s.postSchool.pro.club=0;s.postSchool.pro.level='first';for(const k of Object.keys(mine.stats))mine.stats[k]=95;
 for(const p of s.players){p.fatigue=0;p.forcedRest=false;p.injury=null;p.lastPitched=null;if(p.teamId<0||p.teamId>=20)continue;
  const r=p.seasonByLevel[p.teamId<10?'first':'second'];Object.assign(r.batting,{PA:90,AB:80,H:28,BB:10,HR:3,RBI:15});Object.assign(r.pitching,{BF:90,outs:60,H:15,BB:5,SO:25,ER:4});
 }
 return s;
}
function selected(){const s=fixture();for(const date of a.allstarVotingDates(2028)){s.date=date;a.updateAllstarVotes(s,true);}a.finalizeAllstars(s);s.careerNotice=undefined;s.noticeQueue=[];return s;}

test('alliances and yearly Friday/Saturday break dates are exact across calendar years',()=>{
 for(const club of [0,9,7,3,4])assert.equal(a.allstarSide(club),'blue');for(const club of [1,8,6,2,5])assert.equal(a.allstarSide(club),'white');
 for(let year=2027;year<=2040;year++){const d=c.allstarDates(year);assert.equal(new Date(d.second).getUTCDay(),5);assert.ok(Number(d.second.slice(-2))>=8&&Number(d.second.slice(-2))<=14);assert.equal(e.addDays(d.second,1),d.first);assert.equal(e.addDays(d.first,1),d.restStart);assert.equal(new Date(d.restEnd).getUTCDay(),4);assert.equal(new Date(d.resume).getUTCDay(),5);}
});

test('both regular leagues preserve game totals, home balance, 3-game opponents and break while second spans the season',()=>{
 for(const year of [2027,2028,2029]){const cal=calendar.developmentCalendar(year,true),d=c.allstarDates(year);
  for(const [id,n] of [['pro-first',144],['pro-second',117]])for(let team=id==='pro-first'?0:10;team<(id==='pro-first'?10:20);team++){
   const games=cal.events.filter(g=>g.competitionId===id&&[g.homeTeamId,g.awayTeamId].includes(team));assert.equal(games.length,n);assert.ok(Math.abs(games.filter(g=>g.homeTeamId===team).length-n/2)<=.5);
   assert.ok(games.every(g=>new Date(g.date).getUTCDay()!==(id==='pro-second'?4:1)&&!c.allstarBreak(g.date,year)));
   if(id==='pro-first')for(let i=0;i<games.length;i+=3){assert.equal(games[i].homeTeamId,games[i+2].homeTeamId);assert.equal(games[i].awayTeamId,games[i+2].awayTeamId);assert.equal(e.addDays(games[i].date,2),games[i+2].date);}
   if(id==='pro-second'){assert.ok(games.some(g=>g.date<d.second));assert.ok(games.some(g=>g.date>d.restEnd));assert.ok(games.at(-1).date<cal.competitions.find(c=>c.id==='pro-first').endDate);}
  }
  assert.ok(cal.trainingDays.every(date=>date<d.restStart||date>d.restEnd));assert.equal(cal.proAllstarScheduleVersion,1);
 }
});

test('nominations have one player per club and category, cumulative biweekly votes and no RNG use',()=>{
 const s=fixture(),rng={...s.rngStates};a.updateAllstarVotes(s);const season=s.proWorld.allstar;assert.equal(season.lastUpdated,'2028-05-01');
 for(const level of a.allstarLevels)for(const side of a.allstarSides)for(const slot of a.allstarSlots){const rows=a.allstarBallot(s,level,side,slot);assert.equal(rows.length,5,`${level} ${side} ${slot}`);assert.equal(new Set(rows.map(r=>r.club)).size,5);}
 const before=structuredClone(season);s.date='2028-05-14';a.updateAllstarVotes(s);assert.deepEqual(season,before);s.date='2028-05-15';a.updateAllstarVotes(s);assert.ok(a.allstarBallot(s,'first','blue','SS')[0].votes>a.allstarBallot({...s,proWorld:{...s.proWorld,allstar:before}},'first','blue','SS')[0].votes);
 const repeated=structuredClone(season);a.updateAllstarVotes(s);assert.deepEqual(season,repeated);assert.deepEqual(s.rngStates,rng);
});

test('no appearances means no candidacy, and moving leagues does not transfer votes',()=>{
 const s=fixture(),p=e.getPlayer(s);p.seasonByLevel.first=e.emptyRecord();a.updateAllstarVotes(s);assert.ok(!a.allstarBallot(s,'first','blue','SS').some(r=>r.playerId===p.id));
 Object.assign(p.seasonByLevel.first.batting,{PA:20,AB:18,H:8});s.date='2028-05-15';a.updateAllstarVotes(s);const first=a.allstarBallot(s,'first','blue','SS').find(r=>r.playerId===p.id).votes;
 p.teamId=10;Object.assign(p.seasonByLevel.second.batting,{PA:4,AB:4,H:1});s.date='2028-05-29';a.updateAllstarVotes(s);assert.equal(a.allstarBallot(s,'first','blue','SS').find(r=>r.playerId===p.id).votes,first);assert.ok(a.allstarBallot(s,'second','blue','SS').find(r=>r.playerId===p.id).votes>0);
});

test('June finalization selects 12 voted plus 10 recommended per side per league, without duplicate players',()=>{
 const s=selected(),season=s.proWorld.allstar,ids=[];
 for(const level of a.allstarLevels)for(const side of a.allstarSides){const rows=season.levels[level][side].roster;assert.equal(rows.length,22);assert.equal(rows.filter(r=>r.method==='vote').length,12);assert.equal(rows.filter(r=>r.method==='manager').length,10);ids.push(...rows.map(r=>r.playerId));
  assert.ok(rows.every(r=>a.allstarSide(r.club)===side));assert.ok(rows.filter(r=>['SP','RP','CP'].includes(r.slot)).length>=6);assert.ok(rows.filter(r=>r.slot==='C').length>=2);
 }
 assert.equal(new Set(ids).size,88);assert.equal(season.finalizedAt,'2028-06-30');const before=structuredClone(s);assert.equal(a.finalizeAllstars(s),false);assert.deepEqual(s,before);
 const p=e.getPlayer(s);assert.equal(p.professional.allstarHistory.length,1);assert.equal(p.professional.allstarBonus,undefined);assert.equal(p.reputation,null);
 const clone=structuredClone(p);clone.reputation=100;clone.professional.allstarBonus=8;assert.equal(e.selectionScore(clone),e.selectionScore(p));assert.equal(e.reputationScore(p),null);
});

test('frozen selection honors June registration and injuries receive eligible replacements without erasing honors',()=>{
 const s=selected(),old=s.proWorld.allstar.levels.second.blue.roster[0],p=s.players.find(p=>p.id===old.playerId);p.injury={severity:'mild',startDate:'2028-07-01',unavailableUntil:'2028-08-01',originalPenalty:1,penaltyRemaining:1,penaltyRecoverDays:7};
 s.date=c.allstarDates(2028).second;a.playAllstarDay(s);const entry=s.proWorld.allstar.levels.second;assert.ok(entry.blue.withdrawn.includes(p.id));assert.ok(!entry.blue.roster.some(r=>r.playerId===p.id));assert.equal(p.professional.allstarHistory[0].withdrawn,true);assert.equal(p.professional.allstarBonus,undefined);assert.ok(entry.blue.roster.some(r=>r.replacementFor===p.id));
 const all=a.allstarLevels.flatMap(l=>a.allstarSides.flatMap(side=>s.proWorld.allstar.levels[l][side].roster.map(r=>r.playerId)));assert.equal(new Set(all).size,all.length);
});

test('real exhibition records and MVP preserve regular stats, standings, registration, recent form and match RNG',()=>{
 const s=selected(),records=new Map(s.players.map(p=>[p.id,{season:structuredClone(p.seasonStats),levels:structuredClone(p.seasonByLevel),recent:structuredClone(p.recentAppearances),firsts:structuredClone(p.professional.firsts),fa:p.professional.faDays,team:p.teamId}])),rng={...s.rngStates},teams=structuredClone(s.teams);
 s.date=c.allstarDates(2028).second;a.playAllstarDay(s);const entry=s.proWorld.allstar.levels.second;assert.equal(entry.game.status,'completed');assert.ok(entry.game.innings[0].length<=9&&entry.game.innings[1].length<=9);assert.ok(Object.values(entry.game.boxScore).some(r=>r.batting.PA>0));assert.ok(entry.mvp);
 assert.ok([...entry.blue.roster,...entry.white.roster].some(row=>row.method==='manager'&&(entry.game.boxScore[row.playerId]?.batting.PA??0)>0));
 for(const p of s.players){const old=records.get(p.id);assert.deepEqual(p.seasonStats,old.season);assert.deepEqual(p.seasonByLevel,old.levels);assert.deepEqual(p.recentAppearances,old.recent);assert.deepEqual(p.professional.firsts,old.firsts);assert.equal(p.professional.faDays,old.fa);assert.equal(p.teamId,old.team);}
 assert.deepEqual(s.teams,teams);assert.deepEqual(s.rngStates,rng);const before=structuredClone(s);a.playAllstarDay(s);assert.deepEqual(s,before);
});

test('July preparation, result events and loaded exhibition results settle once without rerolls',()=>{
 const s=selected(),p=e.getPlayer(s);s.date='2028-07-01';assert.equal(a.prepareAllstarDay(s),true);assert.match(s.careerEvent.definitionId,/AS-PREP/);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state,answered=e.answerCareerEvent(restored,'routine');assert.equal(a.prepareAllstarDay(answered),false);
 answered.date=c.allstarDates(2028).first;assert.equal(a.playAllstarDay(answered),true);assert.match(answered.careerEvent.definitionId,/AS-RESULT/);assert.ok(answered.proWorld.allstar.levels.first.game.boxScore[p.id].batting.PA>0);
 const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(answered))).state,done=e.answerCareerEvent(loaded,'remember'),rng={...done.rngStates};assert.equal(a.playAllstarDay(done),false);assert.deepEqual(done.rngStates,rng);assert.equal(done.proWorld.allstar.levels.first.game.status,'completed');
});

test('calendar upgrade moves only future games, retains completed records and counts, and is idempotent',()=>{
 const s=fixture();delete s.calendar.proAllstarScheduleVersion;s.date='2028-04-01';const completed=s.calendar.events.find(g=>g.date<s.date);completed.status='completed';completed.score=[7,3];const before=structuredClone(completed),counts=new Map(s.teams.map(t=>[t.id,s.calendar.events.filter(g=>[g.homeTeamId,g.awayTeamId].includes(t.id)).length]));
 assert.equal(c.upgradeAllstarSchedule(s),true);assert.deepEqual(s.calendar.events.find(g=>g.id===before.id),before);for(const t of s.teams)assert.equal(s.calendar.events.filter(g=>[g.homeTeamId,g.awayTeamId].includes(t.id)).length,counts.get(t.id));assert.ok(s.calendar.events.filter(g=>g.status==='scheduled'&&g.date>=s.date).every(g=>!c.allstarBreak(g.date,2028)));assert.equal(c.upgradeAllstarSchedule(s),false);
});

test('awards allstar page opens voting from May without a league modal, and late adoption does not replay games',()=>{
 const s=fixture();s.date='2028-04-30';assert.match(renderToStaticMarkup(createElement(Allstar,{state:s,onRecords(){}})),/5월 1일부터/);s.date='2028-05-01';const html=renderToStaticMarkup(createElement(Allstar,{state:s,onRecords(){}}));assert.match(html,/투표 현황/);assert.match(html,/BLUE Team/);assert.doesNotMatch(html,/<dialog/);assert.doesNotMatch(renderToStaticMarkup(createElement(League,{state:s,onRecords(){}})),/>올스타<\/button>/);
 delete s.proWorld.allstar;s.date='2028-08-01';a.prepareAllstarDay(s);assert.equal(s.proWorld.allstar.skipped,true);assert.equal(s.proWorld.allstar.levels.first.game,undefined);
});

test('weekly progression applies extra injury risk only to actual exhibition players and records no official game',()=>{
 const s=selected();s.date=c.allstarDates(2028).second;const p=e.getPlayer(s),before=structuredClone(p.seasonStats),teams=structuredClone(s.teams);
 for(const club of s.proWorld.clubs)club.nextReview='2099-01-01';
 const settings={'pro_events.enabled':0,'events.weekly_chance':0,'events.focus_chance':0,'injury.training_base_risk':0,'injury.risk_at60':0,'injury.risk_slope60':0,'injury.risk_at80':0,'injury.risk_slope80':0},old=Object.fromEntries(Object.keys(settings).map(key=>[key,e.params[key]])),extra=a.allstarRules.injuryExtra;
 try{Object.assign(e.params,settings);a.allstarRules.injuryExtra=1;
  let next=s,guard=0;while(next.week===s.week&&guard++<30){while(next.careerNotice)next=pc.acknowledgeCareer(next);assert.equal(next.careerEvent,null);next=e.advanceWeek(next,e.getPlayer(next).trainingPolicy,e.getPlayer(next).stance);}
  assert.equal(next.week,s.week+1);const game=next.proWorld.allstar.levels.first.game;assert.equal(game.status,'completed');assert.ok(e.getPlayer(next).injury);assert.equal(e.getPlayer(next).professional.firsts.debut,undefined);assert.deepEqual(e.getPlayer(next).seasonStats,before);assert.deepEqual(next.teams,teams);assert.equal(next.report.records.batting.PA,0);assert.equal(next.report.records.pitching.BF,0);
  const played=new Set([...Object.keys(next.proWorld.allstar.levels.first.game.boxScore),...Object.keys(next.proWorld.allstar.levels.second.game.boxScore)]);assert.ok(next.players.filter(p=>!played.has(p.id)).every(p=>!p.injury));
 }finally{Object.assign(e.params,old);a.allstarRules.injuryExtra=extra;}
});

test('allstar honors and match results survive season archival while the next season starts fresh',()=>{
 const life=require('../.test-build/lib/sim/pro-season.js'),s=selected(),p=e.getPlayer(s);s.date=c.allstarDates(2028).first;a.playAllstarDay(s);s.careerEvent=null;s.careerNotice=undefined;s.noticeQueue=[];s.date=s.proWorld.regularEnd;
 const game=structuredClone(s.proWorld.allstar.levels.first.game),history=structuredClone(p.professional.allstarHistory);life.closeProfessionalSeason(s);assert.deepEqual(s.proWorld.seasons.at(-1).allstar.levels.first.game,game);
 p.professional.contract.endYear=2030;s.careerNotice=undefined;s.noticeQueue=[];life.startNextProSeason(s);assert.equal(s.calendar.seasonYear,2029);assert.equal(s.proWorld.allstar,undefined);assert.deepEqual(p.professional.allstarHistory,history);a.ensureAllstarSeason(s);assert.equal(s.proWorld.allstar.year,2029);assert.equal(s.proWorld.allstar.finalizedAt,undefined);
});

test('selection growth is awarded once and future migration waits until an active week is finished',()=>{
 const s=fixture(),p=e.getPlayer(s);p.stats.bq=Math.min(p.stats.bq,90);const initial=p.stats.bq;s.date='2028-06-30';a.finalizeAllstars(s);assert.ok(p.stats.bq>initial);const grown=p.stats.bq;assert.equal(a.finalizeAllstars(s),false);assert.equal(p.stats.bq,grown);
 delete s.calendar.proAllstarScheduleVersion;s.weekProgress={};const before=structuredClone(s.calendar.events);assert.equal(c.upgradeAllstarSchedule(s),false);assert.deepEqual(s.calendar.events,before);
});

test('optional allstar technical exchanges and review can grow role skills without changing actual records',()=>{
 const s=selected(),p=e.getPlayer(s);s.date='2028-07-01';a.prepareAllstarDay(s);const learn=s.careerEvent.choices.find(c=>c.id==='learn');assert.equal(learn.outcomes[0].weight,60);assert.equal(learn.outcomes[1].weight,40);assert.ok(learn.outcomes[0].weeks);
 for(let seed=0;seed<10000;seed++){const q={rngStates:{...s.rngStates,events:seed}};if(e.random(q,'events')<.6){s.rngStates.events=seed;break;}}
 const before=structuredClone(p.seasonStats),done=e.answerCareerEvent(s,'learn');assert.ok(Object.values(done.careerEventHistory.at(-1).stats).some(n=>n>0));assert.deepEqual(e.getPlayer(done).seasonStats,before);
 done.date=c.allstarDates(2028).first;a.playAllstarDay(done);const review=done.careerEvent.choices.find(c=>c.id==='review');assert.equal(review.outcomes[0].weeks.contact,1);assert.equal(review.outcomes[0].weight,30);
});
