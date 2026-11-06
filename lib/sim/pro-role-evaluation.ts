import {addDays,assignRole,available,getPlayer,isPitcher,ovr,positions,roleFor,roleScore} from "./engine";
import {proNotice} from "./pro-world";
import {ensureProEvents,proDayFree,recordProChoice} from "./pro-event-ledger";
import type {CareerEvent,GameState,Player,Position} from "./types";

export function beginProRoleTrial(s:GameState,position:Position,sourceId:string,currentRequest=false){
  const p=getPlayer(s),pro=p.professional!;
  if(pro.employment!=="active"||p.twoWay||pro.roleTrial||p.roleOffer||(!currentRequest&&pro.requestAfter&&s.date<pro.requestAfter))throw new Error("현재 보직 평가 또는 요청 대기가 끝난 뒤 다시 검토할 수 있습니다.");
  if(ovr(p,isPitcher(roleFor(position)))<45||roleScore(p,roleFor(position))<45)throw new Error("목표 분야와 역할 기량이 모두 45 이상이어야 합니다.");
  pro.requestAfter=addDays(s.date,28);pro.roleTrial={version:1,position,until:addDays(s.date,14),started:s.date,sourceId,club:p.teamId%10,originalPosition:p.position,originalRole:p.primaryRole,trainingDates:[]};
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
  const catalogId=trial.sourceId??"ROLE_REQUEST",chainId=`${p.id}:${trial.started}:${catalogId}`;
  const event:CareerEvent={id:chainId+":decision",definitionId:catalogId+"_FOLLOWUP",rewardVersion:3,kind:"special",date:s.date,title:"보직 평가 후 결정",description:`${positions[trial.position]} 평가를 마쳤습니다. 새 포지션에서 경쟁하거나 현재 역할을 유지할 수 있습니다. 훈련 배분과 실제 기록은 그대로 이어집니다.`,
    choices:[{id:"accept",label:`${positions[trial.position]}로 전환한다`,outcomes:[{weight:100,message:"평가한 포지션에서 다시 출전 경쟁을 시작합니다.",proTrialDecision:"accept",proResultId:catalogId+":accept"}]},{id:"keep",label:"현재 역할을 유지한다",outcomes:[{weight:100,message:"기존 역할을 유지합니다. 평가 동안의 실제 성장과 기록은 남습니다.",proTrialDecision:"keep",proResultId:catalogId+":keep"}]}],
    proEvent:{version:1,catalogId,channel:"followup",year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:p.teamId<10?"first":"second",field:isPitcher(roleFor(trial.position))?"pitching":"batting",openedAt:s.date,target:trial.position,chainId}};
  s.careerEvent=event;recordProChoice(s,event);return true;
}
export function decideProRoleTrial(s:GameState,accept:boolean){
  const p=getPlayer(s),trial=p.professional?.roleTrial;if(trial?.version!==1||!trial.decision?.qualified)throw new Error("완료된 보직 평가를 찾을 수 없습니다.");
  if(accept){const position=trial.position;assignRole(p,roleFor(position));p.position=position;const pitching=isPitcher(p.primaryRole);p.eligiblePositions=[...new Set([...p.eligiblePositions.filter(pos=>isPitcher(roleFor(pos))===pitching),position])];const review=p.professional!.twoWayReview;if(review){if(pitching)review.positions.pitchingPosition=position;else review.positions.battingPosition=position;}}
  delete p.professional!.roleTrial;return {kind:accept?"accepted" as const:"kept" as const,target:trial.position,until:trial.until,reason:trial.decision.reason};
}
