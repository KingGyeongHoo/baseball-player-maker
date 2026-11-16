import {competitionRoundSize} from '../competition-progress';
import type {CareerEvent,CareerEventBranch,Game,GameState,Player} from './types';

export function openFinalGameEvent(s:GameState,game:Game,rosters:Player[][]){
  if(game.finalEventOpened||s.careerEvent)return false;
  const competition=s.calendar.competitions.find(row=>row.id===game.competitionId);
  const final=game.national?game.national.knockout&&(game.national.stage==='final'||game.national.stage==='medals'&&game.national.group===0):
    !s.careerMode&&competition?.kind==='tournament'&&competitionRoundSize(competition,game.round??competition.round)===2;
  if(!final)return false;
  const player=rosters.flat().find(p=>p.id===s.playerId);if(!player)return false;
  game.finalEventOpened=true;if(game.national)game.national.eventOpened=true;
  const pitching=['선발','중간계투','마무리'].includes(player.primaryRole),title=game.national?'국제대회 결승':`${competition!.name} 결승`;
  s.careerEvent={id:`${game.id}:final`,definitionId:'FINAL-GAME',rewardVersion:3,kind:'tournament',date:s.date,finalGameId:game.id,finalField:pitching?'pitching':'batting',
    title:`${title} · 승부 계획`,description:`우승을 결정할 경기다. ${pitching?'결승에서 타자를 상대할 승부 방식을 정한다.':'결승 타석에서 가져갈 공격 방식을 정한다.'}`,
    choices:pitching?[
      {id:'attack',label:'스트라이크 존을 공략하며 삼진을 노린다',outcomes:[{weight:100,message:'결승 등판에서는 적극적인 승부에 집중한다.',match:{k:.02,hit:.005}}]},
      {id:'careful',label:'타자의 약점을 찌르며 정타를 피한다',outcomes:[{weight:100,message:'결승 등판에서는 코스와 타이밍을 흔든다.',match:{hit:-.01,bb:.01}}]}
    ]:[
      {id:'patient',label:'선구안과 출루로 공격의 흐름을 잇는다',outcomes:[{weight:100,message:'결승 타석에서는 공을 끝까지 보며 출루를 노린다.',match:{bb:.015,hr:-.01}}]},
      {id:'power',label:'좋은 공을 놓치지 않고 장타로 승부한다',outcomes:[{weight:100,message:'결승 타석에서는 자신 있게 강한 타구를 노린다.',match:{hr:.015,k:.01}}]}
    ]};
  return true;
}

export function resolveFinalGameChoice(s:GameState,event:CareerEvent,outcome:CareerEventBranch){
  if(!event.finalGameId||!outcome.match)return;
  const game=s.calendar.events.find(game=>game.id===event.finalGameId)??s.nationalTeams?.flatMap(entry=>entry.tournament?.games??[]).find(game=>game.id===event.finalGameId);
  if(!game)return;
  const player=s.players.find(p=>p.id===s.playerId)!,entry=s.nationalTeams?.find(entry=>entry.tournament?.games.some(row=>row.id===game.id));
  const position=entry?.roster.find(row=>row.id===player.id)?.position??player.twoWay?.pitchingPosition??player.position;
  game.finalFocus={playerId:player.id,field:event.finalField??(['SP','RP','CP'].includes(position)?'pitching':'batting'),effect:{...outcome.match}};
}
