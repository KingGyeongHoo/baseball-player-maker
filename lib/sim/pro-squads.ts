import {available,hash,roleScore,selectionScore} from "./engine";
import {proTeamName} from "./club-names";
import type {GameState,Player,Position,ProSquad} from "./types";
import {firstTeamCapacity,firstTeamSlots,proRosterPositions} from './pro-roster';

export const squadLevels:ProSquad[]=["first","second","third","developmental"];
export const squadLabels:Record<ProSquad,string>={first:"1군",second:"2군",third:"잔류군(3군)",developmental:"육성선수"};
export const proSquad=(teamId:number):ProSquad|null=>teamId<0?null:squadLevels[Math.floor(teamId/10)]??null;
export const squadTeam=(club:number,level:ProSquad)=>club+squadLevels.indexOf(level)*10;
export const squadLabel=(teamId:number)=>{const level=proSquad(teamId);return level?squadLabels[level]:"무소속";};
export const organizationScore=(p:Player)=>roleScore(p)*.7+selectionScore(p)*.3;
export function rookieDevelopmentalIds(seed:string,year:number,ids:string[]){return new Set([...ids].sort((a,b)=>hash(`${seed}:rookie-status:${year}:${a}`)-hash(`${seed}:rookie-status:${year}:${b}`)||a.localeCompare(b)).slice(0,Math.round(ids.length*.1)));}
export function compareReserveCandidates(a:Player,b:Player){return selectionScore(b)-selectionScore(a)||Number(a.proContract?.status==="developmental")-Number(b.proContract?.status==="developmental")||a.id.localeCompare(b.id);}
export function setProSquad(s:GameState,p:Player,level:ProSquad){
  const club=p.teamId>=0?p.teamId%10:p.professional?.contract?.club;if(club===undefined)return false;
  const team=squadTeam(club,level),changed=p.teamId!==team;p.teamId=team;
  if(changed&&p.professional)p.professional.lastRegistration=s.date;
  if(p.id===s.playerId&&s.postSchool?.pro)s.postSchool.pro.level=level;
  return changed;
}
export function ensureProSquadTeams(s:GameState){
  if(s.careerMode!=="pro")return;
  while(s.teams.length<40){const id=s.teams.length;s.teams.push({id,name:proTeamName(id),shortName:proTeamName(id),wins:0,losses:0,draws:0});}
}
export function needsProSquadUpgrade(s:GameState){return s.careerMode==="pro"&&!!s.proWorld&&s.proWorld.squadsVersion!==2&&!s.weekProgress&&!s.matchProgress;}
export function reorganizeProSquads(s:GameState){
  if(!needsProSquadUpgrade(s))return false;ensureProSquadTeams(s);
  for(let club=0;club<10;club++){
    const members=s.players.filter(p=>p.teamId>=0&&p.teamId%10===club&&p.professional?.employment==="active"),regular=members.filter(p=>p.proContract?.status!=="developmental").sort((a,b)=>organizationScore(b)-organizationScore(a)||a.id.localeCompare(b.id));
    const used=new Set<string>();
    for(const level of ["first","second"] as const){
      const chosen:Player[]=[];
      const slots=level==='first'?firstTeamSlots(s.seed,club):proRosterPositions,capacity=level==='first'?firstTeamCapacity:30;
      for(const pos of slots){const p=regular.find(p=>!used.has(p.id)&&p.position===pos);if(p){used.add(p.id);chosen.push(p);}}
      for(const p of regular)if(chosen.length<capacity&&!used.has(p.id)){used.add(p.id);chosen.push(p);}
      for(const p of chosen)setProSquad(s,p,level);
    }
    for(const p of regular)if(!used.has(p.id))setProSquad(s,p,"third");
    for(const p of members)if(p.proContract?.status==="developmental")setProSquad(s,p,"developmental");
  }
  s.proWorld!.squadsVersion=2;
  for(const series of s.proWorld!.postseason?.series??[])if(series.winner===undefined)for(const club of series.clubs)series.rosters[String(club)]=s.players.filter(p=>p.teamId===club&&p.proContract?.status!=="developmental"&&!series.excluded.includes(p.id)).slice(0,firstTeamCapacity).map(p=>p.id);
  const mine=s.players.find(p=>p.id===s.playerId);if(mine&&s.postSchool?.pro)s.postSchool.pro.level=proSquad(mine.teamId)??"third";
  return true;
}
// Preserve today's registrations where possible; fill only genuine vacancies
// from the lower squads and move excess registrations down without losing data.
export function normalizeFirstTeamRoster(s:GameState,club:number){
  if(s.weekProgress||s.matchProgress)return;
  const members=s.players.filter(p=>p.teamId>=0&&p.teamId%10===club&&p.professional?.employment==='active'&&p.proContract?.status!=='developmental');
  const first=members.filter(p=>p.teamId===club),pitching=(p:Player)=>['SP','RP','CP'].includes(p.position),count=(pos:Position)=>first.filter(p=>p.position===pos).length;
  const arms=first.filter(pitching).length;
  if(first.length===firstTeamCapacity&&arms>=12&&arms<=15&&count('SP')>=5&&count('SP')<=6&&count('CP')===1)return;
  const ordered=members.sort((a,b)=>Number(b.teamId===club)-Number(a.teamId===club)
    ||Number(!!a.professional?.lastRegistration&&a.teamId!==club)-Number(!!b.professional?.lastRegistration&&b.teamId!==club)
    ||Math.floor(a.teamId/10)-Math.floor(b.teamId/10)||organizationScore(b)-organizationScore(a)||a.id.localeCompare(b.id)),chosen=new Set<string>();
  const desired=first.length<30&&arms>=12&&arms<=15?arms:firstTeamSlots(s.seed,club).filter(pos=>['SP','RP','CP'].includes(pos)).length;
  const sp=Math.max(5,Math.min(6,count('SP')));
  for(const pos of ['C','SS','CF','2B','1B','3B','LF','RF','DH',...Array(sp).fill('SP'),'CP',...Array(desired-sp-1).fill('RP')] as Position[]){const p=ordered.find(p=>!chosen.has(p.id)&&p.position===pos);if(p)chosen.add(p.id);}
  for(const p of ordered)if(chosen.size<firstTeamCapacity&&!pitching(p)){
    if(p.teamId!==club&&p.teamId<20&&members.filter(q=>q.teamId===p.teamId&&q.position===p.position&&!chosen.has(q.id)).length<=1)continue;
    chosen.add(p.id);
  }
  for(const p of ordered.filter(p=>p.teamId===club&&!chosen.has(p.id)))setProSquad(s,p,'second');
  for(const p of ordered.filter(p=>chosen.has(p.id)&&p.teamId!==club))setProSquad(s,p,'first');
  const second=members.filter(p=>p.teamId===club+10).sort((a,b)=>organizationScore(a)-organizationScore(b)||a.id.localeCompare(b.id));
  while(second.length>30){const index=second.findIndex(p=>second.filter(q=>q.position===p.position).length>(p.position==='SP'?5:p.position==='RP'?4:1));if(index<0)break;setProSquad(s,second.splice(index,1)[0],'third');}
}
export function reservePromotionCandidates(s:GameState,club:number,position?:Position){
  return s.players.filter(p=>p.teamId>=20&&p.teamId<40&&p.teamId%10===club&&p.professional?.employment==="active"&&(!position||p.position===position)&&available(p,s.date)).sort(compareReserveCandidates);
}
