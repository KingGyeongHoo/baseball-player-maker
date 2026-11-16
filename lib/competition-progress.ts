import type {Competition,GameState} from './sim/types';

export const competitionRoundSize=(competition:Competition,round:number)=>2**Math.max(1,(competition.roundDates.length||Math.ceil(Math.log2(Math.max(2,competition.participantTeamIds.length))))-round+1);
export function competitionRoundLabel(competition:Competition,round:number){
  const size=competitionRoundSize(competition,round);
  return size===2?'결승전':size===4?'4강 · 준결승':`${size}강`;
}
export function schoolCompetitionStatus(state:GameState,competition:Competition,teamId:number){
  if(competition.kind==='league')return state.date<competition.startDate?'개막 예정':state.date>competition.endDate?'리그 종료':'리그 진행 중';
  if(!competition.initialized)return ['emart','phoenix'].includes(competition.id)?'참가 예정':'출전권 결정 대기';
  if(!competition.participantTeamIds.includes(teamId))return '미출전';
  if(competition.championTeamId===teamId)return '우승';
  const games=state.calendar.events.filter(game=>game.competitionId===competition.id&&['completed','forfeit'].includes(game.status)&&[game.homeTeamId,game.awayTeamId].includes(teamId)).sort((a,b)=>(b.round??0)-(a.round??0)||b.date.localeCompare(a.date));
  const last=games[0];
  if(last){
    const winner=last.advancingTeamId??(last.status==='forfeit'?(last.forfeitTeamId===last.homeTeamId?last.awayTeamId:last.homeTeamId):last.score[0]===last.score[1]?undefined:last.score[0]>last.score[1]?last.homeTeamId:last.awayTeamId);
    if(winner!==undefined&&winner!==teamId){const size=competitionRoundSize(competition,last.round??1);return size===2?'준우승':`${size}강 탈락`;}
  }
  return `${competitionRoundLabel(competition,competition.round||1)} 진행 중`;
}
