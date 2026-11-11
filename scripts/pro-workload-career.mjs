import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
e.params['pro_events.enabled']=0;e.params['events.focus_chance']=0;
let s=pc.acknowledgeCareer(pc.createProfessionalDemo('workload-career-v3','Workload','SS')),steps=0;
const start=Date.now();
while(!s.proWorld.seasonClosed&&steps++<1500){
 if(['camp','regular'].includes(s.proWorld.stage))for(let team=0;team<10;team++){
  const roster=s.players.filter(p=>p.teamId===team),arms=roster.filter(p=>['SP','RP','CP'].includes(p.position));
  assert.equal(roster.length,29);assert(arms.length>=12&&arms.length<=15);
  assert(roster.filter(p=>p.position==='SP').length>=5&&roster.filter(p=>p.position==='SP').length<=6);assert.equal(roster.filter(p=>p.position==='CP').length,1);
 }
 if(s.careerNotice){s=pc.acknowledgeCareer(s);continue;}
 if(s.careerEvent){s=e.answerCareerEvent(s,s.careerEvent.choices[0].id);continue;}
 if(s.pendingEventOutcome){delete s.pendingEventOutcome;continue;}
 const p=e.getPlayer(s);s=e.advanceWeek(s,p.trainingPolicy,p.stance);
 if(steps%10===0)console.log(JSON.stringify({steps,date:s.date,stage:s.proWorld.stage,seconds:(Date.now()-start)/1000}));
}
if(!s.proWorld.seasonClosed)throw Error('Career season did not close: '+s.date);
const players=[...s.players,...s.proWorld.archive],seen=new Set(),rows=players.filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return p.seasonByLevel?.first;});
const summary={};
for(const role of ['SP','RP','CP']){
 const cohort=rows.filter(p=>{const r=p.seasonByLevel.first,n=r.games?.pitching??0,ip=r.pitching.outs/3,sv=r.games?.saves??0;return p.position===role&&(role==='SP'?n>=20&&ip/n>=4:role==='RP'?n>=40&&ip/n<2&&sv<10:sv>=20&&sv>=(r.games?.holds??0));});
 const sum=fn=>cohort.reduce((total,p)=>total+fn(p.seasonByLevel.first),0),g=sum(r=>r.games.pitching),ip=sum(r=>r.pitching.outs/3);
 summary[role]={n:cohort.length,games:g/cohort.length,innings:ip/cohort.length,perGame:ip/g};
}
const games=s.calendar.events.filter(g=>g.competitionId==='pro-first'),last=new Map();
const totals=new Map();
for(const g of games.filter(g=>g.status==='completed'))for(const[id,r]of Object.entries(g.boxScore))if(r.pitching.BF||r.pitching.outs){const total=totals.get(id)??{outs:0,games:0};total.outs+=r.pitching.outs;total.games++;totals.set(id,total);}
for(const[id,total]of totals){const row=rows.find(p=>p.id===id);assert(row,id);assert.equal(row.seasonByLevel.first.pitching.outs,total.outs,id);assert.equal(row.seasonByLevel.first.games.pitching,total.games,id);}
for(const g of games.filter(g=>g.status==='completed').sort((a,b)=>a.date.localeCompare(b.date)))for(const team of [g.homeTeamId,g.awayTeamId]){
 const id=g.lineup[team===g.homeTeamId?0:1][9],history=last.get(team)??[];if(history.includes(id))throw Error('Rotation gap violated');history.push(id);if(history.length>4)history.shift();last.set(team,history);
 assert.equal(e.pitchingRole(rows.find(p=>p.id===id)),'선발');
 for(const[other,r]of Object.entries(g.boxScore))if(r.pitching.BF>0&&!g.lineup.some(side=>side[9]===other))assert(['중간계투','마무리'].includes(e.pitchingRole(rows.find(p=>p.id===other))));
}
const result={date:s.date,steps,seconds:(Date.now()-start)/1000,games:games.length,completed:games.filter(g=>g.status==='completed').length,forfeits:games.filter(g=>g.status==='forfeit').length,summary};
assert.equal(result.completed,720);assert.equal(result.forfeits,0);
fs.writeFileSync('outputs/pro-balance/workload-career-v3.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
