import {getPlayer,isPitcher,positionLabel} from "../../lib/sim/engine";
import {clubName} from "../../lib/sim/pro-world";
import {retirementSummary} from "../../lib/retirement-summary";
import type {GameState} from "../../lib/sim/types";
import {dashboardRecordValues} from "./dashboard-records";
import {scoreText} from "../../lib/display";

export default function ProRetirement({state,onRecords,onNew}:{state:GameState;onRecords:()=>void;onNew:()=>void}){
  const p=getPlayer(state),w=state.proWorld!,retired=w.retired;if(!retired)return null;
  const {records,milestones,counts}=retirementSummary(state),primary=isPitcher(p.primaryRole);
  const fields=[primary,!primary].filter(pitching=>pitching===primary||p.twoWay||(pitching?records.pitching.BF>0:records.batting.PA>0));
  const honor=w.retiredNumbers?.find(row=>row.playerId===p.id);
  const seasons=new Set(p.career.filter(row=>row.careerMode==="pro").map(row=>row.year)).size;
  const summaries=[{label:"올스타 선정",value:counts.allstar,note:"1·2군 선발 · 대체 선발 포함"},{label:"개인 수상",value:counts.individual,note:"골든글러브 · 기록 타이틀 · 대회 개인상"},{label:"시즌 MVP",value:counts.mvp,note:"리그 최고의 선수"},{label:"국가대표 발탁",value:counts.national,note:"성인 대표 · WBC"}];
  return <div className="pro-retirement retirement-dashboard">
    <section className="retirement-records" aria-labelledby="retirement-records-title">
      <div className="retirement-records-heading"><div><span className="eyebrow">CAREER TOTALS</span><h1 id="retirement-records-title">야구인생 통산 기록</h1><p><b>{p.name}</b><span>{positionLabel(p)} · 프로 {seasons}시즌</span></p></div><span className="retirement-date">{retired.date.replaceAll("-",".")} 은퇴</span></div>
      {fields.map(pitching=><div className="retirement-record-group" key={String(pitching)}><h2>{pitching?"투수 기록":"타자 기록"}</h2><dl className="retirement-stat-grid">{dashboardRecordValues(records,pitching).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>)}
      <p className="retirement-records-caption">고교·대학·프로 1·2군·포스트시즌의 공식 기록 합산</p>
    </section>

    <section className="panel retirement-journey" aria-labelledby="retirement-journey-title"><div className="panel-heading"><div><span className="eyebrow">MY BASEBALL JOURNEY</span><h2 id="retirement-journey-title">선수생활의 발자취</h2></div><span className="small muted">{milestones.length}개의 순간</span></div>
      <ol className="career-timeline">{milestones.map(milestone=><li key={milestone.id} className={`milestone-${milestone.kind}`}><time dateTime={milestone.date}>{milestone.dateLabel}</time><span className="milestone-marker" aria-hidden="true"/><div><h3>{milestone.title}</h3><p>{milestone.detail}</p></div></li>)}</ol>
    </section>

    <section className="retirement-honor-counts" aria-label="선발과 수상 횟수">{summaries.map(({label,value,note})=><article className="panel" key={label}><h2>{label}</h2><p><strong>{value}</strong><span>회</span></p><small>{note}</small></article>)}</section>

    {honor&&<section className="panel retired-number-honor" aria-label="영구결번"><strong>{honor.number}</strong><div><span className="eyebrow">RETIRED NUMBER</span><h2>{clubName(state,honor.club)} 영구결번</h2><p>{honor.playerName} · 누적 평가 {scoreText(honor.score)}점 · S등급</p><p>한 구단에서 이어 온 선수 생활을 기려 이 번호를 영원히 남깁니다.</p></div></section>}
    <div className="retirement-actions"><button className="primary" onClick={onRecords}>연도별·리그별 기록 보기 ↗</button><button className="secondary" onClick={onNew}>선수 재생성</button></div>
  </div>;
}
