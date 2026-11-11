import ProAssessments from "./pro-assessments";
import {getPlayer} from "../../lib/sim/engine";
import {ageEfficiency,agingProfile} from "../../lib/sim/pro-growth";
import {clubName} from "../../lib/sim/pro-world";
import {canEnterNextProCamp,type ProAction} from "../../lib/sim/pro-season";
import type {GameState} from "../../lib/sim/types";
export {default as ProRetirement} from "./pro-retirement-dashboard";

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
      {market.kind==="fa"&&<p className="micro muted">{market.retentionOnly?"타 구단의 FA 제안이 없습니다. 원소속팀의 1년 최저 연봉 계약을 수락하거나 은퇴를 선택해 주세요.":"원소속 구단에 잔류하거나 다른 구단으로 이적하는 FA 계약을 선택할 수 있습니다."}</p>}
      <div className="contract-offers">{market.offers.map(offer=>{const staying=offer.kind==="fa"&&(offer.faRetention??(pro.employment==="active"&&offer.club===pro.contract?.club));return <article key={offer.id}>{offer.kind==="fa"&&<span className="eyebrow">{offer.lastChance?"원소속팀의 마지막 제안":staying?"원소속팀 FA 잔류 제안":"타 구단 FA 이적 제안"}</span>}<h3>{clubName(state,offer.club)}</h3><strong>{salaryText(offer.salary)} <small>/ 연</small></strong><p>{offer.year}년부터 {offer.years}시즌{offer.lastChance?" · 최저 연봉 · 재협상 불가":""}</p><div className="modal-actions"><button className="primary" disabled={disabled} onClick={()=>onAction({type:"accept",id:offer.id})}>{staying?"원소속팀 잔류":offer.kind==="fa"?"이적 계약 수락":"조건 수락"}</button>{!offer.lastChance&&<button className="secondary" disabled={disabled||offer.negotiated} onClick={()=>onAction({type:"negotiate",id:offer.id})}>{offer.negotiated?"최종안":"재협상 1회"}</button>}{offer.lastChance&&<button className="secondary" disabled={disabled} onClick={onRetire}>은퇴 선택</button>}</div></article>;})}</div>
      {!market.offers.length&&<p>현재 조건에 맞는 제안이 없습니다. 기다려도 다음 제안이 보장되지는 않습니다.</p>}
      <div className="modal-actions">{market.kind!=="renewal"&&!market.retentionOnly&&stove?.closed&&<button className="secondary" disabled={disabled} onClick={()=>onAction({type:"unattached"})}>무소속으로 다음 시즌 준비</button>}
        {market.kind==="renewal"&&<><button className="secondary" disabled={disabled} onClick={()=>onAction({type:"request",kind:"trade"})}>이적 검토 요청</button><button className="secondary" disabled={disabled} onClick={()=>onAction({type:"request",kind:"release"})}>구단에 계약 해제 요청</button></>}
      </div><p className="micro muted">FA 전에는 계약 만료만으로 자유계약 시장에 나가지 않습니다. 요청에는 구단 동의가 필요하며 반복 요청은 4주 간격입니다.</p></>}
    {closed&&w.stage!=="retired"&&<div className="modal-actions">{campReady&&<button className="primary" disabled={disabled} onClick={()=>onAction({type:"nextSeason"})}>다음 캠프로 바로 가기 →</button>}{!stove?<button className={campReady?"secondary":"primary"} disabled={disabled} onClick={()=>onAction({type:"market"})}>스토브리그 시작 →</button>:!stove.closed&&(!market?.retentionOnly||market.settled)&&<button className={campReady?"secondary":"primary"} disabled={disabled} onClick={()=>onAction({type:"wait"})}>다음 주 스토브리그 →</button>}{(!market?.retentionOnly||market.settled)&&<button className="secondary" disabled={disabled} onClick={onRetire}>은퇴 검토</button>}</div>}
    {stove&&<details className="career-pay-history"><summary>스토브리그 소식</summary><div className="pro-transactions">{w.news.filter(row=>row.date>=stove.openedAt).slice(-12).reverse().map(row=><div key={row.id}><time>{row.date}</time><p>{row.text}</p></div>)}</div></details>}
  </Panel>;
}
