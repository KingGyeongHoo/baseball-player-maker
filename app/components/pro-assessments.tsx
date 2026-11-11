import {getPlayer} from "../../lib/sim/engine";
import {careerContractSummary} from "../../lib/career-summary";
import type {GameState} from "../../lib/sim/types";
import GradeBadge from "./grade-badge";

function AssessmentMetric({label,score}:{label:string;score:number|null}){
  return <div><span>{label}</span><div className="contract-assessment-value"><b>{score===null?"미평가":score.toFixed(1)}</b><GradeBadge score={score} pro label={label}/></div></div>;
}
const salaryText=(value:number|null)=>value===null?"—":`${Math.trunc(value/10_000).toLocaleString()}만 원`;
const totalWar=(w:{batting:number;pitching:number;fielding:number;positional:number})=>(w.batting+w.pitching+w.fielding+w.positional).toFixed(2);
const squads={first:"1군",second:"2군",third:"3군",developmental:"육성선수"};
export default function ProAssessments({state}:{state:GameState}){
  const p=getPlayer(state),pro=p.professional,summary=careerContractSummary(state),rows=(pro?.assessments??[]).slice().sort((a,b)=>b.year-a.year);
  return <div className="compact-contract" aria-label="계약 요약과 시즌별 평가"><div className="compact-contract-metrics">
    <AssessmentMetric label="시즌 평가" score={summary.seasonScore}/>
    <AssessmentMetric label="누적 평가" score={summary.cumulative}/>
    <div><span>남은 계약 기간</span><b>{summary.seasons?`${summary.seasons}시즌`:pro?.contract?"계약 만료":"미계약"}</b></div>
    <div><span>연봉</span><b>{salaryText(summary.salary)}</b></div>
  </div>{rows.length>0&&<details className="contract-season-evaluations"><summary>시즌별 평가 · {rows.length}시즌</summary><div className="table-scroll"><table><thead><tr>{['시즌','시즌평가','점수','연봉','최종 등록'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=>{
    const salary=row.salary!==undefined?row.salary:pro?.salaries.filter(item=>item.year===row.year).at(-1)?.salary??null;
    return <tr key={row.year}><th scope="row">{row.year}</th><td>{row.grade}</td><td>{row.score===null?'—':row.score.toFixed(1)}</td><td>{salaryText(salary)}</td><td>{row.squad?squads[row.squad]:'무소속'}</td></tr>;
  })}</tbody></table></div></details>}
  {summary.war&&<p className="micro muted">올해 WAR 환산 {summary.war.equivalentWins.toFixed(2)}승 → 시즌평가 {summary.war.score.toFixed(1)}점. 시즌 결산과 계약의 성과 근거이며 현재 출전평가와 구분합니다.</p>}
  {(summary.war||rows.some(row=>row.war))&&<details><summary>WAR와 시즌평가 산정 내역</summary><p className="micro muted">타격·투구·수비·포지션의 경기 기록으로 계산한 게임용 WAR를 점수·등급으로 환산합니다. 구원투수의 역할과 2군 수준을 보정하며 적은 출전을 풀 시즌으로 확대하지 않습니다. 현재 출전평가는 기량과 최근 성적을 사용하며 피로를 감점하지 않습니다. 수비는 기록이 생긴 경기부터 반영하며 주루 세부 기여는 포함하지 않습니다.</p>{[
    ...(!rows.some(row=>row.year===state.calendar.seasonYear)&&summary.war?[{year:state.calendar.seasonYear,war:summary.war}]:[]),
    ...rows.flatMap(row=>row.war?[{year:row.year,war:row.war}]:[]),
  ].map(({year,war})=><p key={year}>{year} · 1군 WAR {totalWar(war.first)} (수비 {war.first.fielding.toFixed(2)} · 포지션 {war.first.positional.toFixed(2)}) / 2군 WAR {totalWar(war.second)} · 시즌평가 {war.score.toFixed(1)}점</p>)}</details>}
  </div>;
}
