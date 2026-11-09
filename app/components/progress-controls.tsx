import {dateLabel,getPlayer,ticketsUsed,validPolicy} from "../../lib/sim/engine";
import type {GameState,Policy} from "../../lib/sim/types";
import {trainingLabel} from "./training-editor";

export default function ProgressControls({state,policy,busy,auto,autoStartWeek,onAdvance,onToggleAuto,pendingOutcome=false}:{
  state:GameState;policy:Policy;busy:boolean;auto:boolean;autoStartWeek:number;
  onAdvance:()=>void;onToggleAuto:()=>void;pendingOutcome?:boolean;
}) {
  const player=getPlayer(state);
  const pendingDecision=!!player.roleOffer||!!state.careerEvent||!!state.careerNotice||pendingOutcome;
  const pro=!!state.careerMode,month=player.professional?.employment==="freeAgent";
  const pauseEvents=pro?"시즌 종료":"드래프트 종료";
  return <div className="week-control"><div>
    <div className="week-control-info">
      <span className="week-label">WEEK {String(state.week).padStart(2,"0")}</span>
      <div><b>{dateLabel(state.date)}</b><span>{trainingLabel(policy)} · {ticketsUsed(policy)}개 투자{!validPolicy(policy)?" · 배분 확인":""}</span></div>
      {auto&&<span className="auto-running" role="status"><i className="status-dot"/>자동 진행 · {state.week-autoStartWeek}주 완료</span>}
    </div>
    <p>{auto?`설정 유지 중 · 직접 일시정지하거나 ${pauseEvents} 때 멈춥니다.`:state.weekProgress?"선택한 시점에서 남은 일정을 이어갑니다.":"훈련 설정을 유지하며 자동으로 진행할 수 있습니다."}</p>
    <div className="progress-actions">
      <button className={`secondary auto-toggle ${auto?"is-running":""}`} aria-pressed={auto}
        disabled={!auto&&(busy||!validPolicy(policy)||pendingDecision)}
        title={auto?"계산 중인 일정을 마친 뒤 일시정지합니다.":pendingDecision?"진행 중인 제안이나 이벤트에 먼저 답해 주세요.":`현재 설정으로 계속 진행합니다. ${pauseEvents} 시 멈춥니다.`}
        onClick={onToggleAuto}>
        <span aria-hidden="true">{auto?"Ⅱ":"▷"}</span>{auto?"일시정지":"자동 진행"}
      </button>
      <button className="primary" disabled={busy||auto||pendingDecision||!validPolicy(policy)} onClick={onAdvance}>
        {busy?<><span className="spinner"/>{month?"한 달을 진행하는 중…":"한 주를 진행하는 중…"}</>:<>{state.weekProgress?"계속 진행하기":month?"한 달 개인 훈련":"1주 진행하기"}<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></>}
      </button>
    </div>
  </div></div>;
}
