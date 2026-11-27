import {addDays,assignRole,available,getPlayer,isPitcher,ovr,positions,roleFor,roleScore} from "./engine";
import {proNews,proNotice} from "./pro-world";
import {guaranteedProSquad} from './pro-positions';
import {proGameTeam} from './pro-farm-roster';
import {proStarterEligible} from './pro-pitching-fatigue';
import {ensureProEvents,proDayFree} from "./pro-event-ledger";
import type {GameState,Player,Position} from "./types";

import {assertPositionEligible,canPlayPosition} from './position-eligibility';
export const pitchingRoleProposalRules={minimumAdvantage:2};
const pitchingPositions=["SP","RP","CP"] as const;
export function proPitchingRoleTarget(p:Player):Position|undefined{
  if(p.twoWay||!pitchingPositions.some(position=>position===p.position))return;
  const current=roleScore(p,roleFor(p.position),p.position);
  const candidates=pitchingPositions.filter(position=>position!==p.position&&!proRoleAptitudeIssue(p,position))
    .map(position=>({position,score:roleScore(p,roleFor(position),position)}))
    .sort((a,b)=>b.score-a.score);
  const best=candidates[0];
  if(best&&best.score>=current+pitchingRoleProposalRules.minimumAdvantage)return best.position;
}
export function proRoleAptitudeIssue(p:Player,position:Position){
  if(position==='SP'&&!proStarterEligible(p))return '선발투수는 스태미나가 50 이상이어야 합니다.';
  const role=roleFor(position);
  if(ovr(p,isPitcher(role))<45||roleScore(p,role)<45)return "목표 분야와 역할 기량이 모두 45 이상이어야 합니다.";
  if(position==='C'&&!p.eligiblePositions.includes('C'))return "포수는 기존 포수 등록 자격이 있어야 합니다.";
  if(position==='CF'&&(p.stats.defense<55||p.stats.speed<55))return "중견수는 수비와 주루 능력이 모두 55 이상이어야 합니다.";
}
function applyProRole(p:Player,position:Position){
  assertPositionEligible(p,position);assignRole(p,roleFor(position));p.position=position;
  const pitching=isPitcher(p.primaryRole);
  p.eligiblePositions=[...new Set([...p.eligiblePositions.filter(pos=>isPitcher(roleFor(pos))===pitching),position])];
  const review=p.professional?.twoWayReview;
  if(review){if(pitching)review.positions.pitchingPosition=position;else review.positions.battingPosition=position;}
}

export function enforceProStarterStamina(s:GameState){
  if(s.careerMode!=='pro'||s.matchProgress)return;
  for(const p of s.players){
    if(p.professional?.employment!=='active'||p.teamId<0||(p.twoWay?.pitchingPosition??p.position)!=='SP'||proStarterEligible(p))continue;
    const target:Position=roleScore(p,'마무리','CP')>roleScore(p,'중간계투','RP')?'CP':'RP';
    if(p.twoWay){
      p.twoWay.pitchingPosition=target;
      if(isPitcher(p.primaryRole))assignRole(p,roleFor(target));
      p.eligiblePositions=[...new Set([...p.eligiblePositions.filter(pos=>pos!=='SP'),target])];
      if(p.professional.twoWayReview)p.professional.twoWayReview.positions.pitchingPosition=target;
    }else applyProRole(p,target);
    const reason=`스태미나 50 미만 · 선발투수 → ${positions[target]}`;
    p.professional.movements.push({date:s.date,from:p.teamId%10,to:p.teamId%10,kind:'투수 보직 전환',reason});
    proNews(s,`${p.name} · ${reason}`);
    if(p.id===s.playerId)proNotice(s,`starter-stamina:${s.date}`,'투수 보직 조정',`${reason}. 프로 선발은 스태미나 50 이상부터 가능합니다. 능력치와 기록은 유지됩니다.`);
  }
}

