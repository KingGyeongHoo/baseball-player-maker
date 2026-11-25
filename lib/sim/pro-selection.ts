import {clamp,emptyRecord,isPitcher,ops,params,roles,roleScore} from "./engine";
import {hasShopItem} from './offseason-shop';
import {leftPitcherMultiplier} from './handedness';
import {mergeRecentRecord,recentSample} from './recent-records';
import type {Player,RecordLine,Role} from "./types";

export const proSelectionRules={farmWeight:.65,battingPrior:100,pitchingPrior:120,seasonPitchingPriorOuts:90,seasonMax:24,recentMax:1} as const;

// Temporary rest affects game usage, not the player's displayed evaluation.
export const proManagementPenalty=(p:Player,date?:string)=>p.professional?.managedUntil&&(!date||date<=p.professional.managedUntil)?12:0;
export const wildcardDeclineSelectionBonus=2;
type Records={first?:RecordLine;second?:RecordLine};

// Legacy fields remain readable in old files, but no professional decision or
// new observation retains a reputation rating or bonus.
export function clearProfessionalReputation(p:Player){
  if(p.careerMode!=="pro"&&!p.professional)return false;
  const changed=p.reputation!==null||p.performanceReputation!=null||!!p.reputationEvaluation||p.reputationBonus!==undefined
    ||!!p.professional?.proBonus||p.professional?.allstarBonus!==undefined||!!p.twoWay?.reputationBonus;
  p.reputation=null;p.performanceReputation=null;delete p.reputationEvaluation;delete p.reputationBonus;
  if(p.professional){p.professional.proBonus=0;delete p.professional.allstarBonus;}
  if(p.twoWay)p.twoWay.reputationBonus=0;
  return changed;
}

// A rate-based season assessment for today's selection, independent of WAR,
// playing-time accumulation, reputation, fatigue and the other batting/pitching field.
function form(record:RecordLine|undefined,pitching:boolean,season=false){
  const sample=record?(pitching?record.pitching.BF:record.batting.PA):0;
  if(!record||sample<=0)return {value:0,quality:0,reliability:0,sample:0};
  let quality:number;
  if(pitching){
    const r=record.pitching,component=((r.SO-1.5*r.BB-2*r.HR)/sample-.13)*6;
    quality=r.outs>0?.7*component+.3*(4-r.ER*27/r.outs)/4:component;
  }else quality=((ops(record)??.72)-.72)*3.25;
  const useInnings=pitching&&season;
  const workload=useInnings?record.pitching.outs:sample;
  const prior=useInnings?proSelectionRules.seasonPitchingPriorOuts:pitching?proSelectionRules.pitchingPrior:proSelectionRules.battingPrior;
  const reliability=workload/(workload+prior);
  quality=clamp(quality,-1,1);
  return {value:quality*reliability,quality,reliability,sample};
}

export function proSeasonForm(p:Player,role:Role=p.primaryRole,records:Records|undefined=p.seasonByLevel){
  const pitching=isPitcher(role),spring=form(records===p.seasonByLevel?p.seasonSpring:undefined,pitching),first=form(records?.first,pitching),second=form(records?.second,pitching);
  return {value:clamp(first.value+second.value*proSelectionRules.farmWeight*(1-first.reliability)+spring.value*.65*(1-first.reliability)*(1-second.reliability),-1,1),sample:first.sample+second.sample+spring.sample};
}

function regularSeasonForm(records:Records|undefined,pitching:boolean){
  const first=form(records?.first,pitching,true),farm=form(records?.second,pitching,true);
  const farmWeight=proSelectionRules.farmWeight*(1-first.reliability);
  return {value:first.value+farm.value*farmWeight,reliability:first.reliability+farm.reliability*farmWeight};
}

export function rawProSelectionScore(p:Player,role:Role=p.primaryRole){
  const pitching=isPitcher(role),limit=params[pitching?"coach.recent_outs":"coach.recent_pa"];
  const year=p.professional?.registration?.year;
  const previous=year===undefined?undefined:p.career.findLast(row=>row.year===year-1&&row.careerMode==='pro');
  const currentForm=regularSeasonForm(p.seasonByLevel,pitching),previousForm=regularSeasonForm(previous?.byLevel,pitching);
  const seasonForm=currentForm.value+previousForm.value*(1-currentForm.reliability);
  const recent=emptyRecord();
  let sample=0;
  for(let index=p.recentAppearances.length-1;index>=0&&sample<limit;index--){
    const appearance=p.recentAppearances[index];
    mergeRecentRecord(recent,appearance);
    sample+=recentSample(appearance,pitching);
  }
  const recentWorkload=pitching?Math.max(sample,recent.pitching.BF/2):sample;
  const recentAdjustment=limit>0?proSelectionRules.recentMax*form(recent,pitching).quality*Math.min(1,recentWorkload/limit):0;
  return clamp(roleScore(p,role)*leftPitcherMultiplier(p,role)+proSelectionRules.seasonMax*seasonForm+recentAdjustment+clamp(p.professional?.eventSelectionBonus??0,-5,5)
    -(p.proContract?.status==="developmental"?6:0)+(p.professional?.wildcardDeclines?.length??0)*wildcardDeclineSelectionBonus,0,100);
}

// Update only at simulation boundaries; reading a score must never change a save.
export function syncTrainingDiary(p:Player){
  const shop=p.offseasonShop,year=p.professional?.registration?.year;
  if(!shop)return;
  if(year===undefined||shop.settlement?.year===year||!hasShopItem(p,'trainingDiary',year)){
    delete shop.trainingDiary;return;
  }
  if(shop.trainingDiary?.year!==year)shop.trainingDiary={year,peaks:{}};
  for(const role of roles)shop.trainingDiary.peaks[role]=Math.max(shop.trainingDiary.peaks[role]??0,rawProSelectionScore(p,role));
}

export function proSelectionScore(p:Player,role:Role=p.primaryRole){
  const score=rawProSelectionScore(p,role),diary=p.offseasonShop?.trainingDiary,year=p.professional?.registration?.year;
  const peak=diary?.year===year&&p.offseasonShop?.settlement?.year!==year&&hasShopItem(p,'trainingDiary',year)?diary?.peaks[role]:undefined;
  return peak===undefined?score:score+Math.max(0,peak-score)*.5;
}

export function nationalSelectionScore(p:Player,role:Role,records?:RecordLine){
  return clamp(roleScore(p,role)*leftPitcherMultiplier(p,role)+params["coach.pro_recent_max"]*form(records,isPitcher(role)).value,0,100);
}
