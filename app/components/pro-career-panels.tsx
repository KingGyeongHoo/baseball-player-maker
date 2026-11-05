import {useState} from "react";
import {overall,getPlayer,params,positionLabel,positions} from "../../lib/sim/engine";
import {ageEfficiency} from "../../lib/sim/pro-growth";
import {clubName,BASE_SALARY} from "../../lib/sim/pro-world";
import {clubCost} from "../../lib/sim/pro-market";
import type {ProAction} from "../../lib/sim/pro-season";
import type {GameState,Position} from "../../lib/sim/types";
import {statKeys} from "../../lib/sim/types";
import {labels} from "../../lib/sim/engine";
import {scoreText} from "../../lib/display";
import {formatInnings} from "../../lib/player-records";

export const salaryText=(n:number)=>`${Math.trunc(n/10_000).toLocaleString()}만 원`;
function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="panel"><div className="panel-heading"><h2>{title}</h2></div><div className="career-panel-body">{children}</div></section>;}
export function ProGoals({state,onAction,disabled}:{state:GameState;onAction:(a:ProAction)=>void;disabled:boolean}){
  const p=getPlayer(state),w=state.proWorld,pro=p.professional;if(!w||!pro)return null;
  return <section className="pro-goals"><div><span className="eyebrow">NEXT STEP</span><h3>{w.customGoal??w.goal}</h3><p>{w.longGoal}</p></div><div><b>프로 {Math.max(1,w.year-pro.rookieYear+1)}년차 · 성장 기준 {Math.trunc(ageEfficiency(p)*100)}%</b><p>{pro.faEligible?"FA 자격 취득":`FA 공헌일 ${pro.faDays}/900일 · 올해 ${pro.registration.days}/150일`}</p><p>{pro.contract?`${clubName(state,pro.contract.club)} · ${pro.contract.endYear}년까지 · ${salaryText(pro.contract.salary)}`:"무소속 · 성장 60% · 무소속 2시즌 종료 시 커리어 마무리"}</p></div>
    <label className="pro-goal-select">관심 목표<select disabled={disabled} value={w.customGoal??""} onChange={e=>onAction({type:"goal",goal:e.target.value})}><option value="">현재 단계의 기본 목표</option>{["정식 선수 전환","1군 승격","꾸준한 1군 출전","프로 투타 겸업","타이틀과 우승","FA와 좋은 계약","몸 관리와 통산 기록"].map(goal=><option key={goal}>{goal}</option>)}</select></label>
  </section>;
}
export function ProContractPanel({state,onAction,onRetire,disabled}:{state:GameState;onAction:(a:ProAction)=>void;onRetire:()=>void;disabled:boolean}){
  const p=getPlayer(state),w=state.proWorld,pro=p.professional;if(!w||!pro)return null;
  const market=w.market,contract=pro.contract,closed=w.seasonClosed;
  return <Panel title="계약과 다음 시즌"><div className="contract-current"><div><span>현재 계약</span><h3>{contract?clubName(state,contract.club):"무소속"}</h3><p>{contract?`${contract.startYear}~${contract.endYear} · 연봉 ${salaryText(contract.salary)}`:"새 구단에서 기회를 찾거나 개인 훈련으로 다음 시장을 준비할 수 있습니다."}</p></div><div><span>커리어 수령액</span><b>{salaryText(pro.earnings)}</b><p>최고 연봉 {salaryText(pro.highestSalary)}</p></div></div>
    <p className="micro muted">예상 역할은 구단의 계획이며 출전 보장이 아닙니다. 연봉은 가치·성취 지표이며 성장 배율을 추가하지 않습니다.</p>
    {market&&!market.settled&&<><h3>{market.kind==="renewal"?"원소속 구단 갱신 협상":market.kind==="fa"?"FA 계약 시장":"새 구단 제안"} · {market.round+1}/3차</h3>
      <div className="contract-offers">{market.offers.map(offer=><article key={offer.id}><span className="eyebrow">{offer.kind==="renewal"?"RENEWAL":"NEW OPPORTUNITY"}</span><h3>{clubName(state,offer.club)}</h3><strong>{salaryText(offer.salary)} <small>/ 연</small></strong><p>{offer.year}년부터 {offer.years}시즌 · 총 {salaryText(offer.salary*offer.years)}</p><p>{offer.role}</p><p>경쟁자: {offer.competition.join(" · ")||"새 역할 경쟁"}</p><p>구단 방향: {directionText(state.proWorld!.clubs[offer.club].direction)}</p><div className="modal-actions"><button className="primary" disabled={disabled} onClick={()=>onAction({type:"accept",id:offer.id})}>조건 수락</button><button className="secondary" disabled={disabled||offer.negotiated} onClick={()=>onAction({type:"negotiate",id:offer.id})}>{offer.negotiated?"최종안":"재협상 1회"}</button></div></article>)}</div>
      {!market.offers.length&&<p>현재 조건에 맞는 제안이 없습니다. 기다려도 다음 제안이 보장되지는 않습니다.</p>}
      <div className="modal-actions">{market.kind!=="renewal"&&<><button className="secondary" disabled={disabled||market.round>=2} onClick={()=>onAction({type:"wait"})}>다음 제안 시점 기다리기</button><button className="secondary" disabled={disabled} onClick={()=>onAction({type:"unattached"})}>무소속으로 한 시즌 준비</button></>}
        {market.kind==="renewal"&&<><button className="secondary" disabled={disabled} onClick={()=>onAction({type:"request",kind:"trade"})}>이적 검토 요청</button><button className="secondary" disabled={disabled} onClick={()=>onAction({type:"request",kind:"release"})}>구단에 계약 해제 요청</button></>}
      </div><p className="micro muted">FA 전에는 계약 만료만으로 자유계약 시장에 나가지 않습니다. 요청에는 구단 동의가 필요하며 반복 요청은 4주 간격입니다.</p></>}
    {closed&&w.stage!=="retired"&&<div className="modal-actions">{!market?<button className="primary" disabled={disabled} onClick={()=>onAction({type:"market"})}>다음 시즌 계약 검토 →</button>:market.settled&&<button className="primary" disabled={disabled} onClick={()=>onAction({type:"nextSeason"})}>다음 시즌 캠프 시작 →</button>}<button className="secondary" disabled={disabled} onClick={onRetire}>은퇴 검토</button></div>}
    {pro.salaries.length>0&&<details className="career-pay-history"><summary>연도별 수령액</summary><div className="table-scroll"><table><thead><tr><th>연도</th><th>구단</th><th>수령액</th></tr></thead><tbody>{pro.salaries.map((row,i)=><tr key={i}><td>{row.year}</td><td>{clubName(state,row.club)}</td><td>{salaryText(row.amount)}</td></tr>)}</tbody></table></div></details>}
  </Panel>;
}
const directionText=(direction:string)=>direction==="contend"?"우승 경쟁":direction==="rebuild"?"재건":"중위권 보강";
export function ProRequests({state,onAction,disabled}:{state:GameState;onAction:(a:ProAction)=>void;disabled:boolean}){
  const [position,setPosition]=useState<Position>(getPlayer(state).position),p=getPlayer(state),pro=p.professional;
  if(!state.proWorld||!pro)return null;
  return <Panel title="보직과 기회 요청"><p>요청은 기회를 검토하는 과정입니다. 실제 출전·보직·이적은 구단 수요와 컨디션을 함께 봅니다.</p><p className="micro muted">다음 요청 가능일: {pro.requestAfter??"지금"} · 요청 간격 4주</p><fieldset className="content-lock" disabled={disabled||pro.employment!=="active"||!!pro.requestAfter&&state.date<pro.requestAfter}><div className="modal-actions"><button className="secondary" onClick={()=>onAction({type:"request",kind:"chance"})}>현재 보직에서 기회 요청</button><button className="secondary" onClick={()=>onAction({type:"request",kind:"manage"})}>14일 몸 관리 우선</button><button className="secondary" onClick={()=>onAction({type:"request",kind:"trade"})}>다른 구단의 기회 요청</button></div><div className="pro-position-request"><select aria-label="평가할 새 보직" value={position} onChange={e=>setPosition(e.target.value as Position)}>{Object.entries(positions).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select><button className="secondary" onClick={()=>onAction({type:"request",kind:"position",position})}>2주 보직 평가 요청</button></div></fieldset><p className="micro muted">대타·대수비·대주자 전용 계약은 현재 제공하지 않습니다. 실제 가능한 수비·투구 자격으로 평가합니다.</p></Panel>;
}
export function ProTwoWayStatus({state}:{state:GameState}){
  const p=getPlayer(state),review=p.professional?.twoWayReview;if(!review)return null;
  return <Panel title={p.twoWay?"프로 투타 겸업":"프로 겸업 도전"}><p>{p.twoWay?`현재 ${positionLabel(p)} · 대표 OVR은 투수·타자 평균입니다.`:`현재 ${positionLabel(p)}에 집중합니다. 두 분야의 능력과 고교 기록은 유지됩니다.`}</p>
    <p>{p.twoWay?`유지 기준: 양쪽 OVR ${params["pro.two_way_maintain"]} 이상 · 미달 지속 ${Math.min(28,review.belowDays)}/28일`:`제안 기준: 양쪽 OVR ${params["pro.two_way_entry"]} 이상 연속 28일 · 현재 ${Math.min(28,review.qualifiedDays)}/28일`}</p>
    <p className="micro muted">기본 능력으로 평가합니다. 투구·타격 출전은 각각 경쟁과 컨디션을 반영하며, 양쪽 출전 주에는 추가 피로가 쌓입니다.</p>
    {!p.twoWay&&review.nextProposalDate&&state.date<review.nextProposalDate&&<p className="micro muted">다음 겸업 제안 검토: {review.nextProposalDate} 이후</p>}
    <div className="pro-transactions">{p.professional?.twoWayHistory?.map((row,i)=><div key={i}><time>{row.date}</time><b>{row.action}</b><p>{row.reason}</p></div>)}</div></Panel>;
}
export function ProSeasonReview({state}:{state:GameState}){
  const w=state.proWorld;if(!w)return null;const last=w.seasons.at(-1),mine=last?.awards.filter(a=>a.playerId===state.playerId)??[];
  return <Panel title={w.seasonClosed?`${w.year} 시즌 결산`:`${w.year} 리그 현황`}>
    {last&&w.seasonClosed&&<><h3>{clubName(state,last.champion)} 우승</h3><p>{mine.length?`나의 수상: ${mine.map(a=>a.kind).join(" · ")}`:"이번 시즌의 기록과 도전도 커리어에 남습니다."}</p><div className="table-scroll"><table><thead><tr><th>개인상</th><th>선수</th><th>구단</th></tr></thead><tbody>{last.awards.map((a,i)=><tr key={i}><td>{a.kind}</td><td>{a.playerName}</td><td>{clubName(state,a.club)}</td></tr>)}</tbody></table></div></>}
    {w.postseason&&<div className="pro-series-list">{w.postseason.series.map(series=><div key={series.id}><b>{series.stage==="semi"?"준결승":"결승"}</b><span>{clubName(state,series.clubs[0])} {series.wins[0]} : {series.wins[1]} {clubName(state,series.clubs[1])}</span><small>{series.winner!==undefined?`${clubName(state,series.winner)} 승리`:"진행 중"}</small></div>)}</div>}
    <p className="micro muted">정규·2군·포스트시즌 기록은 분리됩니다. 타율·ERA는 규정 타석·이닝을 적용하며, 수상·우승만으로 능력치를 지급하지 않습니다.</p>
  </Panel>;
}
export function ProLeagueArchive({state}:{state:GameState}){
  const w=state.proWorld;if(!w)return null;
  return <><Panel title="구단 방향과 선수 비용"><div className="table-scroll"><table><thead><tr><th>구단</th><th>방향</th><th>1군</th><th>2군</th><th>예산</th><th>선수 비용</th></tr></thead><tbody>{w.clubs.map(club=><tr key={club.id}><td>{clubName(state,club.id)}</td><td>{directionText(club.direction)}</td><td>{state.players.filter(p=>p.teamId===club.id).length}/30</td><td>{state.players.filter(p=>p.teamId===club.id+10).length}/45</td><td>{salaryText(club.budget)}</td><td>{salaryText(clubCost(state,club.id,w.market?.year??w.year))}</td></tr>)}</tbody></table></div><p className="micro muted">기본 정식 신인 연봉 B={salaryText(BASE_SALARY)} · 미래 보장액과 방출 잔여 비용도 계약 예산에 반영합니다.</p></Panel>
    <Panel title="리그의 발자취"><div className="pro-history-seasons">{w.seasons.map(season=><details key={season.year}><summary>{season.year} · {clubName(state,season.champion)} 우승 · 신인 {season.draft.length}명</summary><div className="table-scroll"><table><thead><tr><th>개인상</th><th>선수</th></tr></thead><tbody>{season.awards.map((award,i)=><tr key={i}><td>{award.kind}</td><td>{award.playerName}</td></tr>)}</tbody></table></div><p>{season.draft.slice(0,10).map(p=>`${p.overall}순위 ${p.playerName}(${p.club})`).join(" · ")}</p></details>)}</div><p>보관한 은퇴 선수 {w.archive.length}명 · 같은 ID와 연도별 기록을 유지합니다.</p></Panel>
    <Panel title="리그 소식"><div className="pro-news-list">{w.news.slice(-60).reverse().map(n=><div key={n.id}><time>{n.date}</time><p>{n.text}</p></div>)}</div></Panel></>;
}
export function ProRetirement({state,onRecords,onNew}:{state:GameState;onRecords:()=>void;onNew:()=>void}){
  const p=getPlayer(state),w=state.proWorld!,pro=p.professional!,retired=w.retired;if(!retired)return null;
  const entry=p.career.filter(row=>row.careerMode!=="pro").at(-1)?.stats??p.initialStats;
  const first=p.career.filter(r=>r.careerMode==="pro").reduce((n,r)=>n+(r.byLevel?.first.batting.PA??0),0),outs=p.career.filter(r=>r.careerMode==="pro").reduce((n,r)=>n+(r.byLevel?.first.pitching.outs??0),0),pick=state.draft.find(d=>d.playerId===p.id);
  return <div className="pro-retirement"><section className="draft-reveal-panel panel"><span className="eyebrow">MY BASEBALL CAREER</span><h1>{p.name}, 나의 야구 이야기.</h1><p>{retired.summary}</p><p>{retired.reason}</p><div className="modal-actions"><button className="primary" onClick={onRecords}>연도별·리그별 기록 보기</button><button className="secondary" onClick={onNew}>새 선수 만들기</button></div><p className="micro muted">이 커리어는 저장함에 남습니다. 새 선수 생성이 보관 기록을 삭제하지 않습니다.</p></section>
    <Panel title="출발과 전환점"><p>{state.postSchool?.graduationSchool} · {pick?`${pick.round}라운드 ${pick.club}`:"신고선수 입단"} · 최초 {clubName(state,pro.firstClub)}</p><p>{positionLabel(p)} · 최고 OVR {scoreText(overall({...p,stats:pro.peak}))}</p><p>1군 통산 {first}타석 · {formatInnings(outs)}이닝</p><p>누적 수령액 {salaryText(pro.earnings)} · 최고 연봉 {salaryText(pro.highestSalary)}</p>{retired.forfeited>0&&<p>자발적 은퇴로 포기한 미래 급여 {salaryText(retired.forfeited)}</p>}<div className="pro-transactions">{Object.entries(pro.firsts).map(([key,date])=><div key={key}><time>{date}</time><b>{{debut:"첫 1군 출전",start:"첫 선발 출전",hit:"첫 안타",homeRun:"첫 홈런",strikeout:"첫 탈삼진"}[key]??key}</b></div>)}{pro.movements.map((m,i)=><div key={`move-${i}`}><time>{m.date}</time><b>{m.kind} · {clubName(state,m.from)} → {clubName(state,m.to)}</b><p>{m.reason}</p></div>)}</div></Panel>
    <ProTwoWayStatus state={state}/><Panel title="성장의 기록"><div className="table-scroll"><table><thead><tr><th>능력</th><th>입학</th><th>입단</th><th>커리어 최고</th><th>은퇴</th></tr></thead><tbody>{statKeys.map(key=><tr key={key}><td>{labels[key]}</td><td>{scoreText(p.initialStats[key])}</td><td>{scoreText(entry[key])}</td><td>{scoreText(pro.peak[key])}</td><td>{scoreText(p.stats[key])}</td></tr>)}</tbody></table></div></Panel>
    <Panel title="우승과 수상">{w.seasons.flatMap(season=>[...(season.champion!==null&&pro.service.some(stint=>stint.club===season.champion&&stint.from<=season.year&&stint.to>=season.year)?[`${season.year} ${clubName(state,season.champion)} 우승`]:[]),...season.awards.filter(a=>a.playerId===p.id).map(a=>`${a.year} ${a.kind}`)]).map((text,i)=><p key={i}>{text}</p>)}</Panel>
  </div>;
}
