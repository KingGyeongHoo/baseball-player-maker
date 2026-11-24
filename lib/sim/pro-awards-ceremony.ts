import {syncClubAwardCounts} from './pro-career-evaluation';
import {goldGloveAwards,seasonMvpAward} from "./pro-evaluation";
import {individualAwards} from "./pro-individual-awards";
import {proNotice} from "./pro-world";
import {syncAwardBonuses,awardBonusPoints} from './pro-award-bonuses';
import {getPlayer} from './engine';
import {backfillSeasonHonors} from './pro-historical-awards';
import type {GameState} from "./types";
import {refreshSeasonEvaluations} from './pro-season-evaluation';

export const awardsDate=(year:number)=>`${year}-12-06`;
export function pendingSeasonAwards(s:GameState){
  const w=s.proWorld,season=w?.seasons.find(row=>row.year===w.year);
  return !!w?.seasonClosed&&!!season&&!season.awardsCeremony?.presentedAt&&s.date<=`${w.year}-12-31`;
}
export const seasonEndActionLabel=(s:GameState)=>pendingSeasonAwards(s)?'골든글러브 시상식':'스토브리그';
export function isGoldGloveCelebration(notice:GameState['careerNotice']){
  return !!notice?.award&&(/^award-celebration:\d{4}:goldGlove:/.test(notice.code??'')||notice.award.title.endsWith('골든글러브'));
}
export function isSuppressedAwardCelebration(notice:GameState['careerNotice']){
  return isRemovedAwardCelebration(notice);
}

export function isRemovedAwardCelebration(notice:GameState['careerNotice']){
  return isGoldGloveCelebration(notice)||!!notice?.award&&(/^award-celebration:\d{4}:mvp:/.test(notice.code??'')||/^(?:[12]군 )?MVP$/.test(notice.award.title));
}

export function queuePersonalAwardNotices(s:GameState,year:number,beforeScore?:number){
  const season=s.proWorld?.seasons.find(row=>row.year===year),ceremony=season?.awardsCeremony;
  if(!season||!ceremony?.presentedAt)return;
  const p=getPlayer(s),order=['rookie'];
  const owned=season.awards.filter(award=>award.playerId===p.id&&order.includes(award.category??'')).sort((a,b)=>order.indexOf(a.category!)-order.indexOf(b.category!));
  let cursor=beforeScore;
  const after=p.professional?.assessments?.find(row=>row.year===year)?.score??0;
  const notices:NonNullable<GameState['careerNotice']>[]=ceremony.celebrationsQueued?[]:owned.map(award=>{
    const category='rookie' as const,bonus=awardBonusPoints[category]*(award.level==='second'?.5:1);
    const title='신인왕';
    const applied=cursor===undefined?undefined:Math.min(bonus,Math.max(0,after-cursor)),before=cursor;
    if(cursor!==undefined)cursor+=applied??0;
    const code=`award-celebration:${year}:${category}:${award.position??(award.level==='second'?'second':'')}`;
    return {id:code,date:s.date,kind:'pro' as const,code,title:`${year}년 ${title}${category==='rookie'?'을':'를'} 획득했다!!`,message:`시즌 평가 수상 보너스 +${bonus}`,award:{year,title,bonus,after:cursor??after,...(before!==undefined?{before,applied}:{})}};
  });
  ceremony.celebrationsQueued=true;
  // The season summary already contains every title holder. Discard old queued copies.
  ceremony.individualTitlesQueued=true;
  if(s.noticeQueue)s.noticeQueue=s.noticeQueue.filter(notice=>!notice.individualTitles&&!notice.code?.startsWith('individual-titles:')&&!isRemovedAwardCelebration(notice));
  if(!notices.length)return;
  const queue=s.noticeQueue??=[];
  const lastAwardIndex=queue.reduce((last,notice,index)=>notice.code===`awards:${year}`||notice.code===`awards-summary:${year}`||notice.award?.year===year?index:last,-1);
  queue.splice(lastAwardIndex+1,0,...notices);
}
export function ensureAwardsCeremony(s:GameState){
  const w=s.proWorld,season=w?.seasons.find(row=>row.year===w.year);
  if(!w?.seasonClosed||!season||s.date>`${w.year}-12-31`)return;
  backfillSeasonHonors(s);
  season.individualAwards??=individualAwards(s);
  if(!season.awardsCeremony?.presentedAt&&!season.awards.some(row=>row.category==='mvp'&&row.level==='second')){
    const mvp=seasonMvpAward(s,'second',season.individualAwards);if(mvp)season.awards.push(mvp);
  }
  if(season.awardsCeremony)return;
  // An ongoing legacy winter still has its season records. Preserve announced
  // MVPs and add only the new positional awards, never reroll past trophies.
  if(!season.awards.some(row=>row.category==="goldGlove"))season.awards.push(...goldGloveAwards(s));
  for(const row of season.awards)if(row.kind==="시즌 MVP"){
    row.category="mvp";
    const p=s.players.find(p=>p.id===row.playerId);if(p&&!row.records){row.records=structuredClone(p.seasonByLevel!.first);row.field=p.seasonByLevel!.first.pitching.outs>0&&p.seasonByLevel!.first.batting.PA===0?"pitching":"batting";}
  }
  if(season.awards.length||season.individualAwards?.length)season.awardsCeremony={version:1,scheduledAt:awardsDate(season.year)};
}
export function presentAwardsCeremony(s:GameState,seasonFarewell=false){
  ensureAwardsCeremony(s);const season=s.proWorld?.seasons.find(row=>row.year===s.proWorld!.year),ceremony=season?.awardsCeremony;
  if(!season||!ceremony||ceremony.presentedAt)return false;
  if(seasonFarewell&&s.date<ceremony.scheduledAt)s.date=ceremony.scheduledAt;
  if(s.date<ceremony.scheduledAt)return false;
  const beforeScore=getPlayer(s).professional?.assessments?.find(row=>row.year===season.year)?.score??undefined;
  ceremony.presentedAt=s.date;
  syncAwardBonuses(s);
  syncClubAwardCounts(s);
  refreshSeasonEvaluations(s,season.year);
  proNotice(s,`awards:${season.year}`,`${season.year} 골든글러브 시상식`,"포지션별 골든글러브 수상자를 발표합니다.");
  queuePersonalAwardNotices(s,season.year,beforeScore);
  return true;
}
