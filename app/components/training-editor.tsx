import { addDays, fatigueForecast, labels, policyForMode, ticketsUsed, trainingLoad, validPolicy } from "../../lib/sim/engine";
import { scoreText } from "../../lib/display";
import type { GameState, Player, Policy, Ticket } from "../../lib/sim/types";

export const trainingLabel = (policy:Policy) => policy.mode==="rest" || ticketsUsed(policy)===0 ? "회복 중심" : "훈련 배분";
const groups:{id:string;label:string;keys:Ticket[]}[]=[
  {id:"pitching",label:"투수 능력치",keys:["velocity","control","movement"]},
  {id:"batting",label:"타자 능력치",keys:["contact","power","speed","defense"]},
  {id:"physical",label:"공통 피지컬",keys:["physical"]},
];
const symbols:Record<Ticket,string>={velocity:"V",control:"K",movement:"M",contact:"C",power:"P",speed:"S",defense:"D",physical:"PH"};
const amount=(n:number)=>Math.abs(n)>0&&Math.abs(n)<1?"1 미만":scoreText(Math.abs(n));
const deltaText=(n:number)=>Math.abs(n)<1e-9?"피로 유지":n<0?"피로 회복 "+amount(n):"피로 쌓임 "+amount(n);

export default function TrainingEditor({player,policy,setPolicy,date,context}:{player:Player;policy:Policy;setPolicy:(p:Policy)=>void;date?:string;context?:Pick<GameState,"calendar"|"report">}){
  const used=policy.mode==="rest"?0:ticketsUsed(policy),load=trainingLoad(player.stats.recovery,policy),forecast=fatigueForecast(player,policy,date);
  const training=used>0,previous=policy.mode==="rest"?policy.previousTraining:undefined;
  const update=(tickets:Policy["tickets"])=>setPolicy({mode:"normal",tickets});
  const tone=load.weeklyDelta<0?"recovery":load.weeklyDelta>0?"accumulation":"neutral";
  const scheduled=date?context?.calendar.events.filter(game=>game.status==="scheduled"&&game.date>=date&&game.date<=addDays(date,6)&&[game.homeTeamId,game.awayTeamId].includes(player.teamId)).length??0:0;
  const report=context?.report,actual=report?.fatigue;
  return <>
    {policy.mode==="rest"&&<div className="recovery-return"><div><b>이전 휴식 설정을 유지하고 있습니다.</b><p>배분을 추가하면 훈련을 시작합니다. 전체 0은 회복에 집중합니다.</p></div>{previous&&<button className="secondary" onClick={()=>{const restored=policyForMode(policy,previous.mode);if(validPolicy(restored))setPolicy({...restored,mode:"normal"});}}>이전 배분 복원</button>}</div>}
    <section className="ticket-summary training-load-summary" aria-label="훈련과 회복 균형">
      <div className="ticket-summary-main"><div className="ticket-remaining"><span>현재 배분</span><strong>{used}<small>개</small></strong></div><div className="ticket-allocation"><b>항목마다 0~5 · 자유롭게 투자</b><span>회복력 {scoreText(player.stats.recovery)} · 훈련 부하 {scoreText(load.loadRatio*100)}%</span><span>유지 경계 · 부하 {scoreText(load.neutralRatio*100)}%</span></div></div>
      <button className="ticket-reset" disabled={used===0} onClick={()=>update(Object.fromEntries(Object.keys(policy.tickets).map(k=>[k,0])) as Policy["tickets"])}>모두 0으로</button>
      <div className={"load-current "+tone} role="status" aria-live="polite" aria-atomic="true"><strong>훈련 기준 · {deltaText(load.weeklyDelta)}</strong><span>훈련·회복만 반영 · 1주 기준</span></div>
      <div className="load-gauge">
        <div className="load-spectrum" role="meter" aria-label="훈련 피로와 회복 균형" aria-valuemin={0} aria-valuemax={100} aria-valuenow={load.marker} aria-valuetext={deltaText(load.weeklyDelta)} data-load-marker={load.marker}>
          <span className="load-neutral" aria-hidden="true"/><span className="load-marker" style={{left:load.marker+"%"}} aria-hidden="true"/>
        </div>
        <div className="load-axis"><div><b>피로 회복</b><span>최대 −{scoreText(load.maxRecovery)} / 주</span></div><div><b>유지</b><span>0</span></div><div><b>피로 쌓임</b><span>최대 +{scoreText(load.maxAccumulation)} / 주</span></div></div>
      </div>
    </section>
    {scheduled>0&&<div className="training-match-note" role="note"><b>이번 주 예정 {scheduled}경기 · 경기 피로는 별도</b><p>훈련에서 회복해도 경기 출전 피로가 더 크면 전체 피로는 늘 수 있습니다.</p></div>}
    {report&&actual&&<section className="training-actual-fatigue" aria-label="최근 진행의 실제 피로"><b>최근 실제 피로 {scoreText(report.fatigueBefore)} → {scoreText(report.fatigueAfter)}</b><strong>{deltaText(report.fatigueAfter-report.fatigueBefore)}</strong><p>훈련 +{amount(actual.training)} · 경기 +{amount(actual.game)} · 회복 −{amount(actual.recovered)}{Math.abs(actual.events??0)>1e-9&&<> · 이벤트 {(actual.events??0)>0?"+":"−"}{amount(actual.events??0)}</>}</p><small>{report.from} ~ {report.to} · 실제 반영된 합계입니다.</small></section>}
    <p className="training-mode-note">훈련에 참가하면 투수·타자 능력 모두 기본 성장합니다. 투자한 항목은 추가로 성장하며, 많이 투자할수록 피로가 쌓입니다.</p>
    <p className="training-mode-note">타격 4항목과 투구 3항목을 모두 같은 단계로 훈련하면 피로 부담이 같습니다. 성장량은 항목별 투자에 따라 적용됩니다.</p>
    <div className="training-rows">{groups.map(group=><section className={"training-group "+group.id} key={group.id} aria-label={group.label}>
      <div className="training-group-heading"><h3>{group.label}</h3><span>{group.keys.reduce((sum,key)=>sum+policy.tickets[key],0)}개 투자</span></div>
      {group.keys.map(key=>{
        const stat=key==="physical"?(player.stats.stamina+player.stats.recovery+player.stats.arm)/3:player.stats[key];
        return <div className="training-row" key={key}>
          <span className="training-symbol">{symbols[key]}</span><div className="training-label"><b>{labels[key]}</b><small>{scoreText(stat)}</small><small className="training-growth-hint">{training?key==="physical"?policy.tickets.physical>0?"피지컬 집중 성장":"투자해 주세요":<>기본 성장{policy.tickets[key]>0&&<span>집중 성장</span>}</>:"회복에 집중"}</small></div>
          <div className="ticket-dots" aria-hidden="true">{Array.from({length:5},(_,i)=><i className={i<policy.tickets[key]?"filled":""} key={i}/>)}</div>
          <div className="stepper"><button aria-label={labels[key]+" 티켓 감소"} disabled={!policy.tickets[key]} onClick={()=>update({...policy.tickets,[key]:policy.tickets[key]-1})}>−</button><output aria-label={labels[key]+" 티켓"}>{policy.tickets[key]}</output>
            <button aria-label={labels[key]+" 티켓 증가"} disabled={policy.tickets[key]>=5} onClick={()=>{if(policy.tickets[key]<5)update({...policy.tickets,[key]:policy.tickets[key]+1});}}>+</button>
          </div>
        </div>;
      })}
    </section>)}</div>
    {!validPolicy(policy)&&<p className="error" role="alert">각 항목을 정수 0~5로 설정해 주세요.</p>}
    {!training&&<p className="training-mode-note">전체 0은 훈련 성장 없이 회복에 집중합니다. 경기 출전으로 생기는 피로는 별도로 반영됩니다.</p>}
    <div className="fatigue-forecast"><p className="forecast-result">훈련만 반영한 예상 피로 <b>{scoreText(forecast.end)}</b><span>현재 {scoreText(player.fatigue)} · 예상 {deltaText(forecast.end-player.fatigue)}</span></p>
      <p className="micro muted training-note">경기가 없는 훈련 주간 기준입니다. 실제 피로는 0~100 범위이며 경기·이벤트가 추가 반영됩니다. 부상·강제 휴식일은 0개 배분 기준으로 회복합니다.</p>
    </div>
    <p className="micro muted training-note">성장은 소수 단위로 누적되고 점수는 정수 부분만 표시합니다. 피지컬 성장은 스태미나·회복력·어깨로 나뉩니다.</p>
  </>;
}
