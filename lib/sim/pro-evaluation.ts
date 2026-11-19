import {clamp,emptyRecord,isPitcher,mergeRecord,ops,ovr,positions,roleScore,proSelectionScore} from "./engine";
import type {GameState,Player,Position,ProLevel,RecordLine} from "./types";
import type {ProAward,ProIndividualAward} from "./pro-types";
import {individualAwards} from './pro-individual-awards';
import {createProWarContext,levelWarValue,proWarAssessment,proWarRules,type ProWarContext} from './pro-war';
import {clubAwardNames} from './pro-career-evaluation';

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
  return .45*(weights?performance/weights:50)+.3*roleScore(p)+.1*potential+.1*availability+.05*proSelectionScore(p);
}
function recordAwardMerit(r:RecordLine,league:RecordLine,pitching:boolean) {
  const b=r.batting,q=r.pitching,n=pitching?q.outs/3:b.PA;
  const raw=pitching?q.outs?((league.pitching.outs?league.pitching.ER*27/league.pitching.outs:4.5)-q.ER*27/q.outs)*n*.4+q.SO*.2-q.BB*.15:0
    :((ops(r)??0)-(ops(league)??.72))*n+(b.HR+b.RBI)*.15;
  return {raw,n,pitching};
}
export const rookieRulesVersion=2;
const rookieRecordThreshold={batting:60,pitching:30*3};
export function rookieEligibility(p:Player,year:number,field:'batting'|'pitching'){
  const entry=p.professional?.rookieYear,prior=emptyRecord();
  for(const row of p.career)if(row.careerMode==='pro'&&row.year<year&&row.byLevel)mergeRecord(prior,row.byLevel.first);
  const season=entry===undefined?0:year-entry+1;
  return season>=1&&season<=5&&(field==='batting'?prior.batting.PA<=60:prior.pitching.outs<=90);
}
export function rookieOfYearAward(s:GameState):ProAward|undefined{
  const year=s.calendar.seasonYear,players=s.players.filter(p=>p.professional&&p.seasonByLevel),league=emptyRecord();
  for(const p of players)mergeRecord(league,p.seasonByLevel!.first);
  const merits=players.flatMap(p=>(['batting','pitching'] as const).flatMap(field=>{
    const records=p.seasonByLevel!.first,sample=field==='batting'?records.batting.PA:records.pitching.outs;
    return sample>=rookieRecordThreshold[field]?[{p,field,...recordAwardMerit(records,league,field==='pitching')}]:[];
  }));
  const ranked=merits.filter(row=>rookieEligibility(row.p,year,row.field)).map(row=>{
    const group=merits.filter(other=>other.field===row.field),mean=group.reduce((sum,m)=>sum+m.raw,0)/group.length;
    const sd=Math.sqrt(group.reduce((sum,m)=>sum+(m.raw-mean)**2,0)/group.length);
    return {...row,score:(sd?(row.raw-mean)/sd:0)*10+Math.log1p(row.n)*3};
  }).sort((a,b)=>b.score-a.score||b.n-a.n||a.p.id.localeCompare(b.p.id));
  const best=ranked[0];
  return best?{year,kind:'신인왕',category:'rookie',playerId:best.p.id,playerName:best.p.name,club:awardClub(best.p),value:best.score,field:best.field,records:structuredClone(best.p.seasonByLevel!.first)}:undefined;
}
export const goldGlovePositions=["P","C","1B","2B","3B","SS","LF","CF","RF","DH"] as const;
const awardClub=(p:Player)=>p.teamId<0?p.professional!.contract?.club??p.professional!.firstClub:p.teamId%10;
export function goldGloveAwards(s:GameState):ProAward[]{
  const players=s.players.filter(p=>p.professional&&p.seasonByLevel),league=emptyRecord();
  for(const p of players)mergeRecord(league,p.seasonByLevel!.first);
  const starts=new Map<string,Map<Position,number>>();
  for(const game of s.calendar.events){if(game.competitionId!=="pro-first"||game.tiebreaker||game.status!=="completed")continue;
    for(const [id,row] of Object.entries(game.proAppearances??{}))if(row.level==="first"&&row.startedField){const counts=starts.get(id)??new Map<Position,number>();counts.set(row.position,(counts.get(row.position)??0)+1);starts.set(id,counts);}}
  const position=(p:Player)=>{const counts=starts.get(p.id);return counts?.size?[...counts].sort((a,b)=>b[1]-a[1]||goldGlovePositions.indexOf(a[0] as typeof goldGlovePositions[number])-goldGlovePositions.indexOf(b[0] as typeof goldGlovePositions[number]))[0][0]:p.position;};
  return goldGlovePositions.flatMap(slot=>{
    const pitching=slot==="P",ranked=players.filter(p=>pitching?p.seasonByLevel!.first.pitching.outs>=90:p.seasonByLevel!.first.batting.PA>=200&&position(p)===slot)
      .map(p=>({p,...recordAwardMerit(p.seasonByLevel!.first,league,pitching)})).sort((a,b)=>b.raw-a.raw||b.n-a.n||a.p.id.localeCompare(b.p.id));
    const best=ranked[0];return best?[{year:s.calendar.seasonYear,kind:`골든글러브 · ${slot==="P"?"투수":positions[slot]}`,category:"goldGlove" as const,position:slot,field:pitching?"pitching" as const:"batting" as const,playerId:best.p.id,playerName:best.p.name,club:awardClub(best.p),value:best.raw,records:structuredClone(best.p.seasonByLevel!.first)}]:[];
  });
}
export function seasonMvpAward(s:GameState,level:ProLevel,titles=individualAwards(s),context=createProWarContext(s)):ProAward|undefined{
  const crowns=new Map<string,{batting:number;pitching:number}>();
  for(const title of titles)if(title.level===level)for(const {playerId} of title.winners){
    const count=crowns.get(playerId)??{batting:0,pitching:0};
    count[title.field]++;
    crowns.set(playerId,count);
  }
  const candidates=s.players.flatMap(p=>{
    const records=p.seasonByLevel?.[level];
    if(!p.professional||!records||!(records.batting.PA||records.pitching.BF||records.pitching.outs||records.games?.pitching||Object.values(records.fielding?.outs??{}).some(Boolean)))return [];
    const line=proWarAssessment(p,context)[level];
    const position=p.twoWay?.pitchingPosition??p.position,relief=position==='RP'||position==='CP';
    const {batting=0,pitching=0}=crowns.get(p.id)??{};
    return [{p,records,batting,pitching,war:levelWarValue(line,relief),pitchingWar:line.pitching*(relief?proWarRules.relieverWinScale:1),battingWar:line.batting+line.fielding+line.positional}];
  }).sort((a,b)=>b.war-a.war||a.p.id.localeCompare(b.p.id));
  const [leader,runnerUp]=candidates;if(!leader)return;
  const clearLeader=runnerUp&&leader.war-runnerUp.war>=1.5;
  const priority=(row:typeof leader)=>{
    if(row.batting+row.pitching>=4||row===leader&&clearLeader)return 5;
    if(row.pitching>=3)return 4;
    if(row.batting>=3)return 3;
    if(row.pitching>=2)return 2;
    if(row.batting>=2)return 1;
    return 0;
  };
  // Candidates are already sorted by WAR, the tiebreaker within each tier.
  const best=candidates.reduce((highest,row)=>priority(row)>priority(highest)?row:highest,leader);
  const pitch=best.pitching!==best.batting?best.pitching>best.batting:best.pitchingWar>best.battingWar;
  return {year:s.calendar.seasonYear,kind:level==='second'?'2군 시즌 MVP':'시즌 MVP',category:'mvp',...(level==='second'?{level}:{}),playerId:best.p.id,playerName:best.p.name,club:awardClub(best.p),value:best.war,field:pitch?'pitching':'batting',records:structuredClone(best.records)};
}
export function regularAwards(s:GameState,titles:ProIndividualAward[]=individualAwards(s),context:ProWarContext=createProWarContext(s)):ProAward[] {
  const year=s.calendar.seasonYear,players=s.players.filter(p=>p.professional&&p.seasonByLevel),awards:ProAward[]=[];
  const add=(kind:string,p:Player,value:number)=>awards.push({year,kind,playerId:p.id,playerName:p.name,club:p.teamId<0?p.professional!.contract?.club??p.professional!.firstClub:p.teamId%10,value});
  for(const title of titles.filter(row=>row.level==='first'))for(const winner of title.winners){
    const p=players.find(p=>p.id===winner.playerId);if(p)add(title.label,p,title.value);
  }
  for(const level of ['first','second'] as const){const mvp=seasonMvpAward(s,level,titles,context);if(mvp)awards.push(mvp);}
  const rookie=rookieOfYearAward(s);if(rookie)awards.push(rookie);
  const firstTeamAwards=new Map<number,ProAward>();
  for(const p of players){
    const splits=Object.entries(p.seasonByClub??{});
    const playedForMultipleClubs=p.professional!.movements.some(row=>row.kind==='트레이드'&&row.date.startsWith(`${year}-`));
    const position=p.twoWay?.pitchingPosition??p.position;
    const relief=position==='RP'||position==='CP';
    const firstRecords=splits.length?splits.map(([club,row])=>[Number(club),row.first] as const):playedForMultipleClubs?[]:[[awardClub(p),p.seasonByLevel!.first] as const];
    for(const [club,first] of firstRecords){
      if(club<0||club>=10||!first||first.batting.PA<50&&first.pitching.outs<30)continue;
      const war=proWarAssessment({...p,seasonByLevel:{first,second:emptyRecord()}},context).first;
      const value=levelWarValue(war,relief),previous=firstTeamAwards.get(club);
      if(!previous||value>previous.value||value===previous.value&&p.id.localeCompare(previous.playerId)<0){
        firstTeamAwards.set(club,{year,kind:clubAwardNames.first,playerId:p.id,playerName:p.name,club,value,level:'first'});
      }
    }
  }
  for(let club=0;club<10;club++){
    const first=firstTeamAwards.get(club);if(first)awards.push(first);
    const farm=players.filter(p=>p.teamId>=0&&p.teamId%10===club&&(p.seasonByLevel!.second.batting.PA>=50||p.seasonByLevel!.second.pitching.outs>=30)).sort((a,b)=>performanceValue(b,b.seasonByLevel!.second,true)-performanceValue(a,a.seasonByLevel!.second,true)||ovr(b)-ovr(a)||a.id.localeCompare(b.id));
    if(farm[0])add(clubAwardNames.second,farm[0],performanceValue(farm[0],farm[0].seasonByLevel!.second,true));
  }
  return [...awards,...goldGloveAwards(s)];
}
