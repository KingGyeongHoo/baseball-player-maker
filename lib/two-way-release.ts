import {addDays,getPlayer,isPitcher,positions,reputationScore} from './sim/engine';
import {focusProRole} from './sim/pro-two-way';
import {opportunityState} from './sim/career-opportunities';
import {syncJerseyNumbers} from './jersey-numbers';
import {captureEvaluationChange} from './sim/evaluation-lifecycle';
import type {GameState} from './sim/types';

export type TwoWayFocus='pitching'|'batting';
export function releaseTwoWay(input:GameState,focus:TwoWayFocus):GameState {
  if(!['pitching','batting'].includes(focus))throw new Error('집중할 투수·타자 분야를 선택해 주세요.');
  if(input.phase==='ended'||input.weekProgress||input.matchProgress||input.careerEvent||input.careerNotice||input.pendingEventOutcome)throw new Error('현재 진행을 마친 뒤 겸업 해제를 신청해 주세요.');
  const before=getPlayer(input);
  if(!before.twoWay)throw new Error('겸업 선수만 해제를 신청할 수 있습니다.');
  const s=structuredClone(input),p=getPlayer(s),oldPosition=p.position,oldReputation=p.reputation??0,pair={pitchingPosition:p.twoWay!.pitchingPosition,battingPosition:p.twoWay!.battingPosition};
  focusProRole(p,focus==='pitching');
  p.reputation=reputationScore(p);
  if(p.professional){
    const review=p.professional.twoWayReview;
    if(review){review.qualifiedDays=review.belowDays=0;review.nextProposalDate=addDays(s.date,91);}
    p.professional.twoWayHistory??=[];
    p.professional.twoWayHistory.push({date:s.date,action:'겸업 해제 신청',positions:pair,reason:`${positions[p.position]} 역할에 집중하기로 했습니다.`});
  }else{
    const ledger=opportunityState(s);ledger.qualifiedWeeks=0;
    if(!ledger.twoWayOfferedGrades.includes(p.grade))ledger.twoWayOfferedGrades.push(p.grade);
  }
  s.careerEventHistory??=[];
  s.careerEventHistory.push({id:`${p.id}:${s.date}:two-way-release:${s.careerEventHistory.length}`,definitionId:'TWO_WAY_RELEASE',kind:'special',date:s.date,title:'겸업 해제 신청',choice:isPitcher(p.primaryRole)?'투수에 집중':'타자에 집중',message:`겸업을 해제하고 ${positions[p.position]} 역할에 집중합니다.`,stats:{},reputation:(p.reputation??0)-oldReputation,fatigue:0,awakened:[],positionChange:{from:oldPosition,to:p.position}});
  return captureEvaluationChange(syncJerseyNumbers(s),before);
}
