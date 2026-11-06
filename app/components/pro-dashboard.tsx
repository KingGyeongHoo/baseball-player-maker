import type {ReactNode} from "react";
import {addDays,getPlayer} from "../../lib/sim/engine";
import type {GameState} from "../../lib/sim/types";
import CareerDashboard from "./career-dashboard";
import PlayerAbilities from "./player-abilities";
import {salaryText} from "./pro-career-panels";

function ProWeekSchedule({state}:{state:GameState}) {
  const player=getPlayer(state);
  return <div className="week-schedule">{Array.from({length:7},(_,i)=>{
    const date=addDays(state.date,i),game=state.calendar.events.find(g=>g.date===date&&[g.homeTeamId,g.awayTeamId].includes(player.teamId));
    const opponent=game?state.teams[game.homeTeamId===player.teamId?game.awayTeamId:game.homeTeamId]:undefined;
    const label=game?`${game.homeTeamId===player.teamId?"홈":"원정"} · ${opponent?.shortName??opponent?.name??"대진 미정"}`:state.calendar.trainingDays.includes(date)?"훈련":"휴식";
    const dow=new Date(date+"T00:00:00Z").getUTCDay();
    return <div key={date} className={`schedule-day ${i===0?"today":""} ${game?"game-day":""}`} title={`${date} · ${label}`}><span>{["SUN","MON","TUE","WED","THU","FRI","SAT"][dow]}</span><b>{Number(date.slice(-2))}</b><small>{label}</small><i/></div>;
  })}</div>;
}

export default function ProDashboard({state,onTab,onTraining,trainingDisabled,records,notice}:{
  state:GameState;onTab:(tab:"roster"|"records"|"games"|"career"|"contract")=>void;onTraining:()=>void;trainingDisabled:boolean;records:ReactNode;notice?:ReactNode;
}) {
  const p=getPlayer(state),world=state.proWorld,pro=p.professional,contract=pro?.contract;
  const level=p.teamId<0?"무소속":state.postSchool?.pro?.level==="first"?"1군":"2군";
  const year=pro?Math.max(1,(world?.year??state.calendar.seasonYear)-pro.rookieYear+1):null;
  const registration=state.careerMode==="pro"?level:"대학";
  const stages={camp:"스프링캠프",regular:"정규 시즌",postseason:"포스트시즌",summary:"시즌 결산",offseason:"비시즌",retired:"은퇴"};
  return <div className="pro-career-dashboard"><CareerDashboard state={state}
    onTab={tab=>onTab(tab==="team"?"roster":tab)} onTraining={onTraining} trainingDisabled={trainingDisabled}
    profileMeta={<>{state.teams[p.teamId]?.name??"무소속"} · {p.age??19}세{year?` · 프로 ${year}년차`:""}</>}
    profileBadge={<span className={`pro-registration-badge ${registration==="1군"?"first":""}`}>{registration}{p.proContract?.status==="developmental"?" · 신고":""}</span>}
    teamActionLabel="선수·로스터 ↗" records={records} schedule={<ProWeekSchedule state={state}/>} abilities={<PlayerAbilities player={p} detailsOnly/>}
    summary={<>{world&&<div className="pro-dashboard-summary" aria-label="프로 목표와 계약 요약">
      <button type="button" onClick={()=>onTab("career")}><span>현재 목표 <small>목표 설정 ↗</small></span><b>{world.customGoal??world.goal}</b><em>{stages[world.stage]}</em></button>
      <button type="button" onClick={()=>onTab("contract")}><span>계약 <small>계약 보기 ↗</small></span><b>{contract?salaryText(contract.salary):"무소속 · 새 기회 준비"}</b><em>{contract?`${contract.endYear}년까지 · 연봉`:"입단 제안 확인"}</em></button>
    </div>}{notice}</>}/></div>;
}
