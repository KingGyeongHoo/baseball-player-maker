import { useEffect, useRef, useState } from "react";
import { getPlayer, labels } from "../../lib/sim/engine";
import { developmentalOffer } from "../../lib/sim/draft-outcome";
import { acknowledgeCareer, continueCareer, type CareerChoice } from "../../lib/sim/pro-career";
import type { GameState } from "../../lib/sim/types";
import ScoutingReportButton from "./scouting-report";

export function CareerNoticeDialog({ state, onChange }: { state: GameState; onChange: (state: GameState) => void }) {
  const dialog=useRef<HTMLDialogElement>(null),title=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{const el=dialog.current;el?.showModal();title.current?.focus();return ()=>el?.close();},[]);
  const notice=state.careerNotice;
  if(!notice)return null;
  return <dialog ref={dialog} className="modal career-event-modal" aria-labelledby="career-notice-title" onCancel={e=>{e.preventDefault();onChange(acknowledgeCareer(state));}}>
    <div className="modal-header"><h2 id="career-notice-title" tabIndex={-1} ref={title}>{notice.title}</h2><span className="position-tag">CAREER LIFE</span></div>
    <div className="guide-content"><p>{notice.message}</p><div className="modal-actions"><button className="primary" onClick={()=>onChange(acknowledgeCareer(state))}>확인</button></div></div>
  </dialog>;
}
export default function CareerContinuation({ state, onChange, onRetire }: { state:GameState;onChange:(state:GameState)=>void;onRetire?:()=>void }) {
  const [error,setError] = useState("");
  const choosing = useRef(false);
  useEffect(()=>{choosing.current=false;},[state]);
  if (state.careerMode === "college") return <CollegeContinuation state={state} onChange={onChange}/>;
  if (state.phase !== "ended" || state.careerMode || !state.draftOutcome?.revealed) return null;
  const p=getPlayer(state),pick=state.draft.find(row=>row.playerId===p.id),offer=state.draftOutcome.offer ?? developmentalOffer(state);
  const act=(choice:CareerChoice)=>{if(choosing.current)return;choosing.current=true;try{setError("");onChange(continueCareer(state,choice));}catch(error){choosing.current=false;setError(error instanceof Error?error.message:"입단에 실패했습니다.");}};
  return <div className="draft-result-summary draft-next-chapter">
    <div className="draft-next-copy"><span className="eyebrow">THE NEXT CHAPTER</span>
      <div className="draft-pick-heading"><h3>{pick ? `${pick.club} · 전체 ${pick.overall}순위 지명` : offer ? "드래프트 지명은 받지 못했지만, 신고선수로 입단 제의를 받았습니다." : "이번 드래프트에서는 지명받지 못했습니다."}</h3>{pick&&<ScoutingReportButton state={state} pick={pick} year={state.calendar.seasonYear}/>}</div>
      {pick ? <p>{pick.round}라운드 · {pick.slot}순번 · {pick.role}<br/>고교 기록과 능력치를 이어 {pick.club}의 신인 시즌을 시작합니다.</p>
        : offer ? <><p><b>{offer.club}</b> · {offer.reason === "topSkill" ? `${labels[offer.stat!]} 전국 TOP${offer.rank}` : "지명권과 근소한 평가 차이로 가능성을 인정받았습니다."}</p><p>신고선수는 프로 입단은 가능하지만, 성장과 기회가 제한적입니다.</p><p>성장 90% · 출전 기회 감소 · 2군 경기 성과를 쌓으면 정식 선수 전환과 제한 해제</p></>
        : <p>고교에서 쌓은 기록은 아래에서 확인할 수 있습니다.<br/>은퇴를 선택하면 첫 화면으로 돌아갑니다.</p>}
      {error&&<p className="error" role="alert">{error}</p>}
    </div>
    <div className="draft-next-actions">{pick ? <button className="primary" onClick={()=>act("join")}>프로 입단 →</button> : <>
      {offer&&<button className="primary" onClick={()=>act("developmental")}>신고선수 입단 →</button>}
      <button className={offer?"secondary":"primary"} onClick={onRetire}>은퇴</button>
    </>}</div>
  </div>;
}
function CollegeContinuation({ state, onChange }: { state:GameState;onChange:(state:GameState)=>void }) {
  const [error,setError]=useState("");const choosing=useRef(false);
  useEffect(()=>{choosing.current=false;},[state]);
  if(state.phase!=="ended"||state.careerMode==="pro")return null;
  const p=getPlayer(state),info=state.postSchool,board=state.careerMode==="college"?info?.collegeDraft??[]:state.draft;
  const pick=board.find(row=>row.playerId===p.id),tried=!!info?.tryouts.some(row=>row.year===state.calendar.seasonYear),years=info?.collegeYears??0;
  const act=(choice:CareerChoice)=>{if(choosing.current)return;choosing.current=true;try{setError("");onChange(continueCareer(state,choice));}catch(e){setError(e instanceof Error?e.message:"진로 선택에 실패했습니다.");choosing.current=false;}};
  return <section className="panel continuation-panel"><div className="panel-heading"><div><span className="eyebrow">THE NEXT CHAPTER</span><h2>{pick?"다음 무대는 프로입니다.":"도전은 여기서 끝나지 않습니다."}</h2></div></div>
    <div className="continuation-body"><p>{pick?`${pick.club}의 유니폼을 입고 다음 해 2군에서 신인 시즌을 시작합니다. 능력치·재능·고교 기록을 이어갑니다.`:"대학에서 더 성장하거나, 입단 테스트에서 다시 기회를 잡을 수 있습니다."}</p>
      <div className="continuation-choices">{pick?<button className="primary" onClick={()=>act("join")}>{pick.club} 입단하기 →</button>:<>
        <button className="primary" disabled={tried} onClick={()=>act("tryout")}>{tried?"올해 입단 테스트 참가 완료":"프로 입단 테스트 도전"}</button>
        <button className="secondary" disabled={years>=4} onClick={()=>act("college")}>{years===0?"대학 진학 후 다시 도전":"다음 대학 육성 시즌 시작"}</button>
      </>}</div>
      {!pick&&<p className="micro muted">입단 테스트는 한 해 한 번, 대학 육성 시즌은 최대 4회입니다. 능력에 따라 합격 가능성이 달라집니다. 게임용 재도전 경로입니다.</p>}
      {error&&<p role="alert" className="error">{error}</p>}
    </div>{state.careerNotice&&<CareerNoticeDialog state={state} onChange={onChange}/>}</section>;
}
