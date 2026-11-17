import {rosterGrade} from "../../lib/roster-grades";

export default function GradeBadge({score,pro=false,label,grade:override}:{score:number|null|undefined;pro?:boolean;label:string;grade?:string}){
  const grade=override??rosterGrade(score,pro);
  return <span className={`player-grade grade-${grade==="—"?"unknown":grade.toLowerCase()}`} aria-label={`${label} 등급 ${grade}`}>{grade}</span>;
}
