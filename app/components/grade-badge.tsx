import {rosterGrade} from "../../lib/roster-grades";

export default function GradeBadge({score,pro=false,label}:{score:number|null|undefined;pro?:boolean;label:string}){
  const grade=rosterGrade(score,pro);
  return <span className={`player-grade grade-${grade==="—"?"unknown":grade.toLowerCase()}`} aria-label={`${label} 등급 ${grade}`}>{grade}</span>;
}
