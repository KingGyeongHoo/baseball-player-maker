import {useEffect,useId,useRef,useState} from "react";
import {scoutingReportFor} from "../../lib/sim/scouting-report";
import {labels} from "../../lib/sim/engine";
import {scoreText} from "../../lib/display";
import type {DraftPick,GameState} from "../../lib/sim/types";
import {PlayerEvaluationContent} from "./player-evaluation";

export function ScoutingReportContent({state,pick,year}:{state:GameState;pick:DraftPick;year?:number}){
  const report=scoutingReportFor(state,pick,year);
  return <div className="scouting-report-content">
    <p className="scouting-report-meta">{report.year} 드래프트 · {pick.club} · 전체 {pick.overall}순위</p>
    <p className="scouting-report-summary">{report.summary}</p>
    {report.tools.length>0&&<section aria-label="지명 당시의 주요 도구"><h3>지명 당시의 주요 도구</h3><div className="scouting-tools">{report.tools.map(tool=><article key={tool.stat}><div><span>{labels[tool.stat]}</span><b>{scoreText(tool.value)}</b></div><h4>{tool.title}</h4><p>{tool.description}</p>{tool.rank!==undefined&&<small>당해 {report.statsSnapshot&&["velocity","control","movement"].includes(tool.stat)?"투수":"같은 분야"} 후보 {tool.poolSize}명 중 {tool.rank}위</small>}</article>)}</div></section>}
    <section aria-label="지명을 뒷받침한 평가"><h3>지명을 뒷받침한 평가</h3><div className="scouting-reasons">{report.reasons.map(reason=><div key={reason.title}><h4>{reason.title}</h4><p>{reason.description}</p></div>)}</div></section>
    <section className="scouting-development"><h3>입단 후 기대하는 과제</h3><p>{report.development}</p></section>
    {report.evaluation&&<details className="draft-evaluation-details"><summary>지명 당시 고교 평가 자세히</summary><PlayerEvaluationContent report={report.evaluation} parameters={report.evaluationParameters}/></details>}
    <p className="micro muted">{report.source==="draft"?"지명 당시의 능력·기록·평가를 보관한 리포트입니다.":report.source==="archive"?"보관된 당시 능력·기록과 지명 평가로 정리한 리포트입니다.":"이전 저장에는 당시 능력 원본이 없어, 보관된 지명 평가만으로 정리했습니다."} 입단 후의 성장이나 출전 결과를 보장하지 않습니다.</p>
  </div>;
}
function ReportModal({state,pick,year,onClose}:{state:GameState;pick:DraftPick;year?:number;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),titleId=useId();
  useEffect(()=>{const el=dialog.current;el?.showModal();heading.current?.focus();return()=>el?.close();},[]);
  return <dialog ref={dialog} className="modal scouting-report-modal" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}}><div className="modal-header"><h2 id={titleId} tabIndex={-1} ref={heading}>{pick.playerName} 스카우팅 리포트</h2><button className="text-button" type="button" aria-label="스카우팅 리포트 닫기" onClick={onClose}>닫기</button></div><div className="guide-content"><ScoutingReportContent state={state} pick={pick} year={year}/></div></dialog>;
}
export default function ScoutingReportButton({state,pick,year}:{state:GameState;pick:DraftPick;year?:number}){
  const [open,setOpen]=useState(false);
  return <><button className="secondary scouting-report-button" type="button" onClick={()=>setOpen(true)}>스카우팅 리포트</button>{open&&<ReportModal state={state} pick={pick} year={year} onClose={()=>setOpen(false)}/>}</>;
}
