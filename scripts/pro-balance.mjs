import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const {createProfessionalDemo}=require('../.test-build/lib/sim/pro-career.js');
const {PRO_BALANCE_VERSION,proSeasonTargets}=require('../.test-build/lib/sim/pro-balance.js');
e.params['pro_events.enabled']=0;e.params['events.focus_chance']=0;
const mean=a=>a.reduce((s,x)=>s+x,0)/(a.length||1);
const sum=(rs,k)=>rs.reduce((s,r)=>s+(r[k]??0),0);
export function runSeason(seed){
 const s=createProfessionalDemo(seed,'밸런스검증','SS');
 // Match-engine season probe: fixed roster and tools, normal daily recovery,
 // no training/events/injuries. Career-level changes are tested separately.
 s.playerId='balance-observer';delete s.careerNotice;
 const games=s.calendar.events.filter(g=>g.competitionId==='pro-first').sort((a,b)=>a.date.localeCompare(b.date));
 let previous=games[0].date,forfeits=0;
 for(const g of games){
   if(g.date!==previous){for(let date=previous;date<g.date;date=e.addDays(date,1))for(const p of s.players){e.npcPolicy(p,date,games.some(x=>x.date===date&&(x.homeTeamId===p.teamId||x.awayTeamId===p.teamId)));p.fatigue=e.trainingFatigueDay(p.fatigue,p.stats.recovery,p.trainingPolicy).end;}previous=g.date;}
   s.date=g.date;
   if(!e.simulateGame(s,g,[g.homeTeamId,g.awayTeamId].map(t=>s.players.filter(p=>p.teamId===t))))throw Error('unexpected event');
   if(g.status==='forfeit')forfeits++;
   else {
     const rs=Object.values(g.boxScore);
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
 return {seed,games:games.length,forfeits,hitters:hs.length,pitchers:ps.length,H:metric(h,x=>x.H),HR:metric(h,x=>x.HR),RBI:metric(h,x=>x.RBI),AVG:{max:Math.max(...qualified.map(x=>x.r.batting.H/x.r.batting.AB)),mean:sum(h,'H')/sum(h,'AB')},OPS:{max:Math.max(...qualified.map(x=>e.ops(x.r))),mean:(sum(h,'H')+sum(h,'BB'))/sum(h,'PA')+(sum(h,'H')+sum(h,'2B')+2*sum(h,'3B')+3*sum(h,'HR'))/sum(h,'AB')},ERA:{min:Math.min(...qp.map(x=>27*x.r.pitching.ER/x.r.pitching.outs)),mean:27*sum(p,'ER')/sum(p,'outs')},K:metric(p,x=>x.SO),roles};
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
 mkdirSync('outputs/pro-balance',{recursive:true});writeFileSync(`outputs/pro-balance/${report}.json`,JSON.stringify({balanceVersion:PRO_BALANCE_VERSION,start,seasons:n,scope:'Fixed tools/roster, real 720-game schedule, daily NPC fatigue policy; no growth, injuries, promotions or season-to-season aging. Records are not clamped.',comparison,results},null,2));
 console.table(comparison);
}
