"use client";
import {useEffect,useId,useRef,useState} from "react";
import {scoreText,changeText} from "../../lib/display";
import {formatInnings} from "../../lib/player-records";
import {labels,positions,roleLabel} from "../../lib/sim/engine";
import {evaluationReference} from "../../lib/sim/evaluation-reference";
import {evaluationProjections} from "../../lib/sim/evaluation-projection";
import {evaluationSummary,playerEvaluationFor,restoreEvaluation} from "../../lib/sim/player-evaluation";
import type {EvaluationSnapshot,PerformanceEvidence,ReputationBreakdown} from "../../lib/sim/player-evaluation-types";
import type {GameState,Player} from "../../lib/sim/types";

const rate=(n:number|null,digits=3)=>n===null?"미측정":n.toFixed(digits).replace(/^0\./,".");
const percent=(n:number|null)=>n===null?"미측정":`${(n*100).toFixed(1)}%`;
function Performance({label,data,weighted=false}:{label:string;data:{batting:PerformanceEvidence;pitching:PerformanceEvidence};weighted?:boolean}){
  return <section className="evaluation-performance"><h4>{label}</h4><div className="evaluation-fields">{(["batting","pitching"] as const).map(field=>{const p=data[field],pitching=field==="pitching";return <article key={field}><div className="evaluation-field-title"><b>{pitching?"투구":"타격"}</b><span>{p.confidence}</span></div>
    <p>{weighted?"가중 환산 ":""}{pitching?`${scoreText(p.sample)} BF · ${weighted?(p.outs/3).toFixed(1):formatInnings(p.outs)} IP`:`${scoreText(p.sample)} PA`}</p>
    {p.sample>0?<><div className="evaluation-raw">{pitching?<>ERA <b>{rate(p.raw.era,2)}</b> · WHIP <b>{rate(p.raw.whip,2)}</b></>:<>AVG <b>{rate(p.raw.avg)}</b> · OPS <b>{rate(p.raw.ops)}</b></>}</div>
      <table><thead><tr><th>지표</th><th>{weighted?"가중값":"실제"}</th><th>표본 보정</th><th>동일 리그</th></tr></thead><tbody>
        {!pitching&&<tr><th>OPS</th><td>{rate(p.raw.ops)}</td><td>{rate(p.adjusted.ops)}</td><td>{rate(p.league.ops)}</td></tr>}
        <tr><th>K%</th><td>{percent(p.raw.k)}</td><td>{percent(p.adjusted.k)}</td><td>{percent(p.league.k)}</td></tr><tr><th>BB%</th><td>{percent(p.raw.bb)}</td><td>{percent(p.adjusted.bb)}</td><td>{percent(p.league.bb)}</td></tr>
        {pitching&&<tr><th>K−BB%</th><td>{percent(p.raw.kMinusBB)}</td><td>{percent(p.adjusted.kMinusBB)}</td><td>{percent(p.league.kMinusBB)}</td></tr>}
      </tbody></table><p className="micro muted">{p.leagueSeason?`${p.leagueSeason} 시즌 동일 레벨 기준. `:""}보정은 판단용이며 공식 기록은 그대로입니다. 사전 표본은 볼넷·삼진 {p.prior.events}, 안타 {p.prior.hits}, 추가루타 {p.prior.extraBases}입니다.</p></>:<p className="muted">미측정 · 평가할 경기 근거가 없습니다. 능력과 전망은 별도로 살펴봅니다.</p>}
  </article>;})}</div></section>;
}
export function ReputationDetails({data}:{data:ReputationBreakdown}){
  return <section><h3>평판 평가</h3><p>평판 <b>{scoreText(data.total)}</b> · 기량·성적 평가 {scoreText(data.base)} · 이벤트·경력 보너스 {scoreText(data.bonus)}</p>
    <table><thead><tr><th>역할</th><th>기량</th><th>보정 성과</th><th>성적 반영</th><th>분야 평가</th></tr></thead><tbody>{data.fields.map(p=><tr key={p.field}><th>{roleLabel(p.role)}</th><td>{scoreText(p.ability)}</td><td>{p.performance===null?"미측정":scoreText(p.performance)}</td><td>{scoreText(p.performanceWeight*100)}%</td><td>{scoreText(p.score)}</td></tr>)}</tbody></table>
    <p className="micro muted">성적의 최대 비중은 40%이며 표본 신뢰도에 따라 낮아집니다. 기록이 없으면 역할 기량을 반영합니다. 겸업은 두 분야를 각각 평가해 평균합니다. OVR 계산은 그대로입니다.</p>
  </section>;
}
export function PlayerEvaluationContent({report,parameters}:{report:EvaluationSnapshot;parameters?:Record<string,number>}){
  const projections=parameters?evaluationProjections(report,parameters):[],primary=report.roles.find(r=>r.role===report.role)??report.roles[0];
  const mode=report.mode==="pro"?"pro":undefined;
  return <div className="player-evaluation-content">
    <p className="evaluation-meta">{report.date} 평가 · {report.teamName} · {report.mode==="school"?`고${report.grade} · ${report.graduationYear}년 졸업 예정`:`${report.season} 시즌 · ${positions[report.position]}`}</p>
    <p className="evaluation-summary">{evaluationSummary(report)}</p>
    {report.mode==="school"&&report.reputation&&<ReputationDetails data={report.reputation}/>}
    <section><h3>현재 능력</h3><p className="micro muted">{report.mode==="school"?"동급생 순위는 주력 분야와 겸업 분야에 표시합니다. 보조 분야의 순위는 별도로 만들지 않습니다.":"기본 능력 1~100을 표시합니다. 피로·일시 부상으로 기본 능력을 낮추지 않습니다."}</p>
      <div className="evaluation-tools">{(["batting","pitching"] as const).map(field=><div key={field}><h4>{field==="batting"?"타자":"투수"} 능력</h4><table><thead><tr><th>항목</th><th>능력</th>{report.mode==="school"&&<th>동급생 내 순위</th>}</tr></thead><tbody>{report.tools.filter(t=>(field==="batting"?["contact","power","speed","defense"]:["velocity","control","movement"]).includes(t.stat)).map(t=><tr key={t.stat}><th>{labels[t.stat]}</th><td>{scoreText(t.value)}</td>{report.mode==="school"&&<td>{t.cohortRank?`${t.cohortRank} / ${t.cohortSize}명`:"별도 비교 없음"}</td>}</tr>)}</tbody></table></div>)}</div>
      <p className="evaluation-common">{report.tools.filter(t=>["stamina","recovery","arm","bq"].includes(t.stat)).map(t=><span key={t.stat}>{labels[t.stat]} <b>{scoreText(t.value)}</b></span>)}</p>
      <p className="micro muted">{report.mode==="school"?`${report.graduationYear}년 졸업 예정, 같은 투타 분야의 선수와 비교합니다. 올해 지명 순위와는 다릅니다.`:`기준표: ${report.referenceCreatedAt}의 게임 1군. ${report.referenceSource==="default"?"인원이 부족해 게임 기본 분포를 사용합니다.":"시즌 중 승격·이적만으로 기준을 다시 만들지 않습니다."}`}</p>
    </section>
    <section><h3>실제 경기 근거</h3>
      {report.performance.school&&<Performance label="고교 시즌" data={report.performance.school}/>}
      {report.performance.first&&<Performance label="1군 정규 시즌" data={report.performance.first}/>}{report.performance.second&&<Performance label="2군 정규 시즌" data={report.performance.second}/>}
      <p className="micro muted">확인 가능한 완료 경기 {report.evidence.games}경기 · 상대 {report.evidence.opponents}팀 · {report.evidence.from??"—"} ~ {report.evidence.to??"—"}</p>
      {report.evidence.competitions.length>0&&<details><summary>대회·리그별 출전 근거</summary><div className="table-scroll"><table><thead><tr><th>대회</th><th>경기</th><th>PA</th><th>BF</th><th>IP</th></tr></thead><tbody>{report.evidence.competitions.map(c=><tr key={c.id}><th>{c.name}</th><td>{c.games}</td><td>{c.records.batting.PA}</td><td>{c.records.pitching.BF}</td><td>{formatInnings(c.records.pitching.outs)}</td></tr>)}</tbody></table></div><p className="micro muted">당시 상대 팀 수준 자료가 남은 경기 {report.evidence.opponentSnapshotGames}경기. 팀 단위 근사이며 개인 맞대결 보정은 아닙니다.</p></details>}
      {report.multiyear&&<details><summary>최근 3년의 레벨별 평가</summary><Performance label="1군 · 최근성 가중 표본" data={report.multiyear.first} weighted/><Performance label="2군 · 최근성 가중 표본" data={report.multiyear.second} weighted/><p className="micro muted">올해·전년·전전년의 사건 수와 분모를 6:3:1로 합산합니다. 기록 없는 해는 50점짜리 시즌으로 만들지 않습니다.</p></details>}
    </section>
    <section><h3>역할 전망과 보완 과제</h3><div className="evaluation-role"><b>{roleLabel(report.role,mode)} · 현재 역할 검토</b><p>강점: {primary?.strengths.map(k=>labels[k]).join(" · ")??"근거 없음"}</p><p>다음 과제: {primary?.needs.map(k=>labels[k]).join(" · ")??"근거 없음"} 보완과 실제 출전에서 반복 확인</p></div>
      <div className="evaluation-role-alternatives">{report.roles.filter((r,index,all)=>roleLabel(r.role,mode)!==roleLabel(report.role,mode)&&all.findIndex(other=>roleLabel(other.role,mode)===roleLabel(r.role,mode))===index).slice(0,2).map(r=><span key={r.role}>{roleLabel(r.role,mode)} 검토</span>)}</div>
      <p className="micro muted">기존 보직 가중치에 따른 검토입니다. 포지션 자격·겸업 자격이나 출전을 자동으로 부여하지 않습니다. 수비·주루는 게임 능력 기반이며 실측 성과가 아닙니다.</p>
      {report.growth&&<p>관찰된 변화 ({report.growth.from} → {report.growth.to}): {Object.entries(report.growth.changes).length?Object.entries(report.growth.changes).map(([k,n])=>`${labels[k as keyof typeof labels]} ${changeText(n!)}`).join(" · "):"현재 능력 변화 없음"}</p>}
    </section>
    {report.mode==="pro"&&<section><h3>고정된 1군 상대 모델 전망</h3><p className="micro muted">실전 성적과 별개입니다. 정상 컨디션 · {{down:"다운스윙",level:"레벨스윙",up:"어퍼스윙"}[report.stance.batting]} / {report.stance.pitching==="full"?"전력투구":"커맨드 투구"} · 기준 수비 환경에서 상대별 조건부 확률을 평균했습니다.</p><div className="evaluation-fields">{(["batting","pitching"] as const).map(field=><article key={field}><b>{field==="batting"?"타격 모델":"투구 모델"}</b><p>{field==="batting"?"예상 OPS":"상대 타자 예상 OPS"} <strong>{rate(report.model[field].ops)}</strong></p><p>BB {percent(report.model[field].bb)} · K {percent(report.model[field].k)} · HR {percent(report.model[field].hr)}</p><small className="muted">고정 상대 {report.model[field].opponents}명</small></article>)}</div></section>}
    <section><h3>조건부 성장 전망</h3><p className="micro muted">공개된 재능: 타격 {report.publicTalent.batting.label} · 투구 {report.publicTalent.pitching.label}. 숨겨진 재능·개별 노화값이나 미래 사건은 입력하지 않습니다.</p>
      {projections.map(p=><div className="evaluation-projection" key={p.target}><h4>{p.label} · {p.target}</h4><table><thead><tr><th>분야</th><th>현재 OVR</th><th>보수적</th><th>기준</th><th>낙관적</th></tr></thead><tbody>{(["batting","pitching"] as const).map(field=><tr key={field}><th>{field==="batting"?"타자":"투수"}</th><td>{scoreText(p.fields[field].current)}</td><td>{scoreText(p.fields[field].low)}</td><td>{scoreText(p.fields[field].base)}</td><td>{scoreText(p.fields[field].high)}</td></tr>)}</tbody></table>
        {p.registeredBase&&<p>현 신분 유지가 기본 전망입니다. 지금 정식 전환된다고 가정하면 기준 전망은 타자 {scoreText(p.registeredBase.batting)} / 투수 {scoreText(p.registeredBase.pitching)}입니다.</p>}<p className="micro muted">{p.basis}</p></div>)}
      {!parameters&&<p className="muted">당시 전망 계산 기준 자료가 없습니다.</p>}{report.health.unattached&&<p className="micro muted">무소속 성장 60%와 2시즌 제한을 반영합니다. 제한 이후의 전망은 재입단을 확인한 뒤 새로 평가합니다.</p>}
    </section>
    <details><summary>몸 상태·평가 근거와 현재 판정 비교</summary><p>평가 당시 피로 {scoreText(report.health.fatigue)} · {report.health.available?"활동 가능":report.health.injuryUntil?`${report.health.injuryUntil} 부상 복귀 예정`:"휴식·활동 제한"}</p>
      {report.availability&&<p>{report.availability.from}~{report.availability.lastDate}: 추적 {report.availability.days}일 중 활동 가능 {report.availability.availableDays}일, 부상 {report.availability.injuredDays}일. 이 기간 이전의 부상 이력은 추정하지 않습니다.</p>}
      <p>평가 당시 {report.mode==="pro"?"출전평가":"출전 심사점수"} {scoreText(report.comparison.legacyRegistration)}</p>
      <p className="micro muted">{report.mode==="pro"?"현재 출전평가는 보직 기량과 시즌 성적을 중심으로 최근 성적을 약하게 반영하며 피로를 감점하지 않습니다. WAR는 시즌 결산·계약의 성과 평가에 사용합니다. 과거 관찰의 점수는 당시 기준을 보존합니다.":"고교의 대표 평가는 평판입니다. 출전 심사에는 기량·최근 성적·몸 상태를 함께 사용합니다."} 신고선수의 정식 전환 조건은 실제 경기 기록을 기준으로 합니다.</p>
      <ul className="evaluation-missing">{report.missing.map(item=><li key={item}>{item}</li>)}</ul><p className="micro muted">{report.modelVersion} · 당시 기록과 기준을 보관한 평가입니다. 열람은 능력·평판·난수·관찰량을 바꾸지 않습니다.</p>
    </details>
  </div>;
}
type View={state:GameState;player:Player;report:EvaluationSnapshot};
function EvaluationDialog({view,onClose}:{view:View;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),id=useId(),[report,setReport]=useState(view.report);
  useEffect(()=>{dialog.current?.showModal();heading.current?.focus();const el=dialog.current;return()=>el?.close();},[]);
  const reference=view.state.evaluationSystem?.references.find(r=>r.id===report.referenceId),parameters=reference?.parameters??(!view.player.evaluationHistory?.length?evaluationReference(view.state).parameters:undefined);
  return <dialog className="modal player-evaluation-modal" ref={dialog} aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose();}}><div className="modal-header"><h2 id={id} ref={heading} tabIndex={-1}>{report.playerName} · 선수 평가</h2><button type="button" className="text-button" aria-label="선수 평가 닫기" onClick={onClose}>닫기</button></div><div className="guide-content">
    {(view.player.evaluationHistory?.length??0)>1&&<label className="evaluation-history">보관된 평가<select aria-label="선수 평가 시점" value={report.id} onChange={e=>{const observation=view.player.evaluationHistory?.find(r=>r.id===e.target.value);if(observation)setReport(restoreEvaluation(view.state,view.player,observation));}}>{view.player.evaluationHistory?.map(r=><option key={r.id} value={r.id}>{r.date} · {r.mode==="pro"?"프로":`고${r.grade}`} · {{entry:"첫 평가",monthly:"월간",introduced:"자료 도입",["season-start"]:"시즌 시작",["season-end"]:"시즌 결산",draft:"드래프트",["role-change"]:"역할 변경",["team-change"]:"소속·등록 변경",["ability-change"]:"능력 변화",contract:"계약 검토"}[r.reason]}</option>)}</select></label>}
    <p className="evaluation-live-condition">오늘의 몸 상태 ({view.state.date}) · 피로 {scoreText(view.player.fatigue)} · {view.player.professional?.employment==="retired"?"은퇴":view.player.injury&&view.state.date<view.player.injury.unavailableUntil?`${view.player.injury.unavailableUntil} 복귀 예정`:view.player.forcedRest?"강제 휴식":"활동 상태 확인"}</p><PlayerEvaluationContent report={report} parameters={parameters}/></div></dialog>;
}
export default function PlayerEvaluationButton({state,player=state.players.find(p=>p.id===state.playerId)!}:{state:GameState;player?:Player}){
  const [view,setView]=useState<View|null>(null),[error,setError]=useState("");
  if(state.careerMode==="college")return null;
  return <><button type="button" className="text-button evaluation-open" onClick={()=>{try{setView({state,player,report:playerEvaluationFor(state,player)});setError("");}catch(e){setError(e instanceof Error?e.message:"평가를 불러오지 못했습니다.");}}}>선수 평가 ↗</button>{error&&<span role="alert">{error}</span>}{view&&<EvaluationDialog view={view} onClose={()=>setView(null)}/>}</>;
}
