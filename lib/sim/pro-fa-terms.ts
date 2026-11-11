import { hash, roleScore } from "./engine";
import { currentProPosition,guaranteedProStarter } from "./pro-positions";
import type { FaTerms } from "./pro-types";
import type { GameState, Player } from "./types";

export function recentClubRecord(s:GameState,club:number){
  const rows=s.proWorld!.seasons.filter(row=>row.year<=s.proWorld!.year).slice(-3)
    .flatMap(row=>{const index=row.standings.findIndex(r=>r.teamId===club),standing=row.standings[index];return standing?[{...standing,rank:Number.isFinite(standing.rank)&&standing.rank>0?standing.rank:index+1}]:[];});
  if(!rows.length)return undefined;
  const weights=rows.map((_,i)=>i+1),sum=weights.reduce((a,b)=>a+b,0);
  return {seasons:rows.length,rank:rows.reduce((n,r,i)=>n+r.rank*weights[i],0)/sum,
    winPercentage:rows.reduce((n,r,i)=>n+(r.wins+r.losses?r.wins/(r.wins+r.losses):.5)*weights[i],0)/sum};
}

export function faProposal(s:GameState,p:Player,club:number,year:number,score:number,baseYears:number):{terms:FaTerms;multiplier:number;years:number}{
  const home=p.professional?.employment==="active"&&p.professional.contract?.club===club;
  const startingLevel=p.teamId>=0?(["first","second","third","developmental"] as const)[Math.floor(p.teamId/10)]:"second",levelTeam=club+(startingLevel==="first"?0:startingLevel==="second"?10:20);
  const peers=s.players.filter(q=>q.id!==p.id&&q.teamId===levelTeam&&currentProPosition(q,p.position));
  const best=Math.max(0,...peers.map(q=>roleScore(q))),record=recentClubRecord(s,club);
  const promised=peers.some(q=>guaranteedProStarter(q,p.position,`${year}-03-01`));
  const roll=hash(`${s.seed}:fa-plan:${year}:${p.id}:${club}`)%100;
  const rich=[...s.proWorld!.clubs].sort((a,b)=>b.budget-a.budget||a.id-b.id).findIndex(c=>c.id===club)<4;
  let plan:FaTerms["plan"];
  if(home)plan="continuity";
  else if(record&&record.rank<=3.5&&record.winPercentage>=.5)plan="contender";
  else if(rich&&roll<70)plan="money";
  else if(!promised&&(startingLevel==="first"||startingLevel==="second")&&roleScore(p)>=best-3)plan="starter";
  else if((p.age??19)<=30&&s.proWorld!.clubs[club].direction==="rebuild")plan="rebuild";
  else plan="security";
  const names={starter:"주전 보장",money:"높은 연봉",contender:"우승 도전",security:"계약 안정",rebuild:"리빌딩 핵심",continuity:"원소속팀 잔류"};
  const descriptions={starter:`현재 포지션에서 건강한 경기의 선발 출전을 우선 보장합니다.`,money:"다른 조건보다 연봉을 높여 영입합니다. 주전 자리는 포지션 경쟁으로 결정합니다.",
    contender:"최근 실제 성적이 좋은 구단에서 우승에 도전합니다. 주전 출전은 경쟁으로 결정합니다.",security:"연봉 일부를 조정해 계약기간과 고용 안정을 우선합니다.",rebuild:"리빌딩 구단에서 현재 포지션의 핵심 자원으로 기회를 제공합니다.",continuity:"기존 구단과 등록 군을 유지하며 계약을 이어갑니다."};
  const multiplier=plan==="money"?1.18+roll%18/100:plan==="contender"?.88+roll%12/100:plan==="security"?.92+roll%9/100:plan==="rebuild"?1.04+roll%9/100:plan==="continuity"?.99+roll%9/100:1+roll%8/100;
  let years=baseYears;
  if(plan==="security"&&(p.age??19)<=35&&score>=73)years=Math.max(2,years);
  if(plan==="rebuild"&&score>=75)years=Math.max(2,years);
  const relief=["RP","CP"].includes(p.position);
  const title=plan==="starter"?`${startingLevel==='second'?'2군 ':''}${relief?'보직 보장':'주전 보장'}`:names[plan];
  const protection=startingLevel==='first'?" 계약 기간에는 1군 등록을 보장하며 성적·부상·휴식을 이유로 2군에 보내지 않습니다.":startingLevel==='second'?" 계약 기간에는 2군 이상 등록을 보장합니다.":"";
  const description=(plan==="starter"&&relief?"휴식·컨디션을 지키며 현재 계투 보직에서 우선 등판합니다.":descriptions[plan])+
    (!promised&&(plan==='starter'||plan==='rebuild')?protection:'');
  return {terms:{plan,title,description,position:p.position,startingLevel,
    ...(!promised&&(startingLevel==="first"||startingLevel==="second")&&(plan==="starter"||plan==="rebuild")?{starterGuaranteed:true}:{}),...(record?{recentRecord:record}:{})},multiplier,years};
}
