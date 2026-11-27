import { available, isPitcher, roleFor, roleScore, selectionScore } from "./engine";
import {proStarterEligible} from './pro-pitching-fatigue';
import { BASE_SALARY, contractFor, initializeProfessional, proNews, proNotice } from "./pro-world";
import {proSquad,setProSquad} from './pro-squads';
import { canAfford, releasePlayer } from "./pro-market";
import { createCareerNPC } from "./pro-roster";
import { currentProPosition, guaranteedProStarter } from "./pro-positions";
import { syncJerseyNumbers } from "../jersey-numbers";
import type { GameState, Player, Position } from "./types";
import {injuryRiskAssessment} from './injury-system';

// A real five-man rotation and a usable bullpen must exist in BOTH leagues.
// A 29-man first team alone does not make the farm schedule playable.
export const farmMinimum: Record<Position, number> = { C:2,SS:1,CF:1,"2B":1,"1B":1,"3B":1,LF:1,RF:1,DH:0,SP:5,RP:5,CP:1 };
const slots = Object.entries(farmMinimum).flatMap(([pos, n]) => Array<Position>(n).fill(pos as Position));

// Fill registered second-team vacancies before relying on borrowed farm players.
// This emergency rule overrides registration cooldowns and first-team promises.
export function fillSecondTeamVacancies(s:GameState,clubs=Array.from({length:10},(_,i)=>i)){
  if(!s.proWorld||!['camp','regular'].includes(s.proWorld.stage)||s.matchProgress)return false;
  let changed=false;
  const positions=Object.keys(farmMinimum) as Position[];
  for(const club of clubs){
    const members=s.players.filter(p=>p.teamId>=0&&p.teamId<40&&p.teamId%10===club&&p.professional?.employment==='active');
    const second=()=>members.filter(p=>p.teamId===club+10);
    for(const p of members){const pos=p.professional!.farmVacancyPosition;if(pos&&(p.teamId!==club+10||second().some(q=>q.id!==p.id&&currentProPosition(q,pos))))delete p.professional!.farmVacancyPosition;}
    for(const pos of positions){
      if(second().some(p=>currentProPosition(p,pos)))continue;
      const first=members.filter(p=>p.teamId===club&&currentProPosition(p,pos));
      const candidates=first.length>=3?first:members.filter(p=>p.teamId>=20&&currentProPosition(p,pos));
      const score=(p:Player)=>selectionScore(p,roleFor(pos),pos);
      candidates.sort((a,b)=>(first.length>=3?score(a)-score(b):score(b)-score(a))||a.id.localeCompare(b.id));
      const move=candidates[0];if(!move)continue;
      const roster=second();
      // Free a duplicate slot, never create a new positional hole or release anyone.
      const back=roster.length>=30?roster.filter(p=>positions.every(key=>!currentProPosition(p,key)||roster.filter(q=>currentProPosition(q,key)).length>1))
        .sort((a,b)=>selectionScore(a)-selectionScore(b)||a.id.localeCompare(b.id))[0]:undefined;
      if(roster.length>=30&&!back)continue;
      const from=proSquad(move.teamId)!;
      if(!setProSquad(s,move,'second',true))continue;
      move.professional!.farmVacancyPosition=pos;
      if(back){
        // A guaranteed slot cannot make the vacancy repair exceed the farm cap.
        const to=back.proContract?.status==='developmental'?'developmental':'third';
        setProSquad(s,back,to,true);
      }
      const reason=`2군 ${pos} 공백 보충 · ${first.length>=3?'1군 동포지션 3명 이상 중 출전평가 최하위':'3군·육성 동포지션 중 출전평가 최상위'}`;
      move.professional!.movements.push({date:s.date,from:club,to:club,kind:'2군 공백 보충',reason,squad:'second'});
      proNews(s,`${move.name} · ${reason}`,`${s.date}:farm-vacancy:${move.id}:${pos}`);
      if(move.id===s.playerId||back?.id===s.playerId){
        const mine=move.id===s.playerId?move:back!,to=proSquad(mine.teamId)!;
        if(s.postSchool?.pro)s.postSchool.pro.transactions.push({date:s.date,from:mine===move?from:'second',to,reason,exchangedPlayerId:mine===move?back?.id??'':move.id});
        proNotice(s,`${s.date}:farm-vacancy:${mine.id}`,'2군 포지션 공백으로 등록을 조정했습니다',{
          ...registrationChangeNotice(from==='first'?[]:[move],[...(from==='first'?[move]:[]),...(back?[back]:[])]),message:reason,
        },mine===move&&from!=='first'?'promoted':'demoted');
      }
      changed=true;
    }
  }
  return changed;
}

