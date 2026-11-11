import {addDays,available,roleFor,selectionScore} from './engine';
import {canAssignProSquad,currentProPosition,guaranteedProSquad} from './pro-positions';
import type {GameState,Player} from './types';

export function proRegistrationStatus(s:GameState,p:Player){
  if(p.teamId<0)return '구단에 입단한 뒤 등록 심사를 받습니다.';
  const level=Math.floor(p.teamId/10),club=p.teamId%10;
  if(level>=2)return '1군에 올라가려면 먼저 2군 등록 심사를 통과해야 합니다. 3군의 2군 경기 출전은 등록 승격과 구분합니다.';
  const promised=guaranteedProSquad(p,s.date);
  if(promised==='first')return level===0?'FA 주전·보직 보장 계약으로 1군 등록을 유지합니다. 부상·휴식 시에는 경기에 쉬면서 1군에 남습니다.':'FA 1군 보장 계약이 남아 있어 다음 진행에서 잘못된 등록을 복구합니다.';
  const review=s.proWorld?.clubs[club]?.nextReview,when=review&&review>s.date?review:s.date;
  if(level===0)return `같은 현재 포지션의 출전평가로 1·2군을 비교합니다. 다음 등록 심사: ${when}.`;
  if(p.proContract?.status==='developmental')return '정식 선수 전환 후 1군 승격이 가능합니다.';
  if(!available(p,s.date))return '현재 부상·강제 휴식·휴식 훈련으로 출전할 수 없어 승격 심사를 기다립니다.';
  const after=p.professional?.lastRegistration&&addDays(p.professional.lastRegistration,14);
  if(after&&after>s.date)return `재등록 제한으로 ${after}부터 승격 심사를 받을 수 있습니다.`;
  const first=s.players.filter(q=>q.teamId===club&&currentProPosition(q,p.position));
  const candidates=first.filter(q=>canAssignProSquad(q,'second',s.date)&&!q.forcedRest&&(!q.professional?.lastRegistration||s.date>=addDays(q.professional.lastRegistration,14)));
  if(first.length&&!candidates.length)return first.every(q=>!canAssignProSquad(q,'second',s.date))?'같은 포지션의 1군 선수들이 FA 주전·보직 보장 계약으로 보호받고 있습니다.':'같은 포지션의 1군 선수에게 휴식·재등록 제한이 적용 중입니다.';
  const score=selectionScore(p,roleFor(p.position));
  const ahead=s.players.filter(q=>q.id!==p.id&&q.teamId===club+10&&currentProPosition(q,p.position)&&q.proContract?.status!=='developmental'&&available(q,s.date)&&(!q.professional?.lastRegistration||s.date>=addDays(q.professional.lastRegistration,14))&&selectionScore(q,roleFor(p.position))>score);
  if(ahead.length)return `같은 포지션의 2군 선수 중 출전평가가 더 높은 선수를 먼저 검토합니다. 다음 등록 심사: ${when}.`;
  if(!first.length||candidates.some(q=>selectionScore(q,roleFor(p.position))<score))return `현재 출전평가 기준 승격 대상입니다. 다음 등록 심사: ${when}.`;
  return `같은 포지션의 1군 선수보다 출전평가가 높아져야 승격합니다. 다음 등록 심사: ${when}.`;
}
