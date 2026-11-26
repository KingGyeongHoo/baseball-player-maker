import {refreshCareerEvaluation,syncClubAwardCounts} from './pro-career-evaluation';
import {retirementEligibility,retirementHonorRules} from './retirement-honors';
import {reservedJerseyNumbers} from '../permanent-retired-numbers';
import {displayedHonorStatus} from './retirement-honor-status';
import type {GameState,Player} from './types';

export function needsCareerHonorUpgrade(s:GameState){
  if(s.careerMode!=='pro'||!s.proWorld)return false;
  const pro=s.players.find(row=>row.id===s.playerId)?.professional;
  const cutoff=Math.min(pro?.retirementHonorStatus?.year??Infinity,s.calendar.seasonYear-Number(!s.proWorld.seasonClosed));
  return s.proWorld.careerHonorRulesVersion!==7||(!pro?.retirementHonorStatus?.progress||pro.retirementHonorStatus.rulesVersion!==3)&&!!pro?.assessments?.some(row=>row.year<=cutoff);
}
// Rebuild derived honors from original season WAR, never from the old adjusted total.
export function upgradeCareerHonors(s:GameState){
  if(!needsCareerHonorUpgrade(s))return false;
  const w=s.proWorld!,wasDoubled=w.careerHonorRulesVersion===1;
  syncClubAwardCounts(s);
  for(const p of s.players)refreshCareerEvaluation(p);
  const p=s.players.find(row=>row.id===s.playerId),pro=p?.professional;
  if(p&&pro){const status=displayedHonorStatus(s,p);if(status)pro.retirementHonorStatus=status;}
  if(p&&pro&&w.retired){
    const previous=w.retirementHonors?.find(row=>row.playerId===p.id),number=w.retiredNumbers?.find(row=>row.playerId===p.id);
    const departure=[...pro.movements].reverse().find(row=>row.kind==='은퇴'&&row.from!==null);
    const club=previous?.club??number?.club??departure?.from??pro.service.at(-1)?.club;
    if(club!==undefined&&club!==null){
      const date=w.retired.date,year=Number(date.slice(0,4));
      const historical={...p,teamId:club,professional:{...pro,employment:'active',contract:null}} as Player;
      const view={...s,date,calendar:{...s.calendar,seasonYear:year},proWorld:{...w,seasonClosed:true}};
      const result=retirementEligibility(view,historical);
      if(result.ceremony||result.tour){
        const row={club,playerId:p.id,playerName:p.name,date,score:result.score,grade:result.grade,seasons:result.seasons,consecutive:result.consecutive,...(result.debutSeasons>=retirementHonorRules.debutCeremony?{debutClubSeasons:result.debutSeasons}:{}),ceremony:result.ceremony,tour:result.tour};
        if(previous)Object.assign(previous,row);else(w.retirementHonors??=[]).push(row);
      }
      else if(wasDoubled&&previous&&result.score!==null){
        w.retirementHonors=w.retirementHonors?.filter(row=>row.playerId!==p.id);
      }
      if(number){
        const doubledOnly=wasDoubled&&number.criteria&&result.criteria&&number.criteria.clubWar>result.criteria.clubWar+1e-7&&!result.retiredNumber;
        if(doubledOnly)w.retiredNumbers=w.retiredNumbers?.filter(row=>row.playerId!==p.id);
        if(result.grade!=='—')number.grade=result.grade;
        if(result.score!==null)number.score=result.score;
        if(result.criteria)number.criteria=result.criteria;
      }else if(result.retiredNumber&&result.criteria&&Number.isInteger(p.jerseyNumber)&&p.jerseyNumber!>=1&&p.jerseyNumber!<=99&&!reservedJerseyNumbers(s,club).has(p.jerseyNumber!)){
        (w.retiredNumbers??=[]).push({club,number:p.jerseyNumber!,playerId:p.id,playerName:p.name,date,grade:result.grade,score:result.score??Math.min(100,result.criteria.clubWar+result.criteria.awardBonus),criteria:result.criteria});
      }
    }
  }
  w.careerHonorRulesVersion=7;
  return true;
}
