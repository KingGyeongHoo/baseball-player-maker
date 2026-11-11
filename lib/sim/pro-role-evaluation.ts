import {addDays,assignRole,available,getPlayer,isPitcher,ovr,positions,roleFor,roleScore} from "./engine";
import {proNotice} from "./pro-world";
import {ensureProEvents,proDayFree} from "./pro-event-ledger";
import type {GameState,Player,Position} from "./types";

export function beginProRoleTrial(s:GameState,position:Position,sourceId:string,currentRequest=false,autoTransition=true){
  const p=getPlayer(s),pro=p.professional!;
  if(pro.employment!=="active"||p.twoWay||pro.roleTrial||p.roleOffer||(!currentRequest&&pro.requestAfter&&s.date<pro.requestAfter))throw new Error("현재 보직 평가 또는 요청 대기가 끝난 뒤 다시 검토할 수 있습니다.");
  if(ovr(p,isPitcher(roleFor(position)))<45||roleScore(p,roleFor(position))<45)throw new Error("목표 분야와 역할 기량이 모두 45 이상이어야 합니다.");
  pro.requestAfter=addDays(s.date,28);pro.roleTrial={version:1,...(autoTransition?{autoTransition:true as const}:{}),position,until:addDays(s.date,14),started:s.date,sourceId,club:p.teamId%10,originalPosition:p.position,originalRole:p.primaryRole,trainingDates:[]};
  return pro.roleTrial;
}
export function recordProRoleTraining(s:GameState,p:Player){const trial=p.professional?.roleTrial;if(trial?.version===1&&s.date<trial.until&&!trial.trainingDates!.includes(s.date))trial.trainingDates!.push(s.date);}
export function reviewProRoleTrial(s:GameState,defer=false){
  const p=getPlayer(s),trial=p.professional?.roleTrial;if(trial?.version!==1||s.date<trial.until||s.careerEvent||s.careerNotice)return false;
  if(!trial.decision){const enough=(trial.trainingDates?.length??0)>=5,aptitude=ovr(p,isPitcher(roleFor(trial.position)))>=45&&roleScore(p,roleFor(trial.position))>=45,healthy=available(p,s.date),sameClub=p.teamId>=0&&p.teamId%10===trial.club;
    const qualified=enough&&aptitude&&healthy&&sameClub&&!p.twoWay;
    trial.decision={date:s.date,qualified,reason:!sameClub?"평가 도중 소속 구단이 바뀌었습니다.":!enough?"정상 훈련일 5일의 근거가 부족합니다.":!healthy?"평가 종료 시 활동 가능한 상태가 아닙니다.":!aptitude?"목표 분야 또는 역할 기량이 45 미만입니다.":p.twoWay?"겸업 역할은 별도 감독 심사로 결정합니다.":"정상 훈련과 역할 적성을 확인했습니다."};
  }
  if(!trial.decision.qualified){delete p.professional!.roleTrial;ensureProEvents(s).cancellations.push({id:trial.sourceId??"role-request",date:s.date,reason:trial.decision.reason});proNotice(s,`role-incomplete:${trial.started}`,"보직 평가를 마치지 못했습니다",`${trial.decision.reason} 현재 역할과 훈련 배분을 유지합니다.`);return false;}
  if(defer||!proDayFree(s))return false;
  const position=trial.position,started=trial.started,accepted=trial.autoTransition===true;
  decideProRoleTrial(s,accepted);
  proNotice(s,`role-complete:${started}`,"보직 평가 결과",accepted?`${positions[position]} 평가 기준을 충족해 처음 수락한 전환을 적용했습니다. 훈련 배분과 실제 경기 기록은 유지됩니다.`:"이전 저장에서 시작한 보직 평가를 마쳤습니다. 전환에 미리 동의한 기록이 없어 현재 역할을 유지합니다. 전환을 원하면 새 보직을 요청할 수 있습니다.");
  return true;
}
export function decideProRoleTrial(s:GameState,accept:boolean){
  const p=getPlayer(s),trial=p.professional?.roleTrial;if(trial?.version!==1||!trial.decision?.qualified)throw new Error("완료된 보직 평가를 찾을 수 없습니다.");
  if(accept){const position=trial.position;assignRole(p,roleFor(position));p.position=position;const pitching=isPitcher(p.primaryRole);p.eligiblePositions=[...new Set([...p.eligiblePositions.filter(pos=>isPitcher(roleFor(pos))===pitching),position])];const review=p.professional!.twoWayReview;if(review){if(pitching)review.positions.pitchingPosition=position;else review.positions.battingPosition=position;}}
  delete p.professional!.roleTrial;return {kind:accept?"accepted" as const:"kept" as const,target:trial.position,until:trial.until,reason:trial.decision.reason};
}
