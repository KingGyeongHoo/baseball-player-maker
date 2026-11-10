import {goldGloveAwards} from "./pro-evaluation";
import {individualAwards} from "./pro-individual-awards";
import {proNotice} from "./pro-world";
import type {GameState} from "./types";

export const awardsDate=(year:number)=>`${year}-12-06`;
export function ensureAwardsCeremony(s:GameState){
  const w=s.proWorld,season=w?.seasons.find(row=>row.year===w.year);
  if(!w?.seasonClosed||!season||s.date>`${w.year}-12-31`)return;
  season.individualAwards??=individualAwards(s);
  if(season.awardsCeremony)return;
  // An ongoing legacy winter still has its season records. Preserve announced
  // MVPs and add only the new positional awards, never reroll past trophies.
  if(!season.awards.some(row=>row.category==="goldGlove"))season.awards.push(...goldGloveAwards(s));
  for(const row of season.awards)if(row.kind==="시즌 MVP"){
    row.category="mvp";
    const p=s.players.find(p=>p.id===row.playerId);if(p&&!row.records){row.records=structuredClone(p.seasonByLevel!.first);row.field=p.seasonByLevel!.first.pitching.outs>0&&p.seasonByLevel!.first.batting.PA===0?"pitching":"batting";}
  }
  if(season.awards.some(row=>row.category))season.awardsCeremony={version:1,scheduledAt:awardsDate(season.year)};
}
export function presentAwardsCeremony(s:GameState){
  ensureAwardsCeremony(s);const season=s.proWorld?.seasons.find(row=>row.year===s.proWorld!.year),ceremony=season?.awardsCeremony;
  if(!season||!ceremony||ceremony.presentedAt||s.date<ceremony.scheduledAt)return false;
  ceremony.presentedAt=s.date;
  proNotice(s,`awards:${season.year}`,`${season.year} 골든글러브 시상식`,"한 시즌을 빛낸 포지션별 최고의 선수와 시즌 MVP를 발표합니다. 1군 정규시즌 기록만으로 선정했습니다.");
  return true;
}
