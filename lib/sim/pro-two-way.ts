import { addDays, available, getPlayer, isPitcher, ovr, params, positionLabel, roleFor } from "./engine";
import { twoWayPositions } from "./career-opportunities";
import type { CareerEventBranch, GameState, Player, Position } from "./types";
import {proDayFree,proEventsEnabled} from "./pro-event-ledger";

type Pair = { pitchingPosition: Position; battingPosition: Position };
const pairOf = (p: Player): Pair => p.twoWay ? { pitchingPosition:p.twoWay.pitchingPosition, battingPosition:p.twoWay.battingPosition } : {...p.professional?.twoWayReview?.positions ?? twoWayPositions(p)};
export const proTwoWayQualified = (p:Player) => Math.min(ovr(p,true),ovr(p,false)) >= params["pro.two_way_entry"];
const pitchingPosition = (position:Position) => ["SP","RP","CP"].includes(position);
const strongerPitching = (p:Player) => ovr(p,true) === ovr(p,false) ? isPitcher(p.primaryRole) : ovr(p,true)>ovr(p,false);

export function focusProRole(p:Player,pitching=strongerPitching(p)) {
  const pair=pairOf(p),position=pitching?pair.pitchingPosition:pair.battingPosition;
  p.position=position;p.primaryRole=roleFor(position);p.preferredRole=p.primaryRole;
  p.eligiblePositions=[...new Set([...p.eligiblePositions.filter(pos=>pitchingPosition(pos)===pitching),position])];
  delete p.twoWay;
}
function startTwoWay(p:Player) {
  const pair=pairOf(p);
  p.twoWay={...pair,nextAssignment:isPitcher(p.primaryRole)?"pitching":"batting",reputationBonus:0};
  p.eligiblePositions=[...new Set([...p.eligiblePositions,pair.battingPosition,"SP","RP","CP"] as Position[])];
}
function history(s:GameState,p:Player,action:string,reason:string) {
  p.professional!.twoWayHistory??=[];
  p.professional!.twoWayHistory.push({date:s.date,action,positions:pairOf(p),reason});
}
// Versioned, idempotent entry/old-save migration. No skill, talent or record is changed.
export function initializeProTwoWay(s:GameState,p:Player,existing=false) {
  if(!p.professional||p.professional.twoWayReview)return;
  p.professional.twoWayReview={positions:pairOf(p),qualifiedDays:0,belowDays:0};
  if(p.twoWay){
    if(proTwoWayQualified(p))history(s,p,"프로 겸업 유지","입단 시 투수·타자 OVR이 모두 프로 겸업 기준을 충족했습니다.");
    else{focusProRole(p);history(s,p,existing?"겸업 기준 재평가":"단일 역할 입단",`프로 겸업 기준에 미달해 ${positionLabel(p)}에 집중합니다. 고교 기록과 두 분야 능력은 보존합니다.`);}
  }else focusProRole(p,isPitcher(p.primaryRole));
}
export function recordProTwoWayDay(s:GameState) {
  if(!s.proWorld||!["camp","regular"].includes(s.proWorld.stage))return;
  for(const p of s.players){const review=p.professional?.twoWayReview;if(!review||review.lastDate===s.date||p.professional?.employment!=="active")continue;
    if(review.lastDate&&addDays(review.lastDate,1)!==s.date){review.qualifiedDays=0;review.belowDays=0;}
    review.qualifiedDays=!p.twoWay&&proTwoWayQualified(p)?review.qualifiedDays+1:0;
    review.belowDays=p.twoWay&&Math.min(ovr(p,true),ovr(p,false))<params["pro.two_way_maintain"]?review.belowDays+1:0;
    review.lastDate=s.date;
  }
}
export function reviewProTwoWay(s:GameState) {
  if(!s.proWorld||!["camp","regular"].includes(s.proWorld.stage)||s.careerEvent||s.careerNotice||s.matchProgress)return false;
  const days=params["pro.two_way_days"];
  for(const p of s.players){const review=p.professional?.twoWayReview;
    if(!review||p.professional?.roleTrial||p.roleOffer||p.professional?.employment!=="active"||p.teamId<0||!p.twoWay&&review.nextProposalDate&&s.date<review.nextProposalDate)continue;
    if(review.lastDate!==s.date&&review.lastDate!==addDays(s.date,-1)){review.qualifiedDays=review.belowDays=0;continue;}
    const start=!p.twoWay&&review.qualifiedDays>=days&&proTwoWayQualified(p)&&available(p,s.date);
    const stop=!!p.twoWay&&review.belowDays>=days&&Math.min(ovr(p,true),ovr(p,false))<params["pro.two_way_maintain"];
    if(!start&&!stop)continue;
    if(p.id!==s.playerId){if(start)startTwoWay(p);else focusProRole(p);history(s,p,start?"프로 겸업 시작":"단일 역할 전환","구단이 지속된 기본 능력과 역할을 평가했습니다.");review.qualifiedDays=review.belowDays=0;review.nextProposalDate=addDays(s.date,91);continue;}
    if(proEventsEnabled(s)&&!proDayFree(s))continue;
    const higher=strongerPitching(p)?"pitching":"batting",other=higher==="pitching"?"batting":"pitching";
    review.nextProposalDate=addDays(s.date,91);
    const title=start?"감독의 프로 투타 겸업 제안":"감독의 겸업 역할 조정 제안";
    s.careerEvent={id:`${p.id}:${s.date}:${start?"PRO16":"PRO17"}`,definitionId:start?"PRO16":"PRO17",kind:"special",rewardVersion:2,date:s.date,title,
      description:start?"투구와 타격 모두에서 충분한 실력을 꾸준히 보여줬다. 감독이 투수와 야수 역할을 함께 맡아보자고 제안했다. 실제 출전은 각 분야의 경쟁과 컨디션에 따라 결정된다.":"한 분야의 기본 능력이 겸업 유지 기준에 미달한 상태가 이어졌다. 감독은 앞으로 집중할 역할을 함께 정하자고 제안했다.",
      choices:start?[
        {id:"accept",label:"프로 투타 겸업에 도전한다",outcomes:[{weight:100,message:"투수와 야수의 출전 계획을 함께 세웠다. 양쪽에서 경쟁하며 출전하고, 두 분야를 모두 소화한 주에는 추가 피로가 쌓인다.",proTwoWayAction:"start"}]},
        {id:"decline",label:"현재 역할에 집중한다",outcomes:[{weight:100,message:"현재 역할을 이어가기로 했다. 능력을 유지하면 충분한 시간이 지난 뒤 다시 검토받을 수 있다.",proTwoWayAction:"defer"}]}]:[
        {id:"focus",label:`${higher==="pitching"?"투수":"타자"} 역할에 집중한다`,outcomes:[{weight:100,message:"더 강한 분야에 집중하기로 했다. 두 분야의 능력과 이전 출전 기록은 그대로 남는다.",proTwoWayAction:higher}]},
        {id:"other",label:`${other==="pitching"?"투수":"타자"} 역할로 새롭게 경쟁한다`,outcomes:[{weight:100,message:"다른 분야에 집중해 경쟁하기로 했다. 이후 양쪽 실력을 다시 갖추면 겸업 제안을 받을 수 있다.",proTwoWayAction:other}]}]};
    s.lastCareerEventWeek=s.week;return true;
  }return false;
}
export function applyProTwoWayChoice(s:GameState,branch:CareerEventBranch) {
  if(!branch.proTwoWayAction||s.careerMode!=="pro")return {};
  const p=getPlayer(s),review=p.professional!.twoWayReview!;
  if(branch.proTwoWayAction==="start"){
    if(!proTwoWayQualified(p))throw new Error("프로 겸업 기준을 다시 확인해 주세요.");
    startTwoWay(p);history(s,p,"프로 겸업 시작","감독 제안을 수락했습니다.");
  }else if(branch.proTwoWayAction!=="defer"){
    focusProRole(p,branch.proTwoWayAction==="pitching");history(s,p,"단일 역할 전환","감독과 집중할 분야를 정했습니다.");
  }else history(s,p,"겸업 제안 보류","현재 역할에 집중하기로 했습니다.");
  review.qualifiedDays=review.belowDays=0;
  return branch.proTwoWayAction==="start"?{twoWay:pairOf(p)}:{};
}
