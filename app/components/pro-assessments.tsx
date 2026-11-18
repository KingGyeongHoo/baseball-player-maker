import {getPlayer} from "../../lib/sim/engine";
import {careerContractSummary} from "../../lib/career-summary";
import type {GameState} from "../../lib/sim/types";
import GradeBadge from "./grade-badge";
import SeasonGradeBadge from './season-grade-badge';
import Tooltip from './tooltip';
import type {evaluateCareer} from '../../lib/sim/pro-career-evaluation';
import {seasonPercentile} from '../../lib/sim/pro-career-evaluation';

const salaryText=(value:number|null)=>value===null?"—":`${Math.trunc(value/10_000).toLocaleString()}만 원`;
const squads={first:"1군",second:"2군",third:"3군",developmental:"육성선수"};
function CareerMetric({evaluation,totalSeasons,label}:{evaluation:ReturnType<typeof evaluateCareer>;totalSeasons:number;label:string}){
  return <div><span>{label}</span><div className="contract-assessment-value">
    <b>{evaluation.score===null?'미평가':evaluation.score.toFixed(1)}</b>
    <Tooltip content={`인정 ${evaluation.seasons}시즌 / 전체 ${totalSeasons}시즌`}>
      <GradeBadge score={evaluation.score} grade={evaluation.grade} pro label={label}/>
    </Tooltip>
  </div></div>;
}
export default function ProAssessments({state}:{state:GameState}){
  const p=getPlayer(state),pro=p.professional,summary=careerContractSummary(state),rows=(pro?.assessments??[]).slice().sort((a,b)=>b.year-a.year);
  const totalSeasons=new Set([
    ...rows.map(row=>row.year),
    ...p.career.filter(row=>row.careerMode==='pro').map(row=>row.year),
  ].filter(year=>year<=state.calendar.seasonYear)).size;
  return <div className="compact-contract" aria-label="계약 요약과 시즌별 평가"><div className="compact-contract-metrics">
    <div><span>시즌 평가</span><div className="contract-assessment-value"><b>{summary.seasonScore===null?'미평가':summary.seasonScore.toFixed(1)}</b><SeasonGradeBadge score={summary.seasonScore} grade={summary.seasonGrade} rank={summary.seasonRank} war={summary.war?.equivalentWins}/></div></div>
    <CareerMetric label="누적 평가" evaluation={summary.career.first} totalSeasons={totalSeasons}/>
    <div><span>남은 계약 기간</span><b>{summary.seasons?`${summary.seasons}시즌`:pro?.contract?"계약 만료":"미계약"}</b></div>
    <div><span>연봉</span><b>{salaryText(summary.salary)}</b></div>
  </div>{rows.length>0&&<details className="contract-season-evaluations"><summary>시즌별 평가 · {rows.length}시즌</summary><div className="table-scroll"><table><thead><tr>{['시즌','시즌평가','점수','연봉','최종 등록'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=>{
    const salary=row.salary!==undefined?row.salary:pro?.salaries.filter(item=>item.year===row.year).at(-1)?.salary??null;
    const score=seasonPercentile(row.seasonRank);
    return <tr key={row.year}><th scope="row">{row.year}</th><td><SeasonGradeBadge score={score} grade={row.grade} rank={row.seasonRank} war={row.war?.equivalentWins}/>{row.clubGamesShortage&&<small> · 구단 경기 부족 · 재계약 심사 보류</small>}</td><td>{score===null?'—':score.toFixed(1)}</td><td>{salaryText(salary)}</td><td>{row.squad?squads[row.squad]:'무소속'}</td></tr>;
  })}</tbody></table></div></details>}
  </div>;
}
