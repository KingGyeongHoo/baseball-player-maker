import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),life=require('../.test-build/lib/sim/pro-season.js'),market=require('../.test-build/lib/sim/pro-market.js'),draft=require('../.test-build/lib/sim/draft.js'),outcome=require('../.test-build/lib/sim/draft-outcome.js');
const kind=process.argv[2]??'hitter',years=Number(process.argv[3]??10),pitching=kind==='pitcher'||kind==='injury';
let s=pc.acknowledgeCareer(pc.createProfessionalDemo(`long-${kind}`,`장기-${kind}`,pitching?'SP':'SS'));
let player=e.getPlayer(s);
if(kind==='lower'||kind==='late'){for(const key of ['contact','power','speed','defense'])player.stats[key]=kind==='late'?48:55;player.talent={pitching:7,batting:10};}
if(kind==='developmental'||kind==='specialist'){
 const input=e.createGame(`long-${kind}`,`장기-${kind}`,'SS'),p=e.getPlayer(input);p.grade=3;p.reputation=0;for(const key of ['contact','power','speed','defense'])p.stats[key]=kind==='specialist'?35:50;
 input.phase='ended';input.date=input.calendar.draftDate;input.draft=e.draftPlayers(input).filter(pick=>pick.playerId!==p.id);
 if(kind==='specialist')p.stats.power=99;else{const tail=input.draft.map(pick=>input.players.find(q=>q.id===pick.playerId)).sort((a,b)=>draft.draftAssessment(a)-draft.draftAssessment(b))[0];p.reputation=(draft.draftAssessment(tail)-draft.draftAssessment(p)-1)/.8;}
 s=pc.acknowledgeCareer(pc.continueCareer(outcome.revealDraftResult(input),'developmental'));player=e.getPlayer(s);
}
if(kind==='twoWay'){for(const key of Object.keys(player.stats))player.stats[key]=76;player.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};player.eligiblePositions.push('SP','RP','CP');}
if(kind==='injury')player.injury={severity:'severe',startDate:s.date,unavailableUntil:`${s.calendar.seasonYear}-05-01`,originalPenalty:8,penaltyRemaining:8,penaltyRecoverDays:15};
if(kind==='late'){player.age=26;player.professional.rookieYear=s.calendar.seasonYear-4;}
if(kind==='veteran'){player.age=35;player.professional.rookieYear=s.calendar.seasonYear-16;player.professional.faDays=900;player.professional.faEligible=true;for(const key of ['contact','power','speed','defense'])player.stats[key]=68;}
const id=player.id,rows=[],start=Date.now();let eventCount=0,notices=0,guard=0;
function acknowledge(){while(s.careerNotice){notices++;s=pc.acknowledgeCareer(s);}}
for(let year=0;year<years;year++){
 guard=0;
 while(s.phase!=='ended'&&guard++<350){acknowledge();if(s.careerEvent){eventCount++;s=e.answerCareerEvent(s,s.careerEvent.choices.at(-1).id);continue;}s=e.advanceWeek(s,e.getPlayer(s).trainingPolicy,e.getPlayer(s).stance);}
 assert.equal(s.phase,'ended','season completes');acknowledge();player=e.getPlayer(s);assert.equal(player.id,id);assert.equal(new Set(s.players.map(p=>p.id)).size,s.players.length);
 for(const p of s.players){if(!p.seasonByLevel)continue;const total=e.emptyRecord();e.mergeRecord(total,p.seasonByLevel.first);e.mergeRecord(total,p.seasonByLevel.second);assert.deepEqual(total,p.seasonStats);const byClub=e.emptyRecord();for(const r of Object.values(p.seasonByClub??{})){e.mergeRecord(byClub,r.first);e.mergeRecord(byClub,r.second);}assert.deepEqual(byClub,p.seasonStats);}
 const row={year:s.calendar.seasonYear,age:player.age,status:player.proContract.status,employment:player.professional.employment,primaryOvr:e.ovr(player),firstPA:player.seasonByLevel.first.batting.PA,firstOuts:player.seasonByLevel.first.pitching.outs,farmPA:player.seasonByLevel.second.batting.PA,farmOuts:player.seasonByLevel.second.pitching.outs,faDays:player.professional.faDays,active:s.players.filter(p=>p.teamId>=0).length,unattached:s.players.filter(p=>p.teamId<0).length,retired:s.proWorld.archive.length,forfeits:s.calendar.events.filter(g=>g.status==='forfeit').length,champion:s.proWorld.postseason?.champion};rows.push(row);console.log(JSON.stringify(row));
 if(s.proWorld.stage==='retired')break;
 const oldIds=new Set(s.players.map(p=>p.id)),oldAge=player.age;s=life.actOnProCareer(s,{type:'market'});acknowledge();const offers=s.proWorld.market.offers;
 for(let club=0;club<10;club++){assert.ok(market.clubRoster(s,club).length<=75,'club cap');assert.ok(s.players.filter(p=>p.teamId===club+10).length<=45,'farm cap');}
 if(!s.proWorld.market.settled){if(offers.length){const best=[...offers].sort((a,b)=>b.salary*b.years-a.salary*a.years)[0];s=life.actOnProCareer(s,{type:'accept',id:best.id});acknowledge();}else{s=life.actOnProCareer(s,{type:'unattached'});acknowledge();}}
 if(s.phase==='ended'){s=life.actOnProCareer(s,{type:'nextSeason'});acknowledge();}
 player=e.getPlayer(s);assert.equal(player.age,oldAge+1);assert.ok(oldIds.has(player.id));assert.equal(player.seasonStats.batting.PA,0);
 for(const active of s.players.filter(p=>p.teamId>=0))assert.ok(active.professional.contract&&active.professional.contract.startYear<=s.calendar.seasonYear&&active.professional.contract.endYear>=s.calendar.seasonYear,`active contract ${active.id}`);
 for(const club of s.proWorld.clubs)assert.ok(market.clubCost(s,club.id,s.calendar.seasonYear)<=club.budget,`budget ${club.id}`);
}
const version=s.balanceVersion.replace('-provisional',''),report={version,kind,requestedSeasons:years,completedSeasons:rows.length,elapsedSeconds:(Date.now()-start)/1000,events:eventCount,notices,rows,final:{stage:s.proWorld.stage,records:e.getPlayer(s).career.length,entry:e.getPlayer(s).professional.entry,converted:e.getPlayer(s).proContract.convertedDate??null,twoWay:!!e.getPlayer(s).twoWay}};
fs.mkdirSync('validation',{recursive:true});fs.writeFileSync(`validation/pro-career-v${version}-${kind}.json`,JSON.stringify(report,null,2)+'\n');console.log(`PASS ${kind} ${rows.length} seasons`);
