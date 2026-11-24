import {retirementEligibility} from './retirement-honors';
import type {GameState,Player} from './types';
import type {ProfessionalPlayer} from './pro-types';

type HonorStatus=NonNullable<ProfessionalPlayer['retirementHonorStatus']>;

export function seasonEndHonorStatus(s:GameState,p:Player):HonorStatus{
  const year=s.calendar.seasonYear,eligibility=retirementEligibility(s,p);
  const debut=p.professional?.firsts.debut;
  return {rulesVersion:2,year,debutSeasons:debut?Math.max(0,year-Number(debut.slice(0,4))+1):0,ceremony:eligibility.ceremony,tour:eligibility.tour,retiredNumber:eligibility.retiredNumber};
}

export function displayedHonorStatus(s:GameState,p:Player):HonorStatus|undefined{
  const pro=p.professional;
  if(!pro)return;
  if(pro.retirementHonorStatus?.rulesVersion===2)return pro.retirementHonorStatus;
  // Older saves reconstruct the last completed season without counting this year's progress.
  const cutoff=Math.min(pro.retirementHonorStatus?.year??Infinity,s.calendar.seasonYear-Number(!s.proWorld?.seasonClosed));
  const year=Math.max(...(pro.assessments??[]).filter(row=>row.year<=cutoff).map(row=>row.year));
  if(!Number.isFinite(year))return;
  const stint=pro.service.findLast(row=>row.from<=year&&row.to>=year);
  const club=stint?.club;
  const past:Player={...p,teamId:club??-1,professional:{...pro,employment:club===undefined?'freeAgent':'active',contract:pro.contract&&club!==undefined?{...pro.contract,club}:null,assessments:pro.assessments?.filter(row=>row.year<=year),service:pro.service.filter(row=>row.from<=year).map(row=>({...row,to:Math.min(row.to,year)})),movements:pro.movements.filter(row=>Number(row.date.slice(0,4))<=year)}};
  const state:GameState={...s,date:`${year}-12-31`,calendar:{...s.calendar,seasonYear:year},proWorld:s.proWorld?{...s.proWorld,year,seasonClosed:true}:undefined};
  return seasonEndHonorStatus(state,past);
}