export function ensurePlayableFarmRosters(s: GameState, clubs = Array.from({length:10}, (_, i) => i)) {
  if (!s.proWorld || !["camp", "regular"].includes(s.proWorld.stage) || s.matchProgress) return false;
  let changed = fillSecondTeamVacancies(s,clubs), added = false;
  for (const club of clubs) {
    const lower = () => s.players.filter(p => p.teamId >= 10 && p.teamId < 30 && p.teamId % 10 === club && p.professional?.employment === "active");
    const selected = new Set<string>();
    const healthy = (p: Player) => available(p, s.date);
    const current=lower();
    if(Object.entries(farmMinimum).every(([pos,n])=>current.filter(p=>healthy(p)&&currentProPosition(p,pos as Position)&&(pos!=='SP'||proStarterEligible(p))).length>=n))continue;
    const ordered = (position: Position) => lower().filter(p=>healthy(p)&&(position!=='SP'||proStarterEligible(p))).sort((a, b) =>
      Number(guaranteedProStarter(b,position,s.date))-Number(guaranteedProStarter(a,position,s.date))
      || Number(b.teamId === club+10)-Number(a.teamId === club+10) || roleScore(b,roleFor(position),position)-roleScore(a,roleFor(position),position) || a.id.localeCompare(b.id));
    for (const position of slots) {
      let p = ordered(position).find(p => !selected.has(p.id) && currentProPosition(p, position));
      if (!p && ["SP","RP","CP"].includes(position)) {
        // Reassign surplus NPC pitchers before recruiting. Never turn a batter
        // into a pitcher, change skills, or change the user's chosen position.
        p = ordered(position).find(q => !selected.has(q.id) && q.id !== s.playerId && !q.twoWay
          && isPitcher(q.primaryRole) && !guaranteedProStarter(q,q.position,s.date)
          && lower().filter(r => healthy(r) && r.position === q.position).length > farmMinimum[q.position]);
        if (p) {
          p.position=position;p.primaryRole=roleFor(position);p.preferredRole=p.primaryRole;
          p.eligiblePositions=[...new Set([...p.eligiblePositions,position])];
          proNews(s,`${p.name} · 2·3군 통합 투수진 공백을 위한 ${p.primaryRole} 보직 조정`);changed=true;
        }
      }
      if (!p) {
        if (!canAfford(s,club,BASE_SALARY,s.proWorld.year,1)) continue;
        const members=s.players.filter(q=>q.teamId>=0&&q.teamId%10===club&&q.professional?.employment==="active");
        if (members.length>=74 || members.filter(q=>q.teamId>=10).length>=45) {
          const excess=lower().filter(q=>q.id!==s.playerId&&!selected.has(q.id)&&!guaranteedProStarter(q,q.position,s.date)
            && lower().filter(r=>r.position===q.position).length>farmMinimum[q.position])
            .sort((a,b)=>Number(b.teamId>=20)-Number(a.teamId>=20)||roleScore(a)-roleScore(b)||a.id.localeCompare(b.id))[0];
          if (!excess) continue;
          // Existing guaranteed salary remains payable, including future years.
          releasePlayer(s,excess,"2군 필수 포지션·투수진 확보를 위한 잉여 인원 조정",s.proWorld.year);
        }
        p=s.players.filter(q=>q.id!==s.playerId&&q.professional?.employment==="freeAgent"&&!q.professional.nonRenewal
          &&q.proContract?.status!=="developmental"&&q.position===position&&(q.age??19)<=35&&healthy(q)&&(position!=='SP'||proStarterEligible(q)))
          .sort((a,b)=>(roleScore(b)-injuryRiskAssessment(b,s.date).interestPenalty)-(roleScore(a)-injuryRiskAssessment(a,s.date).interestPenalty)||a.id.localeCompare(b.id))[0];
        if (!p) {
          let index=0,id:string;
          do {id=`farm-depth:${s.proWorld.year}:${club}:${position}:${index++}`;} while(s.players.some(q=>q.id===id));
          p=createCareerNPC(`${s.seed}:${id}`,club+20,index,"pro",false,position);p.id=id;
          initializeProfessional(s,p,club,"farm-depth");s.players.push(p);added=true;
        } else {
          p.professional!.employment="active";
          p.professional!.service.push({club,from:s.proWorld.year,to:s.proWorld.year});
          p.professional!.movements.push({date:s.date,from:null,to:club,kind:"2군 보강",reason:"필수 포지션·투수진 확보"});
          p.teamId=club+20;
        }
        p.professional!.contract=contractFor(club,s.proWorld.year,BASE_SALARY,1,"released");
        proNews(s,`${p.name} · 2군 ${position} 공백 보강 · 1년 기본 연봉`);changed=true;
      }
      selected.add(p.id);
    }
    // Playing a farm game never changes a second/third registration.

  }
  changed=fillSecondTeamVacancies(s,clubs)||changed;
  if(added)syncJerseyNumbers(s);
  return changed;
}
import {registrationChangeNotice} from '../pro-registration-notice';
