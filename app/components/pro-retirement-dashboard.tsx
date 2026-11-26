import {getPlayer,isPitcher,positionLabel} from "../../lib/sim/engine";
import {clubName} from "../../lib/sim/pro-world";
import {retirementSummary} from "../../lib/retirement-summary";
import type {GameState} from "../../lib/sim/types";
import {dashboardRecordValues} from "./dashboard-records";
import {scoreText} from "../../lib/display";
import {rosterGrade} from '../../lib/roster-grades';
import RetirementHonorDisplay from './retirement-honor-display';

export default function ProRetirement({state,onRecords,onNew,onSave,saving=false,saveMessage}:{state:GameState;onRecords:()=>void;onNew:()=>void;onSave?:()=>void;saving?:boolean;saveMessage?:string}){
  const p=getPlayer(state),w=state.proWorld!,retired=w.retired;if(!retired)return null;
  const {records,milestones,honorCollections}=retirementSummary(state),primary=isPitcher(p.primaryRole);
  const fields=[primary,!primary].filter(pitching=>pitching===primary||p.twoWay||(pitching?records.pitching.BF>0:records.batting.PA>0));
  const honor=w.retiredNumbers?.find(row=>row.playerId===p.id);
  const retirementHonor=w.retirementHonors?.find(row=>row.playerId===p.id);
  const seasons=new Set(p.career.filter(row=>row.careerMode==="pro").map(row=>row.year)).size;
  return <div className="pro-retirement retirement-dashboard">
    <p>{retired.reason}</p>
    <section className="retirement-records" aria-labelledby="retirement-records-title">
      <div className="retirement-records-heading"><div><span className="eyebrow">CAREER TOTALS</span><h1 id="retirement-records-title">야구인생 통산 기록</h1><p><b>{p.name}</b><span>{positionLabel(p)} · 프로 {seasons}시즌</span></p></div><span className="retirement-date">{retired.date.replaceAll("-",".")} 은퇴</span></div>
      {fields.map(pitching=><div className="retirement-record-group" key={String(pitching)}><h2>{pitching?"투수 기록":"타자 기록"}</h2><dl className="retirement-stat-grid">{dashboardRecordValues(records,pitching).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>)}
      <p className="retirement-records-caption">고교·대학·프로 1·2군·포스트시즌의 공식 기록 합산</p>
    </section>

    <section className="panel retirement-journey" aria-labelledby="retirement-journey-title"><div className="panel-heading"><div><span className="eyebrow">MY BASEBALL JOURNEY</span><h2 id="retirement-journey-title">선수생활의 발자취</h2></div><span className="small muted">{milestones.length}개의 순간</span></div>
      <ol className="career-timeline">{milestones.map(milestone=><li key={milestone.id} className={`milestone-${milestone.kind}`}><time dateTime={milestone.date}>{milestone.dateLabel}</time><span className="milestone-marker" aria-hidden="true"/><div><h3>{milestone.title}</h3><p>{milestone.detail}</p></div></li>)}</ol>
    </section>

    <RetirementHonorDisplay honors={honorCollections}/>

    <section className="panel retirement-farewell" aria-label="은퇴 예우"><div className="panel-heading"><h2>은퇴 예우</h2></div><div className="career-panel-body"><p><b>은퇴식</b> · {retirementHonor?.ceremony?'해당':'해당 없음'}</p><p><b>은퇴 투어</b> · {retirementHonor?.tour?'해당':'해당 없음'}</p><p><b>영구결번</b> · {honor?honor.number+'번':'해당 없음'}</p></div></section>
    {honor&&<section className="panel retired-number-honor" aria-label="영구결번"><strong>{honor.number}</strong><div><span className="eyebrow">RETIRED NUMBER</span><h2>{clubName(state,honor.club)} 영구결번</h2><p>{honor.playerName} · {honor.criteria?`구단 WAR ${honor.criteria.clubWar.toFixed(1)} · 수상 가산점 ${honor.criteria.awardBonus.toFixed(1)} · 인정 ${honor.criteria.seasons}시즌`:`누적 평가 ${scoreText(honor.score)}점 · ${honor.grade??rosterGrade(honor.score,true)}등급`}</p><p>이 선수의 저장을 보관하는 동안 해당 구단에서 이 번호를 다시 사용할 수 없습니다.</p></div></section>}
    <div className="retirement-actions"><button className="primary" onClick={onRecords}>연도별·리그별 기록 보기 ↗</button>{onSave&&<button className="secondary" disabled={saving} onClick={onSave}>{saving?"저장 중…":"은퇴 커리어 저장"}</button>}<button className="secondary" disabled={saving} onClick={onNew}>선수 재생성</button></div>
    {saveMessage&&<p role="status">{saveMessage}</p>}
  </div>;
}
