import ProAssessments from "./pro-assessments";
import {overall,getPlayer,positionLabel} from "../../lib/sim/engine";
import {ageEfficiency,agingProfile} from "../../lib/sim/pro-growth";
import {clubName} from "../../lib/sim/pro-world";
import {canEnterNextProCamp,type ProAction} from "../../lib/sim/pro-season";
import type {GameState} from "../../lib/sim/types";
import {statKeys} from "../../lib/sim/types";
import {labels} from "../../lib/sim/engine";
import {scoreText} from "../../lib/display";
import {formatInnings} from "../../lib/player-records";

export const salaryText=(n:number)=>`${Math.trunc(n/10_000).toLocaleString()}만 원`;
export function ProAllstarHonors({state}:{state:GameState}){
  const history=getPlayer(state).professional?.allstarHistory;if(!history?.length)return null;
  return <section className="panel"><div className="panel-heading"><h2>올스타 기록</h2></div><div className="table-scroll"><table><thead><tr><th>시즌</th><th>리그</th><th>진영</th><th>선발</th><th>결과</th></tr></thead><tbody>{history.map(row=><tr key={row.year}><td>{row.year}</td><td>{row.level==="first"?"1군":"2군"}</td><td>{row.side==="blue"?"BLUE":"WHITE"}</td><td>{row.method==="vote"?"투표":row.method==="manager"?"감독 추천":"대체 선발"}</td><td>{row.mvp?"미스터 올스타":row.withdrawn?"부상·출전 불가":row.participated?"출전":"선발"}</td></tr>)}</tbody></table></div></section>;
}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="panel"><div className="panel-heading"><h2>{title}</h2></div><div className="career-panel-body">{children}</div></section>;}
export function ProGoals({state,onAction,disabled}:{state:GameState;onAction:(a:ProAction)=>void;disabled:boolean}){
  const p=getPlayer(state),w=state.proWorld,pro=p.professional;if(!w||!pro)return null;
  const curve=agingProfile(p);
  return <section className="pro-goals"><div><span className="eyebrow">NEXT STEP</span><h3>{w.customGoal??w.goal}</h3><p>{w.longGoal}</p></div><div><b>프로 {Math.max(1,w.year-pro.rookieYear+1)}년차 · 기술 성장 기준 {Math.trunc(ageEfficiency(p)*100)}%</b><p>신체 전성기 {curve.peakStart}~{curve.declineStart}세 · {curve.declineStart}세부터 완만한 하락</p><p>{pro.faEligible?"FA 자격 취득":`FA 공헌일 ${pro.faDays}/900일 · 올해 ${pro.registration.days}/150일`}</p></div>
    <label className="pro-goal-select">관심 목표<select disabled={disabled} value={w.customGoal??""} onChange={e=>onAction({type:"goal",goal:e.target.value})}><option value="">현재 단계의 기본 목표</option>{["정식 선수 전환","1군 승격","꾸준한 1군 출전","타이틀과 우승","FA와 좋은 계약","몸 관리와 통산 기록"].map(goal=><option key={goal}>{goal}</option>)}</select></label>
  </section>;
}
export function ProContractPanel({state,onAction,onRetire,disabled}:{state:GameState;onAction:(a:ProAction)=>void;onRetire:()=>void;disabled:boolean}){
  const p=getPlayer(state),w=state.proWorld,pro=p.professional;if(!w||!pro)return null;
  const market=w.market,closed=w.seasonClosed,stove=w.stove,campReady=canEnterNextProCamp(state);
  return <Panel title="계약과 시즌 평가">
    <ProAssessments state={state}/>
    {stove&&<div className="info-box"><b>{stove.closed?"스토브리그 마감 · 1월 계약 마무리":"스토브리그 진행 중"}</b><p>{state.date} · {stove.openedAt}~{stove.closesAt} · {stove.round+1}차</p><p>{stove.closed?"최종 제안을 결정한 뒤 2월 1일 스프링캠프로 이동합니다. 정규리그는 3월 말 개막합니다.":`다음 시장 갱신 ${stove.nextUpdate} · 매주 FA·트레이드·방출 소식과 계약 제안을 확인하세요.`}</p>{campReady&&<p>내 계약은 확정됐습니다. 남은 스토브리그를 자동으로 진행하고 다음 캠프로 바로 이동할 수 있습니다.</p>}</div>}
    {market&&!market.settled&&<><h3>{market.kind==="renewal"?"원소속 구단 갱신 협상":market.kind==="fa"?"FA 계약 시장":"새 구단 제안"} · {market.round+1}차</h3>
      {market.kind==="fa"&&<p className="micro muted">원소속 구단에 잔류하거나 다른 구단으로 이적하는 FA 계약을 선택할 수 있습니다.</p>}
      <div className="contract-offers">{market.offers.map(offer=>{const staying=offer.kind==="fa"&&(offer.faRetention??(pro.employment==="active"&&offer.club===pro.contract?.club));return <article key={offer.id}>{offer.kind==="fa"&&<span className="eyebrow">{staying?"원소속팀 FA 잔류 제안":"타 구단 FA 이적 제안"}</span>}<h3>{clubName(state,offer.club)}</h3><strong>{salaryText(offer.salary)} <small>/ 연</small></strong><p>{offer.year}년부터 {offer.years}시즌</p><div className="modal-actions"><button className="primary" disabled={disabled} onClick={()=>onAction({type:"accept",id:offer.id})}>{staying?"원소속팀 잔류":offer.kind==="fa"?"이적 계약 수락":"조건 수락"}</button><button className="secondary" disabled={disabled||offer.negotiated} onClick={()=>onAction({type:"negotiate",id:offer.id})}>{offer.negotiated?"최종안":"재협상 1회"}</button></div></article>;})}</div>
      {!market.offers.length&&<p>현재 조건에 맞는 제안이 없습니다. 기다려도 다음 제안이 보장되지는 않습니다.</p>}
      <div className="modal-actions">{market.kind!=="renewal"&&stove?.closed&&<button className="secondary" disabled={disabled} onClick={()=>onAction({type:"unattached"})}>무소속으로 다음 시즌 준비</button>}
        {market.kind==="renewal"&&<><button className="secondary" disabled={disabled} onClick={()=>onAction({type:"request",kind:"trade"})}>이적 검토 요청</button><button className="secondary" disabled={disabled} onClick={()=>onAction({type:"request",kind:"release"})}>구단에 계약 해제 요청</button></>}
      </div><p className="micro muted">FA 전에는 계약 만료만으로 자유계약 시장에 나가지 않습니다. 요청에는 구단 동의가 필요하며 반복 요청은 4주 간격입니다.</p></>}
    {closed&&w.stage!=="retired"&&<div className="modal-actions">{campReady&&<button className="primary" disabled={disabled} onClick={()=>onAction({type:"nextSeason"})}>다음 캠프로 바로 가기 →</button>}{!stove?<button className={campReady?"secondary":"primary"} disabled={disabled} onClick={()=>onAction({type:"market"})}>스토브리그 시작 →</button>:!stove.closed&&<button className={campReady?"secondary":"primary"} disabled={disabled} onClick={()=>onAction({type:"wait"})}>다음 주 스토브리그 →</button>}<button className="secondary" disabled={disabled} onClick={onRetire}>은퇴 검토</button></div>}
    {stove&&<details className="career-pay-history"><summary>스토브리그 소식</summary><div className="pro-transactions">{w.news.filter(row=>row.date>=stove.openedAt).slice(-12).reverse().map(row=><div key={row.id}><time>{row.date}</time><p>{row.text}</p></div>)}</div></details>}
  </Panel>;
}
export function ProRetirement({state,onRecords,onNew}:{state:GameState;onRecords:()=>void;onNew:()=>void}){
  const p=getPlayer(state),w=state.proWorld!,pro=p.professional!,retired=w.retired;if(!retired)return null;
  const entry=p.career.filter(row=>row.careerMode!=="pro").at(-1)?.stats??p.initialStats;
  const first=p.career.filter(r=>r.careerMode==="pro").reduce((n,r)=>n+(r.byLevel?.first.batting.PA??0),0),outs=p.career.filter(r=>r.careerMode==="pro").reduce((n,r)=>n+(r.byLevel?.first.pitching.outs??0),0),pick=state.draft.find(d=>d.playerId===p.id);
  return <div className="pro-retirement"><section className="draft-reveal-panel panel"><span className="eyebrow">MY BASEBALL CAREER</span><h1>{p.name}, 나의 야구 이야기.</h1><p>{retired.summary}</p><p>{retired.reason}</p><div className="modal-actions"><button className="primary" onClick={onRecords}>연도별·리그별 기록 보기</button><button className="secondary" onClick={onNew}>새 선수 만들기</button></div><p className="micro muted">이 커리어는 저장함에 남습니다. 새 선수 생성이 보관 기록을 삭제하지 않습니다.</p></section>
    <Panel title="출발과 전환점"><p>{state.postSchool?.graduationSchool} · {pro.entry==="direct"?"프로 직접 시작":pick?`${pick.round}라운드 ${pick.club}`:"신고선수 입단"} · 최초 {clubName(state,pro.firstClub)}</p><p>{positionLabel(p)} · 최고 OVR {scoreText(overall({...p,stats:pro.peak}))}</p><p>1군 통산 {first}타석 · {formatInnings(outs)}이닝</p><p>누적 수령액 {salaryText(pro.earnings)} · 최고 연봉 {salaryText(pro.highestSalary)}</p>{retired.forfeited>0&&<p>자발적 은퇴로 포기한 미래 급여 {salaryText(retired.forfeited)}</p>}<div className="pro-transactions">{Object.entries(pro.firsts).map(([key,date])=><div key={key}><time>{date}</time><b>{{debut:"첫 1군 출전",start:"첫 선발 출전",hit:"첫 안타",homeRun:"첫 홈런",strikeout:"첫 탈삼진"}[key]??key}</b></div>)}{pro.movements.map((m,i)=><div key={`move-${i}`}><time>{m.date}</time><b>{m.kind} · {clubName(state,m.from)} → {clubName(state,m.to)}</b><p>{m.reason}</p></div>)}</div></Panel>
    <Panel title="성장의 기록"><div className="table-scroll"><table><thead><tr><th>능력</th><th>입학</th><th>입단</th><th>커리어 최고</th><th>은퇴</th></tr></thead><tbody>{statKeys.map(key=><tr key={key}><td>{labels[key]}</td><td>{scoreText(p.initialStats[key])}</td><td>{scoreText(entry[key])}</td><td>{scoreText(pro.peak[key])}</td><td>{scoreText(p.stats[key])}</td></tr>)}</tbody></table></div></Panel>
    <Panel title="우승과 수상">{w.seasons.flatMap(season=>[...(season.champion!==null&&pro.service.some(stint=>stint.club===season.champion&&stint.from<=season.year&&stint.to>=season.year)?[`${season.year} ${clubName(state,season.champion)} 우승`]:[]),...season.awards.filter(a=>a.playerId===p.id).map(a=>`${a.year} ${a.kind}`)]).map((text,i)=><p key={i}>{text}</p>)}</Panel>
  </div>;
}
