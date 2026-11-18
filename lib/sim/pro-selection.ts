import {clamp,emptyRecord,isPitcher,ops,params,roleScore} from "./engine";
import {leftPitcherMultiplier} from './handedness';
import {mergeRecentRecord,recentSample} from './recent-records';
import type {Player,RecordLine,Role} from "./types";

export const proSelectionRules={farmWeight:.65,battingPrior:100,pitchingPrior:120} as const;
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
function form(record:RecordLine|undefined,pitching:boolean){
  const sample=record?(pitching?record.pitching.BF:record.batting.PA):0;
  if(!record||sample<=0)return {value:0,reliability:0,sample:0};
  let quality:number;
  if(pitching){
    const r=record.pitching,component=((r.SO-1.5*r.BB-2*r.HR)/sample-.13)*6;
    quality=r.outs>0?.7*component+.3*(4-r.ER*27/r.outs)/4:component;
  }else quality=((ops(record)??.72)-.72)*3.25;
  const reliability=sample/(sample+(pitching?proSelectionRules.pitchingPrior:proSelectionRules.battingPrior));
  return {value:clamp(quality,-1,1)*reliability,reliability,sample};
}

export function proSeasonForm(p:Player,role:Role=p.primaryRole,records:Records|undefined=p.seasonByLevel){
  const pitching=isPitcher(role),spring=form(records===p.seasonByLevel?p.seasonSpring:undefined,pitching),first=form(records?.first,pitching),second=form(records?.second,pitching);
  return {value:clamp(first.value+second.value*proSelectionRules.farmWeight*(1-first.reliability)+spring.value*.65*(1-first.reliability)*(1-second.reliability),-1,1),sample:first.sample+second.sample+spring.sample};
}

export function proSelectionScore(p:Player,role:Role=p.primaryRole){
  const pitching=isPitcher(role),limit=params[pitching?"coach.recent_outs":"coach.recent_pa"];
  const recent=emptyRecord();
  let sample=0;
  for(let index=p.recentAppearances.length-1;index>=0&&sample<limit;index--){
    const appearance=p.recentAppearances[index];
    mergeRecentRecord(recent,appearance);
    sample+=recentSample(appearance,pitching);
  }
  return clamp(roleScore(p,role)*leftPitcherMultiplier(p,role)+params["coach.pro_recent_max"]*form(recent,pitching).value
    -(p.proContract?.status==="developmental"?6:0)-(p.professional?.managedUntil?12:0),0,100);
}

export function nationalSelectionScore(p:Player,role:Role,records?:RecordLine){
  return clamp(roleScore(p,role)*leftPitcherMultiplier(p,role)+params["coach.pro_recent_max"]*form(records,isPitcher(role)).value,0,100);
}
