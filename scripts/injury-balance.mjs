import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const {advanceWeekInPlace}=require('../.test-build/lib/sim/week-engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const injury=require('../.test-build/lib/sim/injury-system.js');
const {injuryRules}=require('../.test-build/lib/sim/injury-rules.js');
e.params['events.weekly_chance']=0;e.params['events.focus_chance']=0;e.params['pro_events.enabled']=0;
// Run the real three-school-season career, retaining graduated NPC injury evidence.
let s=e.createGame('injury-live-three-seasons','부상밸런스','SS');
const start=performance.now(),episodes=new Map(),games=new Map(),times=[],population=new Map();
for(let step=0;s.phase!=='ended'&&step<650;step++){
 if(s.careerEvent){s=e.answerCareerEvent(s,s.careerEvent.choices.find(c=>c.id==='routine')?.id??s.careerEvent.choices[0].id);continue;}
 if(s.pendingEventOutcome){delete s.pendingEventOutcome;continue;}
 if(s.careerNotice){s=pc.acknowledgeCareer(s);continue;}
 if(e.getPlayer(s).roleOffer){s=e.answerOffer(s,false);continue;}
 const t=performance.now(),p=e.getPlayer(s);advanceWeekInPlace(s,p.trainingPolicy,p.stance);times.push(performance.now()-t);
 population.set(s.calendar.seasonYear,s.players.length);
 for(const q of s.players)for(const row of q.injuryHistory??[])episodes.set(row.id,row);
 for(const g of s.calendar.events)if(g.status==='completed'||g.status==='forfeit')games.set(g.id,g.status);
}
assert.equal(s.phase,'ended');assert(population.size>=3,'expected full three seasons');
const rows=[...episodes.values()],grades=Object.fromEntries(Object.keys(injuryRules.grades).map(grade=>[grade,rows.filter(row=>row.severity===grade).length]));
const playerSeasons=[...population.values()].reduce((a,b)=>a+b,0),perSeason=rows.length/playerSeasons,long=rows.filter(row=>row.requiredDays>=90).length/playerSeasons,ending=grades.careerEnding/playerSeasons;
assert(perSeason<1.5,'excessive routine injury rate');assert(long<.08,'excessive long absence rate');assert(ending<.005,'excessive injury retirement rate');
times.sort((a,b)=>a-b);
console.log(JSON.stringify({seed:s.seed,ended:s.date,seasons:[...population],games:games.size,forfeits:[...games.values()].filter(status=>status==='forfeit').length,playerSeasons,injuries:rows.length,grades,injuriesPerPlayerSeason:perSeason,longInjuriesPerPlayerSeason:long,retirementsPerPlayerSeason:ending,medianRequiredDays:[...rows].sort((a,b)=>a.requiredDays-b.requiredDays)[Math.floor(rows.length/2)]?.requiredDays,meanWeekMs:times.reduce((a,b)=>a+b,0)/times.length,p95WeekMs:times[Math.floor(times.length*.95)],elapsedSeconds:(performance.now()-start)/1000,historyBytes:Buffer.byteLength(JSON.stringify(rows))},null,2));
// Fixed exposure Monte Carlo isolates fatigue's effect and uses the production RNG.
for(const fatigue of [20,60,90]){
 let count=0,long=0,retired=0;const p=e.previewPlayer('injury-risk-probe','위험검증','SP');
 for(let n=0;n<200000;n++){
  const risk=injury.injuryRiskEstimate(p,{...injury.emptyInjuryLoad(),key:'probe',date:s.date,cause:'game',fatigue,pitching:1});
  if(e.random(s,'injury')<risk.probability){count++;const days=injury.drawInjuryDuration(fatigue,()=>e.random(s,'injury'));long+=days>=90;retired+=days>365;}
 }
 console.log(JSON.stringify({fatigue,exposures:200000,injuries:count,long,retired}));
}
