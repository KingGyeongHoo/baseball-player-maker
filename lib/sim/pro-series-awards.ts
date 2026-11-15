import {emptyRecord,mergeRecord} from './engine';
import {proNews} from './pro-world';
import {syncAwardBonuses} from './pro-award-bonuses';
import type {GameState,ProLevel,RecordLine} from './types';
import type {ProSeries} from './pro-types';

export const seriesMvpNames={wildcard:'와일드카드',semi:'준플레이오프',playoff:'플레이오프',final:'한국시리즈'} as const;
export const farmSeriesMvpNames={'semi-a':'2군 준결승 1','semi-b':'2군 준결승 2',final:'2군 챔피언결정전'} as const;
export function settleSeriesMvp(s:GameState,series:ProSeries,announce=true,{level='first',year=s.proWorld!.year}:{level?:ProLevel;year?:number}={}){
  if(series.winner===undefined||series.mvp)return false;
  const totals=new Map<string,RecordLine>(),eligible=new Set(series.rosters[String(series.winner)]??[]);
  for(const game of s.calendar.events){
    if(game.competitionId!==`${level==='second'?'pro-farm-playoffs':'pro-playoffs'}-${series.id}`||game.date.slice(0,4)!==String(year)||game.status!=='completed')continue;
    for(const [id,records] of Object.entries(game.boxScore)){
      if(!eligible.has(id)||!records.batting.PA&&!records.pitching.BF)continue;
      const total=totals.get(id)??emptyRecord();mergeRecord(total,records);totals.set(id,total);
    }
  }
  const ranked=[...totals].flatMap(([id,records])=>{
    const p=s.players.find(p=>p.id===id)??s.proWorld?.archive.find(p=>p.id===id);if(!p)return [];
    const b=records.batting,q=records.pitching;
    const value=b.H+2*b.HR+.8*b.RBI+.4*b.R+.3*b.BB+.25*q.outs+.7*q.SO-2*q.ER-.5*q.H-.4*q.BB;
    return [{p,records,value}];
  }).sort((a,b)=>b.value-a.value||a.p.id.localeCompare(b.p.id));
  const best=ranked[0];if(!best)return false;
  const name=level==='second'?farmSeriesMvpNames[series.id as keyof typeof farmSeriesMvpNames]??`2군 ${series.stage==='final'?'챔피언결정전':'준결승'}`:seriesMvpNames[series.stage];
  series.mvp={year,kind:`${name} MVP`,category:'seriesMvp',series:series.stage,seriesId:series.id,...(level==='second'?{level}:{}),playerId:best.p.id,playerName:best.p.name,club:series.winner,value:best.value,field:best.records.pitching.BF>0&&best.records.batting.PA===0?'pitching':'batting',records:best.records};
  syncAwardBonuses(s);
  if(announce)proNews(s,`${series.mvp.kind} · ${best.p.name} · 출전평가 +1`,`series-mvp:${year}:${level}:${series.id}`);
  return true;
}
export function backfillSeriesMvps(s:GameState){
  const w=s.proWorld;if(!w)return false;
  let changed=false;
  const restore=(series:ProSeries,level:ProLevel,year:number)=>{
    changed=settleSeriesMvp(s,series,false,{level,year})||changed;
    const season=w.seasons.find(row=>row.year===year),award=series.mvp;
    if(season&&award&&!season.awards.some(row=>row.category==='seriesMvp'&&(row.level??'first')===level&&(row.seriesId&&award.seriesId?row.seriesId===award.seriesId:row.series===award.series))){season.awards.push(award);changed=true;}
  };
  for(const series of w.postseason?.series??[])restore(series,'first',w.year);
  for(const series of w.farmPostseason?.series??[])restore(series,'second',w.year);
  for(const season of w.seasons)for(const series of season.farmPostseason?.series??[])restore(series,'second',season.year);
  return changed;
}
