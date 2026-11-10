import {useMemo,useState} from "react";
import {getPlayer} from "../../lib/sim/engine";
import {careerLeagueTable} from "../../lib/sim/pro-calendar";
import {formatInnings} from "../../lib/player-records";
import {leagueLeaders,type LeaderField,type LeaderMetric} from "../../lib/league-leaders";
import type {GameState} from "../../lib/sim/types";
import PostseasonBracket from "./postseason-bracket";
import ProAllstar from "./pro-allstar";

function metricText(value:number,metric:LeaderMetric){
  if(metric.format==="innings")return formatInnings(value);
  if(metric.format==="percent")return `${(value*100).toFixed(1)}%`;
  if(metric.format==="decimal")return value.toFixed(2);
  if(metric.format==="rate")return value.toFixed(3).replace(/^0\./,".");
  return String(value);
}
export default function ProLeague({state,onRecords}:{state:GameState;onRecords:(id:string)=>void}){
  const pro=state.careerMode==="pro",mine=getPlayer(state);
  const [level,setLevel]=useState(pro&&mine.teamId>=0&&mine.teamId<10?"pro-first":pro?"pro-second":"college");
  const [field,setField]=useState<LeaderField>("batting");
  const competition=state.calendar.competitions.find(c=>c.id===level)??state.calendar.competitions[0];
  const id=competition?.id??level;
  const table=useMemo(()=>careerLeagueTable(state.calendar,id),[state.calendar,id]);
  const boards=useMemo(()=>leagueLeaders(state,id,field),[state,id,field]);
  return <div className="pro-league">
    <ProAllstar state={state} onRecords={onRecords}/>
    <div className="section-intro"><div><span className="eyebrow">LEAGUE LEADERS</span><h1>{state.calendar.seasonYear} 리그</h1><p>팀 순위와 개인 기록 TOP 10</p></div></div>
    <PostseasonBracket state={state}/>
    <div className="segmented pro-level-filter" aria-label="리그 선택">{(pro?[["pro-first","1군"],["pro-second","2군"]]:[["college","대학"]]).map(([key,label])=><button key={key} className={id===key?"selected":""} aria-pressed={id===key} onClick={()=>setLevel(key)}>{label}</button>)}</div>
    <section className="panel"><div className="panel-heading"><h2>{pro?id==="pro-first"?"1군 팀 순위":"2군 팀 순위":"팀 순위"}</h2></div>
      <div className="table-scroll"><table><thead><tr>{["순위","팀","경기","승","패","무","승률","게임차"].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{table.map(row=><tr key={row.teamId} className={row.teamId===mine.teamId?"my-player-row":""}><td>{row.rank}{row.tiePending?"T":""}</td><td>{state.teams[row.teamId]?.name}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.draws}</td><td>{row.wins+row.losses?row.percentage.toFixed(3):"—"}</td><td>{row.gamesBehind.toFixed(1)}</td></tr>)}</tbody></table></div>
      <p className="draft-board-note">{competition?.startDate}~{competition?.endDate} · 승률 = 승 ÷ (승+패), 무승부 제외 · 승률 → 승수 → 타이브레이커 순. T는 동률이며 시즌 종료 후 순위결정전을 치릅니다.</p>
    </section>
    <section className="league-individual"><div className="league-leaders-heading"><h2>개인 순위</h2><div className="segmented" aria-label="개인 순위 분야">{([["batting","타자"],["pitching","투수"]] as const).map(([key,label])=><button key={key} aria-pressed={field===key} className={field===key?"selected":""} onClick={()=>setField(key)}>{label}</button>)}</div></div>
      <p className="draft-board-note">{field==="batting"?"타율·출루율·장타율·OPS는 팀 경기 수 × 3.1 이상의 타석":"평균자책점·WHIP·탈삼진율은 팀 경기 수 이상의 투구 이닝"}을 채운 선수만 표시합니다. 포스트시즌 기록은 포함하지 않습니다.</p>
      <div className="league-leader-grid">{boards.map(({metric,rows})=><section className="panel league-leader-card" key={metric.id}><div className="panel-heading"><h3>{metric.label} <span>TOP 10</span></h3><small>{metric.ascending?"낮은 순":"높은 순"}</small></div>
        {rows.length?<div className="table-scroll"><table><thead><tr><th>순위</th><th>선수</th><th>소속</th><th>{metric.label}</th></tr></thead><tbody>{rows.map(({player,value},i)=><tr key={player.id} className={player.id===mine.id?"my-player-row":""}><td>{i+1}</td><td><button className="player-name-button" onClick={()=>onRecords(player.id)}>{player.name}</button></td><td>{state.teams[player.teamId]?.shortName?.replace(/ [12]군$/," ").trim()??"무소속"}</td><td><b>{metricText(value,metric)}</b></td></tr>)}</tbody></table></div>:<p className="empty-note">{metric.qualified?"아직 규정 기록을 채운 선수가 없습니다.":"아직 기록이 없습니다."}</p>}
      </section>)}</div>
    </section>
  </div>;
}
