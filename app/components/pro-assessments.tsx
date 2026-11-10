import {getPlayer} from "../../lib/sim/engine";
import {careerContractSummary} from "../../lib/career-summary";
import {rosterGrade} from "../../lib/roster-grades";
import type {GameState} from "../../lib/sim/types";

const assessmentText=(value:number|null)=>value===null?"미평가":`${value.toFixed(1)} · ${rosterGrade(value,true)}`;
const salaryText=(value:number|null)=>value===null?"—":`${Math.trunc(value/10_000).toLocaleString()}만 원`;
const squads={first:"1군",second:"2군",third:"3군",developmental:"육성선수"};
export default function ProAssessments({state}:{state:GameState}){
  const p=getPlayer(state),pro=p.professional,summary=careerContractSummary(state),rows=(pro?.assessments??[]).slice().sort((a,b)=>b.year-a.year);
  return <div className="compact-contract" aria-label="계약 요약과 시즌별 평가"><div className="compact-contract-metrics">
    <div><span>누적 평가</span><b>{assessmentText(summary.cumulative)}</b></div>
    <div><span>올해 예상 누적 평가</span><b>{assessmentText(summary.projected)}</b></div>
    <div><span>남은 계약기간</span><b>{summary.seasons?`${summary.seasons}시즌`:pro?.contract?"계약 만료":"미계약"}</b></div>
    <div><span>연봉</span><b>{salaryText(summary.salary)}</b></div>
  </div>{rows.length>0&&<details className="contract-season-evaluations"><summary>시즌별 평가 · {rows.length}시즌</summary><div className="table-scroll"><table><thead><tr>{['시즌','출전평가','점수','연봉','최종 등록'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=>{
    const salary=row.salary!==undefined?row.salary:pro?.salaries.filter(item=>item.year===row.year).at(-1)?.salary??null;
    return <tr key={row.year}><th scope="row">{row.year}</th><td>{row.grade}</td><td>{row.score===null?'—':row.score.toFixed(1)}</td><td>{salaryText(salary)}</td><td>{row.squad?squads[row.squad]:'무소속'}</td></tr>;
  })}</tbody></table></div></details>}</div>;
}
