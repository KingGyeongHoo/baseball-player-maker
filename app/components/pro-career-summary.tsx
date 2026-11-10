import {careerHonorCategories,careerHonors,lifetimeRecords} from "../../lib/career-summary";
import {getPlayer,isPitcher} from "../../lib/sim/engine";
import type {GameState} from "../../lib/sim/types";
import {dashboardRecordValues} from "./dashboard-records";

export function CareerLifetimeRecords({state}:{state:GameState}){
  const player=getPlayer(state),total=lifetimeRecords(player,state.calendar.seasonYear),primary=isPitcher(player.primaryRole);
  const fields=[primary,!primary].filter(pitching=>pitching===primary||player.twoWay||(pitching?total.pitching.BF>0:total.batting.PA>0));
  const groups=fields.map(pitching=>({pitching,values:dashboardRecordValues(total,pitching)})),values=groups.flatMap(group=>group.values);
  return <section className="panel career-lifetime"><div className="panel-heading"><h2>선수 생활 통산</h2><span className="small muted">모든 팀 · 1·2군 합산</span></div><div className="table-scroll" tabIndex={0} role="region" aria-label="선수 생활 통산 성적"><table className={groups.length>1?'both-fields':''}><thead><tr><th rowSpan={2}>구분</th>{groups.map(group=><th key={String(group.pitching)} colSpan={group.values.length}>{group.pitching?'투수':'타자'}</th>)}</tr><tr>{values.map(([label],i)=><th key={i}>{label}</th>)}</tr></thead><tfoot><tr><th scope="row">통산</th>{values.map(([,value],i)=><td key={i}>{value}</td>)}</tr></tfoot></table></div><p className="career-summary-note">고교·대학·프로 1·2군·포스트시즌의 공식 기록 합계</p></section>;
}
export function CareerHonors({state}:{state:GameState}){
  const honors=careerHonors(state);
  return <section className="panel career-honors"><div className="panel-heading"><h2>선발·수상 내역</h2></div><div className="career-honor-grid">{careerHonorCategories.map(category=>{
    const rows=honors[category.id];
    return <section className="career-honor-category" key={category.id}><h3>{category.label}<span>{rows.length}건</span></h3>{rows.length?<ul>{rows.map(row=><li key={`${row.year}:${row.title}`}><time>{row.year}</time><div><b>{row.title}</b>{row.detail&&<small>{row.detail}</small>}</div></li>)}</ul>:<p className="empty-note">아직 내역이 없습니다.</p>}</section>;
  })}</div></section>;
}
