import {getPlayer} from "../../lib/sim/engine";
import {careerContractSummary} from "../../lib/career-summary";
import {rosterGrade} from "../../lib/roster-grades";
import type {GameState} from "../../lib/sim/types";

const assessmentText=(value:number|null)=>value===null?"미평가":`${value.toFixed(1)} · ${rosterGrade(value,true)}`;
const salaryText=(value:number|null)=>value===null?"—":`${Math.trunc(value/10_000).toLocaleString()}만 원`;
const totalWar=(w:{batting:number;pitching:number;fielding:number;positional:number})=>(w.batting+w.pitching+w.fielding+w.positional).toFixed(2);
const squads={first:"1군",second:"2군",third:"3군",developmental:"육성선수"};
export default function ProAssessments({state}:{state:GameState}){
  const p=getPlayer(state),pro=p.professional,summary=careerContractSummary(state),rows=(pro?.assessments??[]).slice().sort((a,b)=>b.year-a.year);
  return <div className="compact-contract" aria-label="계약 요약과 시즌별 평가"><div className="compact-contract-metrics">
    <div><span>누적 평가</span><b>{assessmentText(summary.cumulative)}</b></div>
    <div><span>올해 예상 누적 평가</span><b>{assessmentText(summary.projected)}</b></div>
    <div><span>올해 시즌 출전평가{state.proWorld?.seasonClosed?"":" 예상"}</span><b>{assessmentText(summary.seasonScore)}</b></div>
    <div><span>남은 계약기간</span><b>{summary.seasons?`${summary.seasons}시즌`:pro?.contract?"계약 만료":"미계약"}</b></div>
    <div><span>연봉</span><b>{salaryText(summary.salary)}</b></div>
  </div>{rows.length>0&&<details className="contract-season-evaluations"><summary>시즌별 평가 · {rows.length}시즌</summary><div className="table-scroll"><table><thead><tr>{['시즌','출전평가','점수','연봉','최종 등록'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=>{
    const salary=row.salary!==undefined?row.salary:pro?.salaries.filter(item=>item.year===row.year).at(-1)?.salary??null;
    return <tr key={row.year}><th scope="row">{row.year}</th><td>{row.grade}</td><td>{row.score===null?'—':row.score.toFixed(1)}</td><td>{salaryText(salary)}</td><td>{row.squad?squads[row.squad]:'무소속'}</td></tr>;
  })}</tbody></table></div></details>}
  {summary.war&&<p className="micro muted">올해 WAR 환산 {summary.war.equivalentWins.toFixed(2)}승 → 출전평가 {summary.war.score.toFixed(1)}점. 타격·투구·수비·포지션 기여도를 반영합니다.</p>}
  {(summary.war||rows.some(row=>row.war))&&<details><summary>WAR와 출전평가 산정 내역</summary><p className="micro muted">경기 기록으로 계산한 게임용 WAR를 기존 점수·등급으로 환산합니다. 구원투수의 역할과 2군 수준을 보정하며 적은 출전을 풀 시즌으로 확대하지 않습니다. 능력치는 경기 결과와 선발·승격 판단에 사용합니다. 수비는 기록이 생긴 경기부터 반영하며 주루 세부 기여는 포함하지 않습니다.</p>{[
    ...(!rows.some(row=>row.year===state.calendar.seasonYear)&&summary.war?[{year:state.calendar.seasonYear,war:summary.war}]:[]),
    ...rows.flatMap(row=>row.war?[{year:row.year,war:row.war}]:[]),
  ].map(({year,war})=><p key={year}>{year} · 1군 WAR {totalWar(war.first)} (수비 {war.first.fielding.toFixed(2)} · 포지션 {war.first.positional.toFixed(2)}) / 2군 WAR {totalWar(war.second)} · 출전평가 {war.score.toFixed(1)}점</p>)}</details>}
  </div>;
}
