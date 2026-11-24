import {needsConversionRepair,repairConversionRegistrations} from "./pro-conversion";
import {available,hash,roleScore,selectionScore} from "./engine";
import {proTeamName} from "./club-names";
import type {GameState,Player,Position,ProSquad} from "./types";
import {createCareerNPC,firstTeamCapacity,firstTeamRosterCapacity,firstTeamSlotPosition,firstTeamSlots,proRosterPositions} from './pro-roster';
import {contractFor,initializeProfessional,proNews} from './pro-world';
import {MIN_PRO_SALARY} from './pro-contract-rules';
import {syncJerseyNumbers} from '../jersey-numbers';
import {canAssignProSquad,currentProPosition,guaranteedProSquad,guaranteedProStarter} from './pro-positions';
import {markHonorInjuryLeave} from './retirement-honors';

export const squadLevels:ProSquad[]=["first","second","third","developmental"];
export const squadLabels:Record<ProSquad,string>={first:"1군",second:"2군",third:"잔류군(3군)",developmental:"육성선수"};
export const proSquad=(teamId:number):ProSquad|null=>teamId<0?null:squadLevels[Math.floor(teamId/10)]??null;
export const squadTeam=(club:number,level:ProSquad)=>club+squadLevels.indexOf(level)*10;
export const squadLabel=(teamId:number)=>{const level=proSquad(teamId);return level?squadLabels[level]:"무소속";};
export const organizationScore=(p:Player)=>roleScore(p)*.7+selectionScore(p)*.3;
export function rookieDevelopmentalIds(seed:string,year:number,ids:string[]){return new Set([...ids].sort((a,b)=>hash(`${seed}:rookie-status:${year}:${a}`)-hash(`${seed}:rookie-status:${year}:${b}`)||a.localeCompare(b)).slice(0,Math.round(ids.length*.1)));}
export function compareReserveCandidates(a:Player,b:Player){return selectionScore(b)-selectionScore(a)||Number(a.proContract?.status==="developmental")-Number(b.proContract?.status==="developmental")||a.id.localeCompare(b.id);}
export function canPromoteToFirst(s:GameState,p:Player){
  const protectedPosition=p.professional?.farmVacancyPosition;
  if(protectedPosition&&p.teamId>=10&&p.teamId<20&&!s.players.some(q=>q.id!==p.id&&q.teamId===p.teamId&&q.professional?.employment==='active'&&currentProPosition(q,protectedPosition)))return false;
  return p.teamId>=10&&p.teamId<20&&p.proContract?.status!=="developmental"
    &&(!p.professional?.lastRegistration||p.professional.lastRegistration<s.date);
}
export function setProSquad(s:GameState,p:Player,level:ProSquad,forceFarmVacancy=false,emergencyFirst=false){
  if(level==='developmental'&&p.proContract?.status==='regular')return false;
  if(!(forceFarmVacancy&&level!=='first')&&!canAssignProSquad(p,level,s.date))return false;
  if(level==="first"&&p.teamId>=10&&!canPromoteToFirst(s,p)
    &&!(emergencyFirst&&p.teamId<20&&p.proContract?.status==='regular'&&p.professional?.employment==='active'))return false;
  const club=p.teamId>=0?p.teamId%10:p.professional?.contract?.club;if(club===undefined)return false;
  const team=squadTeam(club,level),changed=p.teamId!==team;markHonorInjuryLeave(s,p,team);p.teamId=team;
  if(changed&&p.professional)p.professional.lastRegistration=s.date;
  if(p.id===s.playerId&&s.postSchool?.pro)s.postSchool.pro.level=level;
  return changed;
}
export function restoreGuaranteedSquads(s:GameState){
  if(s.weekProgress||s.matchProgress)return false;
  let changed=false;
  for(const p of s.players){
    const promised=guaranteedProSquad(p,s.date),current=proSquad(p.teamId);
    if(!promised||!current||squadLevels.indexOf(current)<=squadLevels.indexOf(promised))continue;
    if(current==='second'&&p.professional?.farmVacancyPosition&&!canPromoteToFirst(s,p))continue;
    const level=promised==='first'&&p.teamId>=20?'second':promised,club=p.teamId%10;
    if(level==='first'&&!canPromoteToFirst(s,p))continue;
    const target=squadTeam(club,level),capacity=level==='first'?firstTeamRosterCapacity(s,club):30;
    const roster=s.players.filter(q=>q.teamId===target);
    if(roster.length>=capacity){
      const downLevel=level==='first'?'second':'third';
      const down=roster.filter(q=>canAssignProSquad(q,downLevel,s.date)&&(q.position===p.position||roster.filter(r=>r.position===q.position).length>1))
        .sort((a,b)=>selectionScore(a)-selectionScore(b)||a.id.localeCompare(b.id))[0];
      if(!down)continue;
      if(downLevel==='second'){
        const second=s.players.filter(q=>q.teamId===club+10);
        if(second.length>=30){const reserve=second.filter(q=>q.id!==p.id&&canAssignProSquad(q,'third',s.date))
          .sort((a,b)=>selectionScore(a)-selectionScore(b)||a.id.localeCompare(b.id))[0];if(!reserve)continue;setProSquad(s,reserve,'third');}
      }
      setProSquad(s,down,downLevel);
    }
    changed=setProSquad(s,p,level)||changed;
  }
  return changed;
}
export function ensureProSquadTeams(s:GameState){
  if(s.careerMode!=="pro")return;
  while(s.teams.length<40){const id=s.teams.length;s.teams.push({id,name:proTeamName(id),shortName:proTeamName(id),wins:0,losses:0,draws:0});}
}
export function needsProSquadUpgrade(s:GameState){return s.careerMode==="pro"&&!!s.proWorld&&(s.proWorld.squadsVersion!==2||needsConversionRepair(s))&&!s.weekProgress&&!s.matchProgress;}
export function reorganizeProSquads(s:GameState){
  if(!needsProSquadUpgrade(s))return false;ensureProSquadTeams(s);
  if(s.proWorld?.squadsVersion===2)return repairConversionRegistrations(s);
  for(let club=0;club<10;club++){
    const members=s.players.filter(p=>p.teamId>=0&&p.teamId%10===club&&p.professional?.employment==="active"),regular=members.filter(p=>p.proContract?.status!=="developmental").sort((a,b)=>Number(!!guaranteedProSquad(b,s.date))-Number(!!guaranteedProSquad(a,s.date))||organizationScore(b)-organizationScore(a)||a.id.localeCompare(b.id));
    const used=new Set<string>();
    for(const level of ["first","second"] as const){
      const chosen:Player[]=[];
      const slots=level==='first'?firstTeamSlots(s.seed,club):proRosterPositions,capacity=level==='first'?firstTeamCapacity:30;
      const eligible=(level==="first"?regular.filter(p=>p.teamId===club||canPromoteToFirst(s,p)):[...regular])
        .sort((a,b)=>Number(guaranteedProSquad(b,s.date)===level)-Number(guaranteedProSquad(a,s.date)===level)||organizationScore(b)-organizationScore(a)||a.id.localeCompare(b.id));
      const slotPosition=level==='first'?firstTeamSlotPosition:(position:Position)=>position;
      for(const pos of slots){const p=eligible.find(p=>!used.has(p.id)&&slotPosition(p.position)===slotPosition(pos));if(p){used.add(p.id);chosen.push(p);}}
      for(const p of eligible)if(chosen.length<capacity&&!used.has(p.id)){used.add(p.id);chosen.push(p);}
      for(const p of chosen)setProSquad(s,p,level);
    }
    for(const p of regular)if(!used.has(p.id))setProSquad(s,p,"third");
    for(const p of members)if(p.proContract?.status==="developmental")setProSquad(s,p,"developmental");
  }
  s.proWorld!.squadsVersion=2;
  for(const series of s.proWorld!.postseason?.series??[])if(series.winner===undefined)for(const club of series.clubs)series.rosters[String(club)]=s.players.filter(p=>p.teamId===club&&p.proContract?.status!=="developmental"&&!series.excluded.includes(p.id)).slice(0,firstTeamRosterCapacity(s,club)).map(p=>p.id);
  const mine=s.players.find(p=>p.id===s.playerId);if(mine&&s.postSchool?.pro)s.postSchool.pro.level=proSquad(mine.teamId)??"third";
  return true;
}
// Preserve today's registrations where possible; fill only genuine vacancies
// from the lower squads and move excess registrations down without losing data.
export function normalizeFirstTeamRoster(s:GameState,club:number){
  // Registration reviews run before today's games inside advanceWeek. A week
  // cursor must not prevent an incomplete first team from being repaired.
  if(s.matchProgress)return;
  if(!s.proWorld)return;
  for(const p of s.players.filter(p=>p.teamId===club&&p.proContract?.status==='developmental'))setProSquad(s,p,'developmental',true);
  const capacity=firstTeamRosterCapacity(s,club);
  const members=s.players.filter(p=>p.teamId>=0&&p.teamId%10===club&&p.professional?.employment==='active'&&p.proContract?.status!=='developmental'
    &&!(p.teamId===club+10&&p.professional.farmVacancyPosition&&!canPromoteToFirst(s,p)));
  const first=members.filter(p=>p.teamId===club),pitching=(p:Player)=>['SP','RP','CP'].includes(p.position),count=(pos:Position)=>first.filter(p=>p.position===pos).length;
  const arms=first.filter(pitching).length;
  if(s.proWorld.seasonClosed&&first.length===capacity)return;
  if(first.length===capacity&&arms>=12&&arms<=15&&count('SP')>=5&&count('SP')<=6&&(['C','SS','CF','2B','1B','3B','LF','RF'] as Position[]).every(pos=>count(pos)>0))return;
  // Exact registration counts take priority over movement cooldowns. Regular
  // third-team players still pass through second-team registration first.
  let added=false;
  const recruit=(position:Position)=>{
    let index=0,id:string;do{id=`first-depth:${s.proWorld!.year}:${club}:${position}:${index++}`;}while(s.players.some(p=>p.id===id));
    const p=createCareerNPC(`${s.seed}:${id}`,club+20,index,'pro',false,position);p.id=id;
    initializeProfessional(s,p,club,'first-depth');
    const contractYear=s.proWorld!.year+(s.proWorld!.seasonClosed?1:0);
    p.professional!.contract=contractFor(club,contractYear,MIN_PRO_SALARY);
    p.professional!.rookieYear=contractYear;
    p.professional!.service=[{club,from:contractYear,to:contractYear}];
    p.professional!.highestSalary=MIN_PRO_SALARY;
    s.players.push(p);members.push(p);added=true;
    proNews(s,`${p.name} · 1군 정원·필수 포지션 확보를 위한 최저 연봉 보강`);
  };
  for(const position of ['C','SS','CF','2B','1B','3B','LF','RF','SP','RP'] as Position[]){
    const minimum=position==='SP'?5:position==='RP'?7:1;
    while(members.filter(p=>firstTeamSlotPosition(p.position)===position).length<minimum)recruit(position);
  }
  while(members.length<capacity)recruit('1B');
  const scores=new Map<Player,number>();
  const score=(p:Player)=>{let value=scores.get(p);if(value===undefined){value=organizationScore(p);scores.set(p,value);}return value;};
  const emergency=new Set(members.filter(p=>p.teamId!==club).map(p=>p.id));
  const ordered=members.sort((a,b)=>Number(b.teamId===club&&guaranteedProStarter(b,b.position,s.date))-Number(a.teamId===club&&guaranteedProStarter(a,a.position,s.date))||Number(b.teamId===club)-Number(a.teamId===club)
    ||Number(!!a.professional?.lastRegistration&&a.teamId!==club)-Number(!!b.professional?.lastRegistration&&b.teamId!==club)
    ||Math.floor(a.teamId/10)-Math.floor(b.teamId/10)||score(b)-score(a)||a.id.localeCompare(b.id)),chosen=new Set<string>();
  const desired=first.length<=capacity&&arms>=12&&arms<=15?arms:firstTeamSlots(s.seed,club).filter(pos=>['SP','RP','CP'].includes(pos)).length;
  const sp=Math.max(5,Math.min(6,count('SP')));
  for(const pos of ['C','SS','CF','2B','1B','3B','LF','RF',...Array(sp).fill('SP'),...Array(desired-sp).fill('RP')] as Position[]){const p=ordered.find(p=>!chosen.has(p.id)&&firstTeamSlotPosition(p.position)===pos);if(p)chosen.add(p.id);}
  // Preserve the additional September/camp registrations after required slots.
  for(const p of ordered)if(chosen.size<capacity&&!chosen.has(p.id))chosen.add(p.id);
  for(const p of ordered.filter(p=>p.teamId===club&&!chosen.has(p.id)))setProSquad(s,p,'second',true);
  for(const p of ordered.filter(p=>chosen.has(p.id)&&p.teamId!==club)){
    if(emergency.has(p.id)&&p.teamId>=20)setProSquad(s,p,'second');
    setProSquad(s,p,'first',false,emergency.has(p.id));
  }
  const second=members.filter(p=>p.teamId===club+10).sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id));
  while(second.length>30){const index=second.findIndex(p=>canAssignProSquad(p,'third',s.date)&&second.filter(q=>q.position===p.position).length>(p.position==='SP'?5:p.position==='RP'?4:1));if(index<0)break;setProSquad(s,second.splice(index,1)[0],'third');}
  if(added)syncJerseyNumbers(s);
}
export function reservePromotionCandidates(s:GameState,club:number,position?:Position){
  return s.players.filter(p=>p.teamId>=20&&p.teamId<40&&p.teamId%10===club&&p.professional?.employment==="active"&&(!position||p.position===position)&&available(p,s.date)).sort(compareReserveCandidates);
}
