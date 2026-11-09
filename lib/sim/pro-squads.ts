import {available,hash,roleScore,selectionScore} from "./engine";
import {proTeamName} from "./club-names";
import type {GameState,Player,Position,ProSquad} from "./types";

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
const slots:Position[]=["C","C","C","1B","1B","2B","2B","3B","3B","SS","SS","LF","LF","CF","CF","RF","RF","DH","SP","SP","SP","SP","SP","SP","RP","RP","RP","RP","CP","CP"];
export function needsProSquadUpgrade(s:GameState){return s.careerMode==="pro"&&!!s.proWorld&&s.proWorld.squadsVersion!==1&&!s.weekProgress&&!s.matchProgress;}
export function reorganizeProSquads(s:GameState){
  if(!needsProSquadUpgrade(s))return false;ensureProSquadTeams(s);
  for(let club=0;club<10;club++){
    const members=s.players.filter(p=>p.teamId>=0&&p.teamId%10===club&&p.professional?.employment==="active"),regular=members.filter(p=>p.proContract?.status!=="developmental").sort((a,b)=>organizationScore(b)-organizationScore(a)||a.id.localeCompare(b.id));
    const used=new Set<string>();
    for(const level of ["first","second"] as const){
      const chosen:Player[]=[];
      for(const pos of slots){const p=regular.find(p=>!used.has(p.id)&&p.position===pos);if(p){used.add(p.id);chosen.push(p);}}
      for(const p of regular)if(chosen.length<30&&!used.has(p.id)){used.add(p.id);chosen.push(p);}
      for(const p of chosen)setProSquad(s,p,level);
    }
    for(const p of regular)if(!used.has(p.id))setProSquad(s,p,"third");
    for(const p of members)if(p.proContract?.status==="developmental")setProSquad(s,p,"developmental");
  }
  s.proWorld!.squadsVersion=1;
  for(const series of s.proWorld!.postseason?.series??[])if(series.winner===undefined)for(const club of series.clubs)series.rosters[String(club)]=s.players.filter(p=>p.teamId===club&&p.proContract?.status!=="developmental"&&!series.excluded.includes(p.id)).slice(0,30).map(p=>p.id);
  const mine=s.players.find(p=>p.id===s.playerId);if(mine&&s.postSchool?.pro)s.postSchool.pro.level=proSquad(mine.teamId)??"third";
  return true;
}
export function reservePromotionCandidates(s:GameState,club:number,position?:Position){
  return s.players.filter(p=>p.teamId>=20&&p.teamId<40&&p.teamId%10===club&&p.professional?.employment==="active"&&(!position||p.position===position)&&available(p,s.date)).sort(compareReserveCandidates);
}
