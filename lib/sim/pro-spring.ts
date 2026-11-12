import {addDays,available,isPitcher,roleFor,selectionScore} from './engine';
import {nationalAway} from './national-teams';
import {canPlayPosition} from './position-eligibility';
import type {Game,GameState,Player,Position} from './types';

export function springSchedule(year:number):Game[]{
  const ring=Array.from({length:10},(_,i)=>i),games:Game[]=[];
  for(let round=0;round<9;round++){
    for(let pair=0;pair<5;pair++){
      const a=ring[pair],b=ring[9-pair],home=(round+pair)%2?a:b,away=home===a?b:a;
      games.push({id:`${year}-pro-spring-${round}-${pair}`,competitionId:'pro-spring',date:addDays(`${year}-03-04`,round*2),round:round+1,homeTeamId:home,awayTeamId:away,exhibition:'spring',rulesetId:'pro-spring-v1',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{}});
    }
    ring.splice(1,0,ring.pop()!);
  }return games;
}
export function ensureSpringSchedule(s:GameState){
  if(s.careerMode!=='pro'||s.calendar.proSpringScheduleVersion===1||!['camp','regular'].includes(s.proWorld?.stage??''))return false;
  const year=s.calendar.seasonYear,games=springSchedule(year).filter(g=>g.date>=s.date&&!s.calendar.events.some(row=>row.id===g.id));
  s.calendar.events.push(...games);s.calendar.events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  if(games.length&&!s.calendar.competitions.some(c=>c.id==='pro-spring'))s.calendar.competitions.push({id:'pro-spring',name:'프로 시범경기',kind:'league',startDate:`${year}-03-04`,endDate:`${year}-03-20`,participantTeamIds:Array.from({length:10},(_,i)=>i),entryRule:'팀당 9경기 · 격일 · 모든 군 출전 가능',initialized:true,round:0,roundDates:[],byes:[],championTeamId:null});
  s.calendar.proSpringScheduleVersion=1;return true;
}
export function springRoster(s:GameState,club:number){return s.players.filter(p=>p.teamId>=0&&p.teamId%10===club&&p.professional?.employment==='active'&&!nationalAway(s,p));}
export function springPriority(s:GameState,p:Player){
  if(p.teamId>=10&&p.teamId<20)return 0;
  if(p.teamId>=20)return 1;
  const rank=s.players.filter(q=>q.teamId===p.teamId&&isPitcher(q.primaryRole)===isPitcher(p.primaryRole)).sort((a,b)=>selectionScore(b)-selectionScore(a)||a.id.localeCompare(b.id)).findIndex(q=>q.id===p.id);
  return rank>=Math.floor(s.players.filter(q=>q.teamId===p.teamId&&isPitcher(q.primaryRole)===isPitcher(p.primaryRole)).length/2)?2:3;
}
// Equal third/developmental opportunity: omit the regular-league registration penalty.
export const springSelectionScore=(p:Player,position:Position=p.position)=>selectionScore(p,roleFor(position))+(p.proContract?.status==='developmental'?6:0);
export function springLineup(s:GameState,roster:Player[],date:string){
  const ready=roster.filter(p=>available(p,date)),priority=new Map(ready.map(p=>[p.id,springPriority(s,p)])),used=new Set<string>();
  const ranked=(rows:Player[],position:Position)=>rows.sort((a,b)=>priority.get(a.id)!-priority.get(b.id)!||springSelectionScore(b,position)-springSelectionScore(a,position)||a.id.localeCompare(b.id));
  const field:Player[]=[];
  for(const position of ['C','SS','CF','2B','1B','3B','LF','RF','DH'] as Position[]){const player=ranked(ready.filter(p=>!used.has(p.id)&&p.twoWay?.nextAssignment!=='pitching'&&(!isPitcher(p.primaryRole)||!!p.twoWay)&&p.eligiblePositions.includes(position)&&canPlayPosition(p,position)),position)[0];if(player){field.push(player);used.add(player.id);}}
  const pitchers=ready.filter(p=>!used.has(p.id)&&p.twoWay?.nextAssignment!=='batting'&&(isPitcher(p.primaryRole)||!!p.twoWay)),starter=ranked(pitchers.filter(p=>(p.twoWay?.pitchingPosition??p.position)==='SP'&&p.fatigue<65&&(!p.lastPitched||date>=addDays(p.lastPitched,5))),'SP')[0];
  return {field,order:[...field],pitchers:ranked(pitchers,'RP'),starter};
}
