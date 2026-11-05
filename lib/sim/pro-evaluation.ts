import {clamp,emptyRecord,isPitcher,mergeRecord,ops,ovr,roleScore} from "./engine";
import type {GameState,Player,RecordLine} from "./types";
import type {ProAward} from "./pro-types";

export function performanceValue(p:Player,records:RecordLine,farm=false) {
  const r=records,pit=r.pitching,b=r.batting;
  const value=isPitcher(p.primaryRole)?pit.BF?50+((pit.SO-1.5*pit.BB-2*pit.HR)/pit.BF-.13)*120:50:b.PA?50+((ops(r)??.72)-.72)*65:50;
  return clamp(value,0,farm?70:100);
}
export function contractValue(p:Player,year:number) {
  const rows=[{year,first:p.seasonByLevel?.first,second:p.seasonByLevel?.second},...p.career.filter(r=>r.careerMode==="pro").map(r=>({year:r.year,first:r.byLevel?.first,second:r.byLevel?.second}))];
  let performance=0,weights=0;
  for(let ago=0;ago<3;ago++){const r=rows.find(r=>r.year===year-ago);if(!r)continue;const weight=[.6,.3,.1][ago],first=r.first??emptyRecord(),second=r.second??emptyRecord();
    const n=isPitcher(p.primaryRole)?first.pitching.outs/3:first.batting.PA,target=isPitcher(p.primaryRole)?30:100,blend=Math.min(1,n/target);
    performance+=weight*(blend*performanceValue(p,first)+(1-blend)*performanceValue(p,second,true));weights+=weight;
  }
  const age=p.age??19,potential=age<=23?80:age<=29?65:Math.max(15,65-(age-29)*5),availability=p.injury?Math.max(20,100-p.injury.penaltyRemaining*5):100-p.fatigue*.3;
  return .45*(weights?performance/weights:50)+.3*roleScore(p)+.1*potential+.1*availability+.05*(p.reputation??50);
}
export function awardMerit(p:Player,r:RecordLine,league:RecordLine) {
  const b=r.batting,q=r.pitching,pitching=isPitcher(p.primaryRole),n=pitching?q.outs/3:b.PA;
  const raw=pitching?q.outs?((league.pitching.outs?league.pitching.ER*27/league.pitching.outs:4.5)-q.ER*27/q.outs)*n*.4+q.SO*.2-q.BB*.15:0
    :((ops(r)??0)-(ops(league)??.72))*n+(b.HR+b.RBI)*.15;
  return {raw,n,pitching};
}
export function regularAwards(s:GameState):ProAward[] {
  const year=s.calendar.seasonYear,players=s.players.filter(p=>p.professional&&p.seasonByLevel),league=emptyRecord(),awards:ProAward[]=[];
  for(const p of players)mergeRecord(league,p.seasonByLevel!.first);
  const games=144,add=(kind:string,p:Player,value:number)=>awards.push({year,kind,playerId:p.id,playerName:p.name,club:p.teamId<0?p.professional!.contract?.club??p.professional!.firstClub:p.teamId%10,value});
  const titles:[string,(r:RecordLine)=>number, (r:RecordLine)=>boolean,boolean][]=[
    ["타율",r=>r.batting.H/r.batting.AB,r=>r.batting.PA>=Math.ceil(games*3.1)&&r.batting.AB>0,false],
    ["홈런",r=>r.batting.HR,r=>r.batting.PA>0,false],["타점",r=>r.batting.RBI,r=>r.batting.PA>0,false],["안타",r=>r.batting.H,r=>r.batting.PA>0,false],
    ["평균자책점",r=>r.pitching.ER*27/r.pitching.outs,r=>r.pitching.outs>=games*3,true],["탈삼진",r=>r.pitching.SO,r=>r.pitching.BF>0,false]];
  for(const [kind,value,qualifies,low] of titles){const candidates=players.filter(p=>qualifies(p.seasonByLevel!.first));if(!candidates.length)continue;
    const best=(low?Math.min:Math.max)(...candidates.map(p=>value(p.seasonByLevel!.first)));
    for(const p of candidates)if(Math.abs(value(p.seasonByLevel!.first)-best)<1e-10)add(kind,p,best);
  }
  const candidates=players.filter(p=>p.seasonByLevel!.first.batting.PA>=100||p.seasonByLevel!.first.pitching.outs>=90),merits=candidates.map(p=>({p,...awardMerit(p,p.seasonByLevel!.first,league)}));
  const normalize=(row:typeof merits[number])=>{const group=merits.filter(m=>m.pitching===row.pitching),mean=group.reduce((n,m)=>n+m.raw,0)/Math.max(1,group.length),sd=Math.sqrt(group.reduce((n,m)=>n+(m.raw-mean)**2,0)/Math.max(1,group.length));return (sd?(row.raw-mean)/sd:0)*10+Math.log1p(row.n)*3;};
  const ranked=merits.map(m=>({...m,score:normalize(m)})).sort((a,b)=>b.score-a.score||b.n-a.n||((s.teams[b.p.teamId]?.wins??0)-(s.teams[a.p.teamId]?.wins??0))||a.p.id.localeCompare(b.p.id));
  if(ranked[0])add("시즌 MVP",ranked[0].p,ranked[0].score);
  const rookie=ranked.find(({p})=>{if(year-p.professional!.rookieYear>2)return false;const prior=emptyRecord();for(const r of p.career)if(r.careerMode==="pro"&&r.year<year&&r.byLevel)mergeRecord(prior,r.byLevel.first);return prior.batting.PA<50&&prior.pitching.outs<60;});
  if(rookie)add("신인상",rookie.p,rookie.score);
  for(let club=0;club<10;club++){const farm=players.filter(p=>p.teamId>=0&&p.teamId%10===club&&(p.seasonByLevel!.second.batting.PA>=50||p.seasonByLevel!.second.pitching.outs>=30)).sort((a,b)=>performanceValue(b,b.seasonByLevel!.second,true)-performanceValue(a,a.seasonByLevel!.second,true)||ovr(b)-ovr(a)||a.id.localeCompare(b.id));if(farm[0])add("구단 육성 우수 선수",farm[0],performanceValue(farm[0],farm[0].seasonByLevel!.second,true));}
  return awards;
}
