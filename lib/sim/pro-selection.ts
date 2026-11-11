import {clamp,isPitcher,ops,params,roleScore} from "./engine";
import type {Player,RecordLine,Role} from "./types";

export const proSelectionRules={seasonWeight:.85,recentWeight:.15,farmWeight:.65,battingPrior:100,pitchingPrior:120,recentDeadband:1} as const;
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
  const pitching=isPitcher(role),first=form(records?.first,pitching),second=form(records?.second,pitching);
  return {value:clamp(first.value+second.value*proSelectionRules.farmWeight*(1-first.reliability),-1,1),sample:first.sample+second.sample};
}

export function proSelectionScore(p:Player,role:Role=p.primaryRole,records:Records|undefined=p.seasonByLevel,includeRecent=true){
  const season=proSeasonForm(p,role,records),pitching=isPitcher(role);
  // Ordinary fluctuations within one standard deviation do not move selection.
  // A complete recent window can move it by at most 15% of the seven-point cap.
  const recent=includeRecent?Math.sign(p.recentZ)*clamp(Math.abs(p.recentZ)-proSelectionRules.recentDeadband,0,1)
    *Math.min(1,season.sample/(pitching?proSelectionRules.pitchingPrior:params["coach.recent_pa"])):0;
  return clamp(roleScore(p,role)+params["coach.pro_recent_max"]*(proSelectionRules.seasonWeight*season.value+proSelectionRules.recentWeight*recent)
    -(p.proContract?.status==="developmental"?6:0)-(p.professional?.managedUntil?12:0),0,100);
}