export function reviewNpcPitchingRoles(s:GameState,club:number){
  if(s.careerMode!=='pro'||!s.proWorld||s.proWorld.seasonClosed||!['camp','regular'].includes(s.proWorld.stage)||s.matchProgress)return;
  const roster=s.players.filter(p=>p.teamId>=0&&p.teamId<40&&p.teamId%10===club&&p.professional?.employment==='active');
  const yearPrefix=`${s.calendar.seasonYear}-`;
  const candidates=roster.flatMap(p=>{
    const pro=p.professional!;
    if(p.id===s.playerId||p.twoWay||p.roleOffer||pro.roleTrial||p.injuryRetirement||!available(p,s.date)
      ||pro.requestAfter&&s.date<pro.requestAfter||guaranteedProSquad(p,s.date)
      ||pro.movements.some(row=>row.kind==='투수 보직 전환'&&row.date.startsWith(yearPrefix)))return [];
    const target=proPitchingRoleTarget(p);
    return target?[{p,target,gain:roleScore(p,roleFor(target),target)-roleScore(p)}]:[];
  }).sort((a,b)=>Number(b.target==='SP')-Number(a.target==='SP')||b.gain-a.gain||a.p.id.localeCompare(b.p.id));
  for(const {p,target} of candidates){
    // Preserve the existing rotation and bullpen minimums. Reconsider deferred
    // conversions in the next club review after reinforcements or other moves.
    const team=proGameTeam(p),peers=roster.filter(q=>proGameTeam(q)===team);
    if(p.position==='SP'&&peers.filter(q=>(q.twoWay?.pitchingPosition??q.position)==='SP').length<=5)continue;
    if(target==='SP'&&peers.filter(q=>['RP','CP'].includes(q.twoWay?.pitchingPosition??q.position)).length<=(team<10?7:4))continue;
    const previous=p.position;
    applyProRole(p,target);
    const reason=`능력치 적성 평가 · ${positions[previous]} → ${positions[target]}`;
    p.professional!.requestAfter=addDays(s.date,28);
    p.professional!.movements.push({date:s.date,from:club,to:club,kind:'투수 보직 전환',reason});
    proNews(s,`${p.name} · ${reason}`,`npc-pitching-role:${s.calendar.seasonYear}:${p.id}`);
  }
}
export function positionRequestBlock(s:GameState,p:Player){
  const pro=p.professional;
  if(!pro||pro.employment!=='active'||p.teamId<0)return "구단 소속 상태에서 요청할 수 있습니다.";
  if(s.proWorld?.seasonClosed)return "새 시즌에 포지션 변경을 요청할 수 있습니다.";
  if(pro.positionRequestYear===s.calendar.seasonYear||pro.roleTrial?.sourceId==='ROLE_REQUEST'&&pro.roleTrial.started?.startsWith(`${s.calendar.seasonYear}-`))return "이번 시즌 포지션 변경 요청을 이미 사용했습니다.";
  if(pro.roleTrial||p.roleOffer||p.twoWay)return "진행 중인 보직 평가·제안 또는 투타 겸업 상태에서는 요청할 수 없습니다.";
  if(pro.requestAfter&&s.date<pro.requestAfter)return `${pro.requestAfter} 이후 다시 요청할 수 있습니다.`;
}
export function beginProRoleTrial(s:GameState,position:Position,sourceId:string,autoTransition=true){
  const p=getPlayer(s),pro=p.professional!;
  assertPositionEligible(p,position);
  if(pro.employment!=="active"||p.twoWay||pro.roleTrial||p.roleOffer||pro.requestAfter&&s.date<pro.requestAfter)throw new Error("현재 보직 평가 또는 요청 대기가 끝난 뒤 다시 검토할 수 있습니다.");
  const aptitudeIssue=proRoleAptitudeIssue(p,position);
  if(aptitudeIssue)throw new Error(aptitudeIssue);
  pro.requestAfter=addDays(s.date,28);pro.roleTrial={version:1,...(autoTransition?{autoTransition:true as const}:{}),position,until:addDays(s.date,14),started:s.date,sourceId,club:p.teamId%10,originalPosition:p.position,originalRole:p.primaryRole,trainingDates:[]};
  return pro.roleTrial;
}
export function recordProRoleTraining(s:GameState,p:Player){const trial=p.professional?.roleTrial;if(trial?.version===1&&s.date<trial.until&&!trial.trainingDates!.includes(s.date))trial.trainingDates!.push(s.date);}
export function reviewProRoleTrial(s:GameState,defer=false){
  const p=getPlayer(s),trial=p.professional?.roleTrial;if(trial?.version!==1||s.date<trial.until||s.careerEvent||s.careerNotice)return false;
  if(!canPlayPosition(p,trial.position)){delete p.professional!.roleTrial;return false;}
  if(!trial.decision){const enough=(trial.trainingDates?.length??0)>=5,aptitudeIssue=proRoleAptitudeIssue(p,trial.position),healthy=available(p,s.date),sameClub=p.teamId>=0&&p.teamId%10===trial.club;
    const qualified=enough&&!aptitudeIssue&&healthy&&sameClub&&!p.twoWay;
    trial.decision={date:s.date,qualified,reason:!sameClub?"평가 도중 소속 구단이 바뀌었습니다.":!enough?"정상 훈련일 5일의 근거가 부족합니다.":!healthy?"평가 종료 시 활동 가능한 상태가 아닙니다.":aptitudeIssue??(p.twoWay?"겸업 역할은 별도 감독 심사로 결정합니다.":"정상 훈련과 역할 적성을 확인했습니다.")};
  }
  if(!trial.decision.qualified){delete p.professional!.roleTrial;ensureProEvents(s).cancellations.push({id:trial.sourceId??"role-request",date:s.date,reason:trial.decision.reason});proNotice(s,`role-incomplete:${trial.started}`,"보직 평가를 마치지 못했습니다",`${trial.decision.reason} 현재 역할과 훈련 배분을 유지합니다.`);return false;}
  if(defer||!proDayFree(s))return false;
  const position=trial.position,started=trial.started,accepted=trial.autoTransition===true;
  decideProRoleTrial(s,accepted);
  const success=trial.sourceId==="ROLE_REQUEST"
    ?`평가 기준을 충족해 ${positions[position]} 포지션으로 변경했습니다. 훈련 배분과 경기 기록은 유지됩니다.`
    :`${positions[position]} 평가 기준을 충족해 처음 수락한 전환을 적용했습니다. 훈련 배분과 실제 경기 기록은 유지됩니다.`;
  proNotice(s,`role-complete:${started}`,"보직 평가 결과",accepted?success:"이전 저장에서 시작한 보직 평가를 마쳤습니다. 전환에 미리 동의한 기록이 없어 현재 역할을 유지합니다. 전환을 원하면 새 보직을 요청할 수 있습니다.");
  return true;
}
export function decideProRoleTrial(s:GameState,accept:boolean){
  const p=getPlayer(s),trial=p.professional?.roleTrial;if(trial?.version!==1||!trial.decision?.qualified)throw new Error("완료된 보직 평가를 찾을 수 없습니다.");
  if(accept)applyProRole(p,trial.position);
  delete p.professional!.roleTrial;return {kind:accept?"accepted" as const:"kept" as const,target:trial.position,until:trial.until,reason:trial.decision.reason};
}
