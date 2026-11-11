import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const {createProfessionalDemo}=require('../.test-build/lib/sim/pro-career.js');
const {PRO_BALANCE_VERSION,proSeasonTargets,proPitchingWorkloadTargets}=require('../.test-build/lib/sim/pro-balance.js');
const world=require('../.test-build/lib/sim/pro-world.js');
e.params['pro_events.enabled']=0;e.params['events.focus_chance']=0;
const mean=a=>a.reduce((s,x)=>s+x,0)/(a.length||1);
const sum=(rs,k)=>rs.reduce((s,r)=>s+(r[k]??0),0);
export function runSeason(seed){
 const s=createProfessionalDemo(seed,'밸런스검증','SS');
 // Match-engine season probe: fixed roster and tools, normal daily recovery,
 // no training/events/injuries. Career-level changes are tested separately.
 delete s.careerNotice;s.proWorld.stage='regular';
 const games=s.calendar.events.filter(g=>g.competitionId==='pro-first').sort((a,b)=>a.date.localeCompare(b.date));
 let previous=games[0].date,forfeits=0;
 const workloadRows=new Map(),recentStarts=new Map(),rareOutings={starterEightInnings:0,reliefThreeInnings:0,closerOneOutThenRelief:0};
 for(const g of games){
   if(g.date!==previous){for(let date=previous;date<g.date;date=e.addDays(date,1))for(const p of s.players){e.npcPolicy(p,date,games.some(x=>x.date===date&&(x.homeTeamId===p.teamId||x.awayTeamId===p.teamId)));p.fatigue=e.trainingFatigueDay(p.fatigue,p.stats.recovery,p.trainingPolicy).end;}previous=g.date;}
   s.date=g.date;
   world.reviewLeagueRegistrations(s);
   if(!e.simulateGame(s,g,[g.homeTeamId,g.awayTeamId].map(t=>s.players.filter(p=>p.teamId===t))))throw Error('unexpected event');
   if(g.status==='forfeit'){forfeits++;if(process.env.PRO_BALANCE_DEBUG)console.error(JSON.stringify({date:g.date,team:g.forfeitTeamId,starters:[g.homeTeamId,g.awayTeamId].map(team=>world.professionalLineup(s,s.players.filter(p=>p.teamId===team),g.date).starter?.id),arms:s.players.filter(p=>p.teamId===g.forfeitTeamId&&['SP','RP','CP'].includes(p.position)).map(p=>({id:p.id,role:p.position,fatigue:p.fatigue,last:p.lastPitched}))}));}
   else {
     const rs=Object.values(g.boxScore);
     for(const team of [g.homeTeamId,g.awayTeamId]){
       const side=team===g.homeTeamId?0:1,id=g.lineup[side][9],recent=recentStarts.get(team)??[];
       assert.equal(e.pitchingRole(s.players.find(p=>p.id===id)),'선발');
       for(const[other,record]of Object.entries(g.boxScore))if(other!==id&&record.pitching.BF>0&&s.players.find(p=>p.id===other)?.teamId===team)assert(['중간계투','마무리'].includes(e.pitchingRole(s.players.find(p=>p.id===other))));
       assert(!recent.includes(id),`Starter reused before five team games: ${id}`);recent.push(id);if(recent.length>4)recent.shift();recentStarts.set(team,recent);
     }
     for(const[id,record]of Object.entries(g.boxScore))if(record.pitching.BF){
       const p=s.players.find(p=>p.id===id),row=workloadRows.get(id)??{id,role:p.position,games:0,outs:0,maxOuts:0,starts:0};
       row.games++;row.outs+=record.pitching.outs;row.maxOuts=Math.max(row.maxOuts,record.pitching.outs);row.starts+=Number(g.lineup.some(side=>side[9]===id));workloadRows.set(id,row);
       if(row.role==='SP'&&record.pitching.outs>=24)rareOutings.starterEightInnings++;
       if(row.role==='RP'&&record.pitching.outs>=9)rareOutings.reliefThreeInnings++;
       if(row.role==='CP'&&record.pitching.outs===1){const order=Object.entries(g.boxScore).filter(([other,r])=>s.players.find(p=>p.id===other)?.teamId===p.teamId&&r.pitching.BF>0).map(([id])=>id);if(order.slice(order.indexOf(id)+1).some(other=>s.players.find(p=>p.id===other)?.position==='RP'))rareOutings.closerOneOutThenRelief++;}
     }
     assert.equal(sum(rs.map(r=>r.batting),'H'),sum(rs.map(r=>r.pitching),'H'));
     assert.equal(sum(rs.map(r=>r.batting),'SO'),sum(rs.map(r=>r.pitching),'SO'));
     assert.equal(sum(rs.map(r=>r.batting),'R'),g.score[0]+g.score[1]);
     assert.equal(rs.reduce((n,r)=>n+(r.games?.wins??0),0),g.score[0]===g.score[1]?0:1);
     assert.equal(rs.reduce((n,r)=>n+(r.games?.losses??0),0),g.score[0]===g.score[1]?0:1);
   }
 }
 const records=s.players.map(p=>({p,r:p.seasonByLevel?.first??e.emptyRecord()}));
 const hs=records.filter(x=>x.r.batting.PA>=100),ps=records.filter(x=>x.r.pitching.outs>=90);
 const h=hs.map(x=>x.r.batting),p=ps.map(x=>x.r.pitching),qualified=hs.filter(x=>x.r.batting.PA>=446),qp=ps.filter(x=>x.r.pitching.outs>=432);
 const metric=(rs,fn)=>({max:Math.max(...rs.map(fn)),mean:mean(rs.map(fn)),min:Math.min(...rs.map(fn))});
 const closerIds=new Set(Array.from({length:10},(_,team)=>s.players.filter(p=>p.teamId===team&&e.pitchingRole(p)==='마무리').sort((a,b)=>e.roleScore(b,e.pitchingRole(b))-e.roleScore(a,e.pitchingRole(a))||a.id.localeCompare(b.id))[0]?.id));
 const starts=new Map();for(const game of games)for(const side of game.lineup){const id=side[9];starts.set(id,(starts.get(id)??0)+1);}
 const roles=Object.fromEntries(['SP','RP','CP'].map(role=>{const rs=ps.filter(x=>x.p.position===role&&(role!=='CP'||closerIds.has(x.p.id))&&(role!=='SP'||(starts.get(x.p.id)??0)>=20));return [role,{n:rs.length,IP:metric(rs,x=>x.r.pitching.outs/3),W:metric(rs,x=>x.r.games?.wins??0),L:metric(rs,x=>x.r.games?.losses??0),HLD:metric(rs,x=>x.r.games?.holds??0),SV:metric(rs,x=>x.r.games?.saves??0)}];}));
 const workload=Object.fromEntries(['SP','RP','CP'].map(role=>{const rows=[...workloadRows.values()].filter(row=>{const rec=records.find(x=>x.p.id===row.id)?.r;return role==='SP'?row.role==='SP'&&row.games>=20&&row.outs/3/row.games>=4:role==='RP'?row.role==='RP'&&row.games>=40&&row.outs/3/row.games<2&&(rec?.games?.saves??0)<10:row.role==='CP'&&(rec?.games?.saves??0)>=20&&(rec?.games?.saves??0)>=(rec?.games?.holds??0);});return[role,{n:rows.length,games:mean(rows.map(row=>row.games)),innings:mean(rows.map(row=>row.outs/3)),perGame:sum(rows,'outs')/3/Math.max(1,sum(rows,'games')),maxGames:Math.max(0,...rows.map(row=>row.games)),maxOuting:Math.max(0,...rows.map(row=>row.maxOuts))/3}];}));
 for(const row of workloadRows.values()){const record=records.find(x=>x.p.id===row.id).r;assert.equal(record.pitching.outs,row.outs);assert.equal(record.games.pitching,row.games);}
 return {seed,games:games.length,forfeits,hitters:hs.length,pitchers:ps.length,H:metric(h,x=>x.H),HR:metric(h,x=>x.HR),RBI:metric(h,x=>x.RBI),AVG:{max:Math.max(...qualified.map(x=>x.r.batting.H/x.r.batting.AB)),mean:sum(h,'H')/sum(h,'AB')},OPS:{max:Math.max(...qualified.map(x=>e.ops(x.r))),mean:(sum(h,'H')+sum(h,'BB'))/sum(h,'PA')+(sum(h,'H')+sum(h,'2B')+2*sum(h,'3B')+3*sum(h,'HR'))/sum(h,'AB')},ERA:{min:Math.min(...qp.map(x=>27*x.r.pitching.ER/x.r.pitching.outs)),mean:27*sum(p,'ER')/sum(p,'outs')},K:metric(p,x=>x.SO),roles,workload,rareOutings};
}
if(process.argv[1]?.endsWith('pro-balance.mjs')){
 const n=Number(process.env.PRO_BALANCE_SEEDS??3),start=Number(process.env.PRO_BALANCE_START??0),report=process.env.PRO_BALANCE_REPORT??'latest',results=[];
 assert(Number.isInteger(n)&&n>0&&Number.isInteger(start)&&start>=0,'Use positive season count and nonnegative start index');
 assert(/^[a-z0-9-]+$/i.test(report),'Use a plain report name');
 for(let i=start;i<start+n;i++){const r=runSeason(`pro-balance-${i}`);results.push(r);console.log(JSON.stringify(r));}
 const comparison=[];
 for(const [stat,targets] of Object.entries(proSeasonTargets.hitters))for(const [kind,range] of Object.entries(targets)){
   const values=results.map(r=>r[stat][kind]);comparison.push({group:'hitters',stat,kind,target:range,mean:mean(values),observed:[Math.min(...values),Math.max(...values)],within:values.filter(n=>n>=range[0]&&n<=range[1]).length,seasons:n});
 }
 for(const [group,targets] of Object.entries(proSeasonTargets.pitching))for(const [key,range] of Object.entries(targets)){
   const [stat,kind]=group==='ERA'?['ERA',key]:[{wins:'W',losses:'L',holds:'HLD',saves:'SV'}[key.replace(/Max|Mean/,'')],key.endsWith('Max')?'max':'mean'];
   const values=results.map(r=>group==='ERA'?r.ERA[kind]:r.roles[group][stat][kind]);comparison.push({group,stat,kind,target:range,mean:mean(values),observed:[Math.min(...values),Math.max(...values)],within:values.filter(n=>n>=range[0]&&n<=range[1]).length,seasons:n});
 }
 const workloadSummary=Object.fromEntries(Object.keys(proPitchingWorkloadTargets).map(role=>{const rows=results.map(r=>r.workload[role]),samples=rows.reduce((sum,r)=>sum+r.n,0),g=rows.reduce((sum,r)=>sum+r.games*r.n,0),ip=rows.reduce((sum,r)=>sum+r.innings*r.n,0);return[role,{target:proPitchingWorkloadTargets[role],samples,games:g/Math.max(1,samples),innings:ip/Math.max(1,samples),perGame:ip/Math.max(1,g)}];}));
 mkdirSync('outputs/pro-balance',{recursive:true});writeFileSync(`outputs/pro-balance/${report}.json`,JSON.stringify({balanceVersion:PRO_BALANCE_VERSION,start,seasons:n,scope:'Fixed tools, real 720-game schedule, daily NPC fatigue policy and normal registration/workload relief swaps; no growth, injuries, trades or season-to-season aging. Records are not clamped.',comparison,workloadSummary,results},null,2));
 console.table(comparison);
}
