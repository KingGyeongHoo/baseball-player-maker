import {goldGloveAwards} from "./pro-evaluation";
import {individualAwardRows,individualAwards} from "./pro-individual-awards";
import {proNotice} from "./pro-world";
import {syncAwardBonuses,awardBonusPoints} from './pro-award-bonuses';
import {getPlayer,isPitcher,positions} from './engine';
import {backfillSeasonHonors} from './pro-historical-awards';
import type {GameState} from "./types";
import {refreshSeasonEvaluations} from './pro-season-evaluation';

export const awardsDate=(year:number)=>`${year}-12-06`;
export function queuePersonalAwardNotices(s:GameState,year:number,beforeScore?:number){
  const season=s.proWorld?.seasons.find(row=>row.year===year),ceremony=season?.awardsCeremony;
  if(!season||!ceremony?.presentedAt)return;
  const p=getPlayer(s),order=['mvp','rookie','goldGlove'];
  const owned=season.awards.filter(award=>award.playerId===p.id&&order.includes(award.category??'')).sort((a,b)=>order.indexOf(a.category!)-order.indexOf(b.category!));
  let cursor=beforeScore;
  const after=p.professional?.assessments?.find(row=>row.year===year)?.score??0;
  const notices:NonNullable<GameState['careerNotice']>[]=ceremony.celebrationsQueued?[]:owned.map(award=>{
    const category=award.category as 'mvp'|'rookie'|'goldGlove',bonus=awardBonusPoints[category];
    const title=category==='mvp'?'MVP':category==='rookie'?'신인왕':`${award.position==='P'?'투수':award.position?positions[award.position]:award.kind.replace('골든글러브 · ','')} 골든글러브`;
    const applied=cursor===undefined?undefined:Math.min(bonus,Math.max(0,after-cursor)),before=cursor;
    if(cursor!==undefined)cursor+=applied??0;
    return {id:`award-celebration:${year}:${category}:${award.position??''}`,date:s.date,kind:'pro' as const,code:`award-celebration:${year}:${category}:${award.position??''}`,title:`${year}년 ${title}${category==='rookie'?'을':'를'} 획득했다!!`,message:`시즌 평가 수상 보너스 +${bonus}`,award:{year,title,bonus,after:cursor??after,...(before!==undefined?{before,applied}:{})}};
  });
  ceremony.celebrationsQueued=true;
  if(!ceremony.individualTitlesQueued){
    ceremony.individualTitlesQueued=true;
    const assessment=p.professional?.assessments?.find(row=>row.year===year);
    const level=(assessment?.squad??(p.teamId>=0&&p.teamId<10?'first':'second'))==='first'?'first':'second';
    const field=isPitcher(assessment?.role??p.primaryRole)?'pitching':'batting';
    if(individualAwardRows(season.individualAwards,level,field).some(row=>row.winners.some(winner=>winner.playerId===p.id))){
      notices.push({id:`individual-titles:${year}`,date:s.date,kind:'pro',code:`individual-titles:${year}`,title:'타이틀 획득!',message:'',individualTitles:{year,level,field}});
    }
  }
  if(!notices.length)return;
  const queue=s.noticeQueue??=[];
  const lastAwardIndex=queue.reduce((last,notice,index)=>notice.code===`awards:${year}`||notice.award?.year===year?index:last,-1);
  queue.splice(lastAwardIndex+1,0,...notices);
}
export function ensureAwardsCeremony(s:GameState){
  const w=s.proWorld,season=w?.seasons.find(row=>row.year===w.year);
  if(!w?.seasonClosed||!season||s.date>`${w.year}-12-31`)return;
  backfillSeasonHonors(s);
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
  const beforeScore=getPlayer(s).professional?.assessments?.find(row=>row.year===season.year)?.score??undefined;
  ceremony.presentedAt=s.date;
  syncAwardBonuses(s);
  refreshSeasonEvaluations(s,season.year);
  proNotice(s,`awards:${season.year}`,`${season.year} 골든글러브 시상식`,"한 시즌을 빛낸 포지션별 최고의 선수와 시즌 MVP·신인왕을 발표합니다.");
  queuePersonalAwardNotices(s,season.year,beforeScore);
  return true;
}
