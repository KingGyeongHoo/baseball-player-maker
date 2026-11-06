import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),event=require('../.test-build/lib/sim/event-system.js');
e.params['events.weekly_chance']=0;e.params['events.focus_chance']=0;
const cases=[{id:'developmental-hitter',position:'SS',age:19,ability:55,developmental:true},{id:'regular-pitcher',position:'SP',age:22,ability:76},{id:'veteran-two-way',position:'SS',age:34,ability:78,twoWay:true}],results=[];
function choose(s,policy){const p=e.getPlayer(s),choices=s.careerEvent.choices;
 if(s.careerEvent.proEvent?.channel==='followup')return choices.find(c=>c.id==='keep')?.id??choices[0].id;
 const score=choice=>choice.outcomes.reduce((sum,o)=>sum+o.weight/100*(policy==='recover'||policy==='mixed'&&p.fatigue>=50?-(o.fatigue??0)+(o.skipTraining?5:0):Object.entries(o.weeks??{}).reduce((n,[key,weeks])=>n+event.eventTrainingReward(p,key,weeks),0)),0);
 return [...choices].sort((a,b)=>score(b)-score(a))[0].id;
}
for(const spec of cases){
 let initial=pc.acknowledgeCareer(pc.createProfessionalDemo('pe-balance-'+spec.id,'검증선수',spec.position)),p=e.getPlayer(initial);p.age=spec.age;p.stats.recovery=55;p.stats.stamina=60;
 for(const k of e.isPitcher(p.primaryRole)?['velocity','control','movement']:['contact','power','speed','defense'])p.stats[k]=spec.ability;
 if(spec.developmental)p.proContract.status='developmental';
 if(spec.twoWay){for(const k of ['velocity','control','movement'])p.stats[k]=spec.ability;p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};p.eligiblePositions=[...new Set([...p.eligiblePositions,'SP','RP','CP'])];}
 p.reputation=e.reputationScore(p);const before={...p.stats};
 for(const policy of ['off','train','recover','mixed']){
  e.params['pro_events.enabled']=policy==='off'?0:1;let s=structuredClone(initial),steps=0;
  while(s.phase!=='ended'&&steps++<500){if(s.careerNotice){s=pc.acknowledgeCareer(s);continue;}if(s.careerEvent){s=e.answerCareerEvent(s,choose(s,policy));continue;}s=e.advanceWeek(s,e.getPlayer(s).trainingPolicy,e.getPlayer(s).stance);}
  assert.ok(steps<500,'season guard '+spec.id+' '+policy);
  for(let i=0;i<30&&(s.careerNotice||s.careerEvent);i++){if(s.careerNotice)s=pc.acknowledgeCareer(s);else s=e.answerCareerEvent(s,choose(s,policy));}
  const q=e.getPlayer(s),history=s.proEvents?.history??[],year=s.calendar.seasonYear,general=history.filter(r=>r.season===year&&r.channel==='general'&&r.budget).length,game=history.filter(r=>r.season===year&&r.channel==='game'&&r.budget).length;
  assert.ok(general<=12&&game<=6);const perDay=new Map();for(const row of history){perDay.set(row.date,(perDay.get(row.date)??0)+1);}assert.ok([...perDay.values()].every(n=>n<=1),'one choice per day');
  const events=s.careerEventHistory.filter(r=>r.proEvent),growth=Object.fromEntries(Object.keys(q.stats).map(k=>[k,q.stats[k]-before[k]]));
  assert.equal(s.calendar.events.filter(g=>g.competitionId==='pro-first'&&['completed','forfeit'].includes(g.status)).length,720);
  assert.equal(s.calendar.events.filter(g=>g.competitionId==='pro-second'&&['completed','forfeit'].includes(g.status)).length,360);
  assert.ok(Object.values(q.stats).every(n=>n>=1&&n<=100));
  const counts={};for(const row of events)counts[row.proEvent.catalogId]=(counts[row.proEvent.catalogId]??0)+1;
  const row={case:spec.id,policy,steps,date:s.date,general,game,counts,awakenings:events.filter(r=>r.awakened.length).length,eventGrowth:Object.values(events.reduce((all,r)=>{for(const [key,n]of Object.entries(r.stats))all[key]=(all[key]??0)+n;return all;},{})).reduce((a,b)=>a+b,0),growth,endingFatigue:q.fatigue,peakFatigue:Math.max(...s.history.map(r=>r.fatigue)),injuryDays:s.injuryDays,level:s.postSchool.pro.level,firstPA:q.seasonByLevel.first.batting.PA,firstBF:q.seasonByLevel.first.pitching.BF,developmental:q.proContract.status==='developmental',roster:s.proEvents?.national[String(year)]?.roster.length??0};
  results.push(row);console.log(JSON.stringify(row));
 }
}
writeFileSync('validation/pro-events-v1.json',JSON.stringify({version:1,scope:'Twelve deterministic game seasons across three player profiles and four offline policies. Initial game balance; not empirical baseball statistics.',catalogEvents:30,choices:73,results},null,2)+'\n');
