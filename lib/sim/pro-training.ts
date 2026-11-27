import {ticketKeys,type GameState,type Player,type Policy,type Ticket} from './types';

// Growth multiplies existing training growth; fatigue is per full training day.
export const proTrainingRules = {
  recovery:{label:'회복 위주',growth:.25,fatigue:0,description:'가볍게 훈련하며 경기 피로 회복에 집중합니다.'},
  normal:{label:'기본',growth:.65,fatigue:2,description:'경기를 준비하면서 선택한 능력치를 꾸준히 훈련합니다.'},
  extra:{label:'추가 훈련',growth:1,fatigue:8,description:'성장을 높이는 대신 경기 외 피로 부담이 늘어납니다.'},
} as const;
export const proTrainingRecoveryThreshold=60;
export type ProTrainingContext=Pick<GameState,'careerMode'|'proWorld'|'calendar'|'date'>;
export function isProSeasonTraining(s:ProTrainingContext){
  if(s.careerMode!=='pro'||s.proWorld?.seasonClosed||s.proWorld?.stage==='retired')return false;
  const starts=s.calendar.competitions.filter(c=>c.id==='pro-first'||c.id==='pro-second').map(c=>c.startDate).sort();
  return !!starts[0]&&s.date>=starts[0];
}
export function validProTraining(value:Policy['proSeason']){
  return value===undefined||!!value&&ticketKeys.includes(value.focus)&&['recovery','normal','extra'].includes(value.intensity);
}
export function proTrainingSelection(p:Player,policy:Policy):NonNullable<Policy['proSeason']>{
  if(policy.proSeason&&validProTraining(policy.proSeason))return {...policy.proSeason};
  const tickets=policy.mode==='rest'?policy.previousTraining?.tickets??policy.tickets:policy.tickets;
  const pitching=!!p.twoWay||['SP','RP','CP'].includes(p.position);
  const keys:Ticket[]=p.twoWay?[...ticketKeys]:pitching?['velocity','control','movement','physical']:['contact','power','speed','defense','physical'];
  const focus=keys.reduce((best,key)=>(tickets[key]??0)>(tickets[best]??0)?key:best,keys[0]);
  return {focus,intensity:policy.mode==='rest'?'recovery':'normal'};
}
// Keep the original offseason tickets, including a legacy rest plan's previous allocation.
export function saveProTraining(p:Player,policy:Policy,selection=proTrainingSelection(p,policy)):Policy{
  const tickets=policy.mode==='rest'?policy.previousTraining?.tickets??policy.tickets:policy.tickets;
  return {...policy,mode:'normal',tickets:{...tickets},proSeason:{...selection}};
}
export function proSeasonTrainingPlan(p:Player,policy:Policy){
  const selection=proTrainingSelection(p,policy),rule=proTrainingRules[selection.intensity];
  const pitching=!!p.twoWay||['SP','RP','CP'].includes(p.position),batting=!!p.twoWay||!pitching;
  const tickets=Object.fromEntries(ticketKeys.map(key=>[key,key==='physical'||(pitching&&['velocity','control','movement'].includes(key))||(batting&&['contact','power','speed','defense'].includes(key))?1:0])) as Policy['tickets'];
  tickets[selection.focus]=5;
  return {policy:{...policy,tickets},...rule,selection};
}
