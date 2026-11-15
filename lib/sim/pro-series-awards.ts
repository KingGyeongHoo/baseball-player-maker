import {emptyRecord,mergeRecord} from './engine';
import {proNews} from './pro-world';
import {syncAwardBonuses} from './pro-award-bonuses';
import type {GameState,RecordLine} from './types';
import type {ProSeries} from './pro-types';

export const seriesMvpNames={wildcard:'와일드카드',semi:'준플레이오프',playoff:'플레이오프',final:'한국시리즈'} as const;
export function settleSeriesMvp(s:GameState,series:ProSeries,announce=true){
  if(series.winner===undefined||series.mvp)return false;
  const totals=new Map<string,RecordLine>(),eligible=new Set(series.rosters[String(series.winner)]??[]);
  for(const game of s.calendar.events){
    if(game.competitionId!==`pro-playoffs-${series.id}`||game.status!=='completed')continue;
    for(const [id,records] of Object.entries(game.boxScore)){
      if(!eligible.has(id)||!records.batting.PA&&!records.pitching.BF)continue;
      const total=totals.get(id)??emptyRecord();mergeRecord(total,records);totals.set(id,total);
    }
  }
  const ranked=[...totals].flatMap(([id,records])=>{
    const p=s.players.find(p=>p.id===id);if(!p)return [];
    const b=records.batting,q=records.pitching;
    const value=b.H+2*b.HR+.8*b.RBI+.4*b.R+.3*b.BB+.25*q.outs+.7*q.SO-2*q.ER-.5*q.H-.4*q.BB;
    return [{p,records,value}];
  }).sort((a,b)=>b.value-a.value||a.p.id.localeCompare(b.p.id));
  const best=ranked[0];if(!best)return false;
  series.mvp={year:s.proWorld!.year,kind:`${seriesMvpNames[series.stage]} MVP`,category:'seriesMvp',series:series.stage,playerId:best.p.id,playerName:best.p.name,club:series.winner,value:best.value,field:best.records.pitching.BF>0&&best.records.batting.PA===0?'pitching':'batting',records:best.records};
  syncAwardBonuses(s);
  if(announce)proNews(s,`${series.mvp.kind} · ${best.p.name} · 출전평가 +1`,`series-mvp:${s.proWorld!.year}:${series.id}`);
  return true;
}
export function backfillSeriesMvps(s:GameState){
  let changed=false;
  for(const series of s.proWorld?.postseason?.series??[])changed=settleSeriesMvp(s,series,false)||changed;
  const season=s.proWorld?.seasons.find(row=>row.year===s.proWorld!.year);
  if(season)for(const series of s.proWorld?.postseason?.series??[]){const award=series.mvp;if(award&&!season.awards.some(row=>row.category==='seriesMvp'&&row.series===award.series)){season.awards.push(award);changed=true;}}
  return changed;
}
