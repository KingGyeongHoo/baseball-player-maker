import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const i=require('../.test-build/lib/sim/injury-system.js'),{injuryRules:r,injuryGrade}=require('../.test-build/lib/sim/injury-rules.js');
const {settleInjuryRetirements}=require('../.test-build/lib/sim/injury-career.js');
const save=require('../.test-build/lib/career-save.js');
const template=e.createGame('extended-injury','재활선수','SS');
function fixture(){const s=structuredClone(template),p=e.getPlayer(s);s.players=[p];s.calendar.events=[];s.calendar.competitions=[];s.careerEvent=null;delete s.careerNotice;p.fatigue=0;p.forcedRest=false;return {s,p};}
function exposure(s,key='test',fatigue=40){return {...i.emptyInjuryLoad(),key,date:s.date,cause:'training',fatigue,training:1};}
function inj(s,p,n,body='leg',key='test'){return i.beginInjury(s,p,exposure(s,key),n,body);}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('duration boundaries keep 365 playable after recovery and retire at 366 without clipping',()=>{
 for(const [n,grade] of [[3,'mild'],[14,'mild'],[15,'moderate'],[89,'moderate'],[90,'major'],[179,'major'],[180,'severe'],[365,'severe'],[366,'careerEnding'],[540,'careerEnding']]){
  const {s,p}=fixture(),row=inj(s,p,n);assert.equal(injuryGrade(n),grade);assert.equal(row.requiredDays,n);assert.equal(row.severity,grade);assert.equal(row.retired,n>365);assert.equal(i.validInjuryData(p),true);
  if(n>365){settleInjuryRetirements(s);assert.equal(p.injuryRetirement.handled,false);s.phase='ended';settleInjuryRetirements(s);assert.match(s.careerNotice.message,new RegExp(`${n}일`));const old=structuredClone(s);settleInjuryRetirements(s);assert.deepEqual(s,old);}
  else {assert.equal(p.injuryRetirement,undefined);assert.equal(e.available(p,e.addDays(s.date,n)),true);}
 }
});
test('occurrence and severity rise independently with fatigue and short durations dominate',()=>{
 const {s,p}=fixture(),low=i.injuryRiskEstimate(p,exposure(s,'low',0)),high=i.injuryRiskEstimate(p,exposure(s,'high',90));assert(high.probability>low.probability);assert(high.probability<1);
 const conditional=f=>{const a=i.injurySeverityWeights(f);return 1-a[0].weight/a.reduce((n,x)=>n+x.weight,0);};assert(conditional(90)>conditional(0));
 const stats=[];for(const fatigue of [0,90]){let count=0,long=0,ending=0,total=0;for(let n=0;n<100000;n++){const d=i.drawInjuryDuration(fatigue,()=>e.random(s,'injury'));count+=d>=15;long+=d>=90;ending+=d>365;total+=d;}stats.push({count,long,ending,total});}
 assert(stats[0].count>8500&&stats[0].count<11500);assert(stats[1].count>stats[0].count*2);assert(stats[1].ending<300);assert(stats[0].total/100000<13);
});
test('same action key cannot reroll, add workload or apply permanent changes twice',()=>{
 const {s,p}=fixture();inj(s,p,180,'arm');const saved=structuredClone(s);inj(s,p,366,'arm');assert.deepEqual(s,saved);
 const action=exposure(s,'work',0);i.assessInjuryExposure(s,p,action);const checkpoint=structuredClone(s);i.assessInjuryExposure(s,p,action);assert.deepEqual(s,checkpoint);
});
test('accumulated absence never triggers retirement; same-body recurrence links a new episode',()=>{
 const {s,p}=fixture();const first=inj(s,p,180,'leg');s.date=e.addDays(s.date,230);i.advanceInjuryRecovery(p,s.date);const second=inj(s,p,180,'leg','second');s.date=e.addDays(s.date,230);i.advanceInjuryRecovery(p,s.date);const third=inj(s,p,14,'leg','third');
 assert.equal(second.previousId,first.id);assert.equal(third.previousId,second.id);assert.equal(p.injuryRetirement,undefined);assert.equal(i.validInjuryData(p),true);
});
test('overlapping new injury never shortens absence or lifts another body restriction',()=>{
 const {s,p}=fixture();inj(s,p,90,'arm');s.date=e.addDays(s.date,50);const last=inj(s,p,7,'leg','new');const until=p.injury.unavailableUntil;s.date=e.addDays(s.date,4);i.advanceInjuryRecovery(p,s.date);
 assert.equal(until,e.addDays(template.date,90));assert.equal(i.injuryView(p,s.date).stage,'rehab');const plan=i.injuryTrainingPolicy(p,p.trainingPolicy,s.date);assert.equal(plan.tickets.velocity,0);assert.equal(plan.tickets.speed,0);
 i.advanceInjuryRecovery(p,until);assert.equal(last.returnedOn,until);assert.equal(last.missedDays,40);assert.equal(p.injuryRetirement,undefined);
});
test('treatment forbids training, rehab permits only limited safe growth, and adaptation decays without overwriting raw abilities',()=>{
 const {s,p}=fixture();const row=inj(s,p,14,'hand'),stats={...p.stats},talent={...p.talent};
 assert.equal(i.injuryTrainingPolicy(p,p.trainingPolicy,s.date).mode,'rest');
 s.date=row.treatmentUntil;i.advanceInjuryRecovery(p,s.date);const policy=i.injuryTrainingPolicy(p,p.trainingPolicy,s.date);assert.equal(policy.tickets.contact,0);assert.equal(policy.tickets.power,0);assert.equal(policy.tickets.physical,0);assert(Object.values(policy.tickets).every(n=>n<=1));
 e.train(p,.2,policy,true);assert.equal(p.stats.contact,stats.contact);assert.equal(p.stats.power,stats.power);assert.deepEqual(p.talent,talent);
 s.date=row.unavailableUntil;i.advanceInjuryRecovery(p,s.date);assert.equal(e.available(p,s.date),true);assert.equal(row.returnedOn,s.date);const initial=e.effective(p).contact;i.advanceInjuryRecovery(p,e.addDays(s.date,3));assert(e.effective(p).contact>initial);assert.equal(p.stats.contact,stats.contact);
 i.advanceInjuryRecovery(p,row.adaptationUntil);assert.equal(p.injury,null);assert.equal(row.state,'healthy');assert.equal(row.missedDays,14);
});
test('permanent loss applies once to related stats and survives saves; talent is unchanged',()=>{
 const {s,p}=fixture(),old=r.maxPermanentChance,chance=r.grades.major.permanentChance;try{r.maxPermanentChance=1;r.grades.major.permanentChance=1;const before={...p.stats},talent={...p.talent};const row=inj(s,p,90,'arm');assert(Object.keys(row.permanent).length>0);assert(p.stats.velocity<before.velocity);assert.equal(p.stats.contact,before.contact);assert.deepEqual(p.talent,talent);const after={...p.stats};i.advanceInjuryRecovery(p,e.addDays(s.date,140));i.advanceInjuryRecovery(p,e.addDays(s.date,140));assert.deepEqual(p.stats,after);
 const decoded=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;assert.deepEqual(e.getPlayer(decoded).stats,after);assert.deepEqual(e.getPlayer(decoded).injuryHistory,p.injuryHistory);
 }finally{r.maxPermanentChance=old;r.grades.major.permanentChance=chance;}
});
test('recovery dates survive round trips, offseason date jumps and year crossings without random draws',()=>{
 const {s,p}=fixture();s.date='2027-12-20';const row=inj(s,p,90,'trunk'),rng={...s.rngStates};const decoded=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state,q=e.getPlayer(decoded);assert.deepEqual(q.injuryHistory,p.injuryHistory);assert.deepEqual(decoded.rngStates,rng);
 i.advanceInjuryRecovery(q,'2028-02-01');assert.equal(i.injuryView(q,'2028-02-01').stage,'rehab');assert.equal(q.injury.unavailableUntil,row.unavailableUntil);i.advanceInjuryRecovery(q,'2028-06-01');assert.equal(q.injury,null);assert.equal(q.injuryHistory[0].missedDays,90);assert.deepEqual(decoded.rngStates,rng);
});
test('legacy healthy saves get empty history and active legacy injuries keep dates without RNG',()=>{
 const {s,p}=fixture();delete p.injuryHistory;const rng={...s.rngStates};let q=e.getPlayer(save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state);assert.deepEqual(q.injuryHistory,[]);
 p.injury={severity:'severe',startDate:s.date,unavailableUntil:e.addDays(s.date,30),originalPenalty:9,penaltyRemaining:9,penaltyRecoverDays:14};q=e.getPlayer(save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state);assert.equal(q.injuryHistory[0].requiredDays,30);assert.equal(q.injury.unavailableUntil,p.injury.unavailableUntil);assert.equal(i.validInjuryData(q),true);assert.deepEqual(s.rngStates,rng);
});
test('invalid recovery schedules and missing burden values cannot enter a saved career',()=>{
 const {s,p}=fixture();inj(s,p,90);p.injuryHistory[0].requiredDays=366;assert.equal(i.validInjuryData(p),false);p.injuryHistory[0].requiredDays=90;delete p.injuryHistory[0].load.training;assert.equal(i.validInjuryData(p),false);
});
test('season adjustment unions overlapping absence, excludes old healthy years and never improves negative WAR',()=>{
 const {s,p}=fixture();s.date='2027-04-01';inj(s,p,90);s.date='2027-05-01';inj(s,p,90,'hand','second');const adjustment=i.injurySeasonAdjustment(p,2027,'2027-07-30');assert.equal(adjustment.days,120);assert(adjustment.penalty<=1);
 assert.equal(i.injurySeasonAdjustment(p,2028).penalty,0);
 const {seasonEvaluation,validSeasonEvaluation}=require('../.test-build/lib/sim/pro-season-evaluation.js'),war=require('../.test-build/lib/sim/pro-war.js').emptyProWarAssessment();war.equivalentWins=-2;const base=seasonEvaluation(war),withInjury=seasonEvaluation(war,adjustment);assert(withInjury.score<base.score);close(base.score-withInjury.score,adjustment.penalty);assert(validSeasonEvaluation(withInjury,war,withInjury.score));
});
test('recent severe recurrence discounts future availability, then decays as recovery becomes distant',()=>{
 const {s,p}=fixture();s.date='2027-04-01';inj(s,p,180);s.date=e.addDays(s.date,181);inj(s,p,180,'leg','repeat');const current=i.injuryRiskAssessment(p,s.date);assert(current.risk>=30);assert(current.salaryMultiplier>=.8&&current.salaryMultiplier<1);assert.equal(current.yearsLost,1);i.advanceInjuryRecovery(p,'2029-04-01');assert(i.injuryRiskAssessment(p,'2032-04-01').risk<current.risk/4);
});
test('recent cumulative workload, adaptation and two-way exposure raise risk without extra physical multipliers',()=>{
 const {s,p}=fixture(),action=exposure(s),base=i.injuryRiskEstimate(p,action).probability;const strong={...p,stats:{...p.stats,stamina:100,recovery:100}};close(i.injuryRiskEstimate(strong,action).probability,base);
 p.injuryWorkload=[{date:s.date,keys:['prior'],load:200}];assert(i.injuryRiskEstimate(p,action).probability>base);assert(i.injuryRiskEstimate(p,{...action,batting:1,pitching:1}).probability>i.injuryRiskEstimate(p,action).probability);
 const row=inj(s,p,3);s.date=row.unavailableUntil;i.advanceInjuryRecovery(p,s.date);const adapted=i.injuryRiskEstimate(p,{...action,date:s.date}).probability;assert(adapted>base);
});
test('exhibition copies transfer permanent losses only once without copying scaled raw stats',()=>{
 const {s,p}=fixture(),clone=structuredClone(p);for(const k of Object.keys(clone.stats))clone.stats[k]*=.98;inj(s,clone,90,'arm');const before={...p.stats};i.copyInjuryOutcome(p,clone);const after={...p.stats};i.copyInjuryOutcome(p,clone);assert.deepEqual(p.stats,after);assert.equal(p.stats.contact,before.contact);for(const [key,n] of Object.entries(clone.injuryHistory[0].permanent))close(p.stats[key],before[key]-n);
});
test('medical report shows only four injury fields without mutating state',()=>{
 const {s,p}=fixture(),row=inj(s,p,14,'hand'),before=structuredClone(s);
 const component=require('../.test-build/app/components/medical-report.js').default;
 const html=renderToStaticMarkup(createElement(component,{injury:row,onClose:()=>{}}));
 assert.match(html,/메디컬 리포트/);assert.match(html,/손\/손목/);assert.match(html,/경상/);assert.match(html,/14일 출전 불가/);assert.match(html,/컨택/);assert(html.includes(row.unavailableUntil));
 assert.equal((html.match(/<dt>/g)??[]).length,4);assert.doesNotMatch(html,/몸 상태|부상 위험|부상 이력|WAR/);assert.deepEqual(s,before);
 const overlap=renderToStaticMarkup(createElement(component,{injury:row,returnDate:'2027-12-31',onClose:()=>{}}));assert.match(overlap,/2027-12-31/);
 const ending=inj(s,p,366,'arm','ending');const retired=renderToStaticMarkup(createElement(component,{injury:ending,onClose:()=>{}}));assert.match(retired,/시즌 일정과 시상을 마친 뒤 은퇴/);assert.match(retired,/복귀 불가/);
});
test('medical reports pause progression and are acknowledged once across save and load',()=>{
 const {s,p}=fixture(),reports=require('../.test-build/lib/medical-report.js'),{autoWaitingForDecision}=require('../.test-build/lib/auto-progress.js');delete p.roleOffer;delete s.pendingEventOutcome;
 assert.equal(reports.pendingMedicalReport(s),undefined);const row=inj(s,p,14);assert.equal(autoWaitingForDecision(s),true);
 const loaded=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;assert.equal(reports.pendingMedicalReport(loaded).id,row.id);
 const ack=reports.acknowledgeMedicalReport(loaded,row.id);assert.equal(reports.pendingMedicalReport(ack),undefined);assert.equal(autoWaitingForDecision(ack),false);assert.equal(reports.pendingMedicalReport(loaded).id,row.id);
 assert.equal(reports.acknowledgeMedicalReport(ack,row.id),ack);
 const reloaded=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(ack))).state;assert.equal(reports.pendingMedicalReport(reloaded),undefined);
 const recurrence=inj(reloaded,e.getPlayer(reloaded),15,'leg','new');assert.equal(reports.pendingMedicalReport(reloaded).id,recurrence.id);
});
test('NPC and old injuries do not open player reports and multiple new reports remain queued',()=>{
 const {s,p}=fixture(),reports=require('../.test-build/lib/medical-report.js'),npc=structuredClone(p);npc.id='medical-npc';s.players.push(npc);inj(s,npc,14);assert.equal(reports.pendingMedicalReport(s),undefined);
 const old=inj(s,p,14);delete old.medicalReportRead;s.date=old.adaptationUntil;i.advanceInjuryRecovery(p,s.date);assert.equal(reports.pendingMedicalReport(s),undefined);
 const first=inj(s,p,15,'arm','first'),second=inj(s,p,20,'hand','second');assert.equal(reports.pendingMedicalReport(s).id,first.id);
 assert.equal(reports.pendingMedicalReport(reports.acknowledgeMedicalReport(s,first.id)).id,second.id);
});
test('an active injury without a report flag opens once, including legacy running games and saves',()=>{
 const reports=require('../.test-build/lib/medical-report.js'),{autoWaitingForDecision}=require('../.test-build/lib/auto-progress.js');
 for(const legacy of [false,true])for(const reload of [false,true]){
  let {s,p}=fixture();
  if(legacy){p.injury={severity:'mild',startDate:s.date,unavailableUntil:e.addDays(s.date,7),originalPenalty:3,penaltyRemaining:3,penaltyRecoverDays:7};delete p.injuryHistory;}
  else {const row=inj(s,p,14,'hand');delete row.medicalReportRead;}
  if(reload)s=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;
  const before=structuredClone(s),report=reports.pendingMedicalReport(s);assert(report);assert.equal(autoWaitingForDecision(s),true);assert.deepEqual(s,before);
  const again=reports.pendingMedicalReport(s);assert.equal(again.id,report.id);assert.equal(again.unavailableUntil,report.unavailableUntil);
  const confirmed=reports.acknowledgeMedicalReport(s,report.id);assert.equal(reports.pendingMedicalReport(confirmed),undefined);assert.deepEqual(e.getPlayer(confirmed).stats,e.getPlayer(s).stats);
  const restored=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(confirmed))).state;assert.equal(reports.pendingMedicalReport(restored),undefined);
 }
});
test('full week returns a player on the scheduled midweek date and keeps unavailability beforehand',()=>{
 const s=structuredClone(template),p=e.getPlayer(s);s.date='2027-04-05';s.calendar.competitions=[];s.calendar.trainingDays=[];s.calendar.events=[];s.careerOpportunities={transferOffered:true};delete s.careerNotice;s.careerEvent=null;
 for(const q of s.players){q.fatigue=0;q.forcedRest=false;q.injury=null;}
 inj(s,p,3);const row=p.injuryHistory[0];for(const q of s.players.filter(q=>q.teamId===p.teamId&&q.id!==p.id&&q.position===p.position)){q.stats.contact=q.stats.power=q.stats.defense=q.stats.speed=1;}
 for(const key of Object.keys(p.stats))p.stats[key]=90;
 for(let d=0;d<6;d++){const game={id:`injury-return-${d}`,date:e.addDays(s.date,d),homeTeamId:p.teamId,awayTeamId:(p.teamId+1)%s.teams.length,competitionId:'injury-test',round:1,rulesetId:'school',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{}};e.simulateGame(s,game,[game.homeTeamId,game.awayTeamId].map(id=>s.players.filter(q=>q.teamId===id)));assert.equal(!!game.boxScore[p.id]?.batting.PA,d>=3);}
 assert.equal(row.returnedOn,e.addDays(s.date,3));assert.equal(row.missedDays,3);
});
test('professional injury retirement uses the existing archive and contract termination exactly once for player and NPC',()=>{
 const pc=require('../.test-build/lib/sim/pro-career.js'),s=pc.createProfessionalDemo('injury-retirement-pro','은퇴검증','SS'),p=e.getPlayer(s),npc=s.players.find(q=>q.id!==p.id);delete s.careerNotice;s.noticeQueue=[];inj(s,p,366,'arm');inj(s,npc,400,'trunk','npc');settleInjuryRetirements(s);
 assert.equal(s.proWorld.retired,undefined);assert.equal(p.injuryRetirement.handled,false);assert.notEqual(p.professional.contract,null);assert.equal(e.available(p,s.date),false);
 s.proWorld.seasonClosed=true;s.proWorld.seasons.push({year:s.proWorld.year,awards:[],awardsCeremony:{scheduledAt:s.date}});settleInjuryRetirements(s);assert.equal(s.proWorld.retired,undefined);
 s.proWorld.seasons.at(-1).awardsCeremony.presentedAt=s.date;settleInjuryRetirements(s);delete s.careerNotice;s.noticeQueue=[];settleInjuryRetirements(s);
 assert.equal(s.proWorld.stage,'retired');assert.match(s.proWorld.retired.reason,/366일/);assert.equal(p.professional.contract,null);assert.equal(npc.professional.employment,'retired');assert(p.career.some(row=>row.year===s.calendar.seasonYear));const count=p.career.length;settleInjuryRetirements(s);assert.equal(p.career.length,count);
 require('../.test-build/lib/sim/retired-records.js').discardRetiredPlayers(s);assert.equal(s.proWorld.retiredInjuries[npc.id].history[0].requiredDays,400);
});
test('the first strenuous action uses its added fatigue and logs prior load, matching the risk preview',()=>{
 const {s,p}=fixture(),old={...r};try{r.trainingBaseRisk=100;r.maxRisk=1;p.fatigue=80;p.stats.recovery=1;for(const key of Object.keys(p.trainingPolicy.tickets))p.trainingPolicy.tickets[key]=5;
 const preview=require('../.test-build/lib/sim/injury-preview.js').injuryActionPreview(p,p.trainingPolicy,s.date),result=e.advanceWeek(s,p.trainingPolicy,p.stance),row=e.getPlayer(result).injuryHistory[0];assert(row.fatigue>80);close(row.fatigue,preview.trainingFatigue);assert.equal(row.load.recent,0);assert(row.load.training>0);
 }finally{Object.assign(r,old);}
});
test('NPCs use the same treatment and safe rehabilitation policy',()=>{
 const {s,p}=fixture(),row=inj(s,p,14,'arm');e.npcPolicy(p,s.date,false);assert.equal(p.trainingPolicy.mode,'rest');e.npcPolicy(p,row.treatmentUntil,false);assert.notEqual(p.trainingPolicy.mode,'rest');assert.equal(p.trainingPolicy.tickets.velocity,0);assert(Object.values(p.trainingPolicy.tickets).every(n=>n<=1));
});
test('contract salary, duration and club priority carry separate bounded health adjustments',()=>{
 const pc=require('../.test-build/lib/sim/pro-career.js'),market=require('../.test-build/lib/sim/pro-market.js'),evaluation=require('../.test-build/lib/sim/pro-evaluation.js');
 const s=pc.createProfessionalDemo('injury-contract','계약검증','SS'),p=e.getPlayer(s);s.date=`${s.calendar.seasonYear}-10-01`;p.teamId=p.professional.contract.club;p.proContract.status='regular';p.age=25;for(const key of Object.keys(p.stats))p.stats[key]=85;
 p.professional.assessments=[{year:s.calendar.seasonYear,score:90,cumulative:90,grade:'S',cumulativeGrade:'S',firstTeam:true,role:p.primaryRole}];for(const club of s.proWorld.clubs)club.budget=1e12;
 const healthy=structuredClone(p),salary=market.salaryQuote(p,s.calendar.seasonYear,s),duration=market.faContractYears(p,90,s.calendar.seasonYear+1,p.teamId,s.date),value=evaluation.contractValue(p,s.calendar.seasonYear,s.date);
 inj(s,p,365,'hand');const risk=i.injuryRiskAssessment(p,s.date);assert(market.salaryQuote(p,s.calendar.seasonYear,s)<salary);assert(market.salaryQuote(p,s.calendar.seasonYear,s)>=33_000_000);assert.equal(market.faContractYears(p,90,s.calendar.seasonYear+1,p.teamId,s.date),Math.max(1,duration-1));
 // Remove only the permanent loss from the comparison, so this measures health risk itself.
 p.stats={...healthy.stats};close(value-evaluation.contractValue(p,s.calendar.seasonYear,s.date),risk.interestPenalty);
 const offer=market.offerFor(s,p,p.teamId,s.calendar.seasonYear+1,'fa');assert(offer,'injury history does not exclude every offer');assert(offer.years>=1);assert(offer.salary>=33_000_000);
});
test('professional offseason and next camp advance stored recovery across a year boundary',()=>{
 const pc=require('../.test-build/lib/sim/pro-career.js'),life=require('../.test-build/lib/sim/pro-season.js'),s=pc.createProfessionalDemo('injury-camp','캠프검증','SS'),p=e.getPlayer(s);
 s.date=`${s.calendar.seasonYear}-12-20`;s.proWorld.seasonClosed=true;s.proWorld.stage='offseason';delete s.proWorld.stove;p.professional.contract.endYear=s.calendar.seasonYear+3;const row=inj(s,p,90,'trunk'),id=row.id,until=row.unavailableUntil;life.startNextProSeason(s);const q=e.getPlayer(s);assert.equal(q.injury.episodeId,id);assert.equal(q.injury.unavailableUntil,until);assert.equal(i.injuryView(q,s.date).stage,'rehab');assert.equal(q.injuryHistory[0].permanentApplied,true);
});
test('draft ability and potential remain intact while a separate health component lowers priority',()=>{
 const {s,p}=fixture(),draft=require('../.test-build/lib/sim/draft.js');p.grade=3;p.reputation=80;const before=draft.draftAssessment(p,s.date),stats={...p.stats},talent={...p.talent};inj(s,p,180,'hand');p.stats={...stats};const risk=i.injuryRiskAssessment(p,s.date);close(before-draft.draftAssessment(p,s.date),risk.interestPenalty);assert.deepEqual(p.talent,talent);const pick=draft.draftPlayers(s)[0];assert.equal(pick.components.injury,-risk.interestPenalty);assert(pick.scoutingReport.reasons.some(row=>row.title==='향후 출전 가능성'));
});
test('legacy recovery over 365 days is not silently clipped or made playable on load',()=>{
 const {s,p}=fixture();p.injury={severity:'severe',startDate:s.date,unavailableUntil:e.addDays(s.date,366),originalPenalty:9,penaltyRemaining:9,penaltyRecoverDays:40};delete p.injuryHistory;const n=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state,q=e.getPlayer(n);assert.equal(q.injuryHistory[0].requiredDays,366);assert.equal(q.injuryRetirement.handled,false);assert.equal(n.phase,s.phase);assert.equal(e.available(q,q.injury.unavailableUntil),false);
});
