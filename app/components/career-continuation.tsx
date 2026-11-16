import { useEffect, useRef, useState } from "react";
import { getPlayer, labels } from "../../lib/sim/engine";
import { developmentalOffer } from "../../lib/sim/draft-outcome";
import { acknowledgeCareer, continueCareer, type CareerChoice } from "../../lib/sim/pro-career";
import type { GameState } from "../../lib/sim/types";
import ScoutingReportButton from "./scouting-report";
import {SeasonAwards} from "./pro-awards";
import {regularSeasonFinishNotice,professionalSeasonFinishNotice} from "../../lib/pro-postseason";
import RegistrationChanges from './registration-changes';
import {IndividualAwardsTable} from './individual-awards-table';

export function CareerNoticeDialog({ state, onChange }: { state: GameState; onChange: (state: GameState) => void }) {
  const dialog=useRef<HTMLDialogElement>(null),title=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{const el=dialog.current;el?.showModal();title.current?.focus();return ()=>el?.close();},[state.careerNotice?.id]);
  const storedNotice=state.careerNotice;
  if(!storedNotice)return null;
  const seasonYear=storedNotice.kind==='seasonComplete'&&/^season:\d{4}$/.test(storedNotice.code??'')?Number(storedNotice.code!.split(':')[1]):undefined;
  const notice=storedNotice.code?.startsWith('PRO10:postseason:')?{...storedNotice,...regularSeasonFinishNotice(state)}:seasonYear!==undefined?{...storedNotice,...professionalSeasonFinishNotice(state,seasonYear)}:storedNotice;
  const awards=notice.code?.startsWith('awards:')?state.proWorld?.seasons.find(row=>row.year===Number(notice.code!.split(':')[1])):undefined;
  const trophy=notice.award,titles=notice.individualTitles,pendingTrophies=state.noticeQueue?.some(row=>row.award||row.individualTitles);
  const titleSeason=titles?state.proWorld?.seasons.find(row=>row.year===titles.year):undefined;
  const message=notice.code?.startsWith('awards:')?notice.message.split('1군 정규시즌 기록만으로 선정했습니다.')[0].split('출전평가 보상:')[0].trim():notice.message;
  const registration=state.careerMode==='pro'&&['promoted','demoted'].includes(notice.kind),converted=state.careerMode==='pro'&&notice.kind==='registered';
  return <dialog ref={dialog} className={`modal career-event-modal${trophy||titles?' award-celebration-modal':''}${titles?' individual-titles-modal':''}${converted?' regular-conversion-modal':''}`} aria-labelledby="career-notice-title" onCancel={e=>{e.preventDefault();onChange(acknowledgeCareer(state));}}>
    <div className="modal-header"><h2 id="career-notice-title" tabIndex={-1} ref={title}>{trophy?<>{trophy.year}년{' '}<span className="award-celebration-title">{trophy.title}</span>{trophy.title==='신인왕'?'을':'를'} 획득했다!!</>:seasonYear!==undefined&&notice.title.endsWith('우승!')?<>{notice.title.slice(0,-3)}<span className="season-victory-text">우승!</span></>:converted?'정식 선수 전환!':notice.title}</h2><span className="position-tag">{trophy||titles?'SEASON HONORS':'CAREER LIFE'}</span></div>
    <div className="guide-content">{titles?<><p className="individual-titles-context">{titles.year}년 · {titles.level==='first'?'1군':'2군'} · {titles.field==='batting'?'타자':'투수'}</p><IndividualAwardsTable state={state} season={titleSeason} level={titles.level} field={titles.field}/></>:trophy?<div className="award-celebration-body"><span className="eyebrow">A SEASON TO REMEMBER</span><p>한 시즌의 활약이 커리어에 새겨졌습니다.</p><div className="award-rating-gain"><span>출전평가 수상 보너스</span><b>+{trophy.bonus}</b><p>{trophy.before!==undefined?`${trophy.before.toFixed(1)} → ${trophy.after.toFixed(1)}`:`현재 출전평가 ${trophy.after.toFixed(1)}`}</p></div></div>:registration?<RegistrationChanges state={state} notice={notice}/>:converted?<div className="regular-conversion"><span className="regular-conversion-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6"/></svg></span><p>정식 전환 요건을 충족하여<br/>정식 선수로 전환되었습니다.</p></div>:message.split("\n\n").filter(Boolean).map((paragraph,index)=><p key={index}>{paragraph}</p>)}{awards&&<SeasonAwards state={state} season={awards}/>}<div className="modal-actions"><button className="primary" onClick={()=>onChange(acknowledgeCareer(state))}>{pendingTrophies?'다음 수상 확인':(awards||trophy||titles)&&state.proWorld?.resumeCampAfterAwards?'시상식 마치고 캠프로':'확인'}</button></div></div>
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
      {!pick&&<p className="micro muted">입단 테스트 연 1회 · 대학 육성 최대 4시즌</p>}
      {error&&<p role="alert" className="error">{error}</p>}
    </div>{state.careerNotice&&<CareerNoticeDialog state={state} onChange={onChange}/>}</section>;
}
