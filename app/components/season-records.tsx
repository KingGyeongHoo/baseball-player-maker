import { useState } from "react";
import {positionLabel} from "../../lib/sim/engine";
import {handednessLabel} from "../../lib/player-handedness";
import { formatInnings, playerSeasons, recordRates, totalRecords, type PlayerSeason } from "../../lib/player-records";
import type { GameState,Player, RecordLine } from "../../lib/sim/types";
import {playerSeasonWar} from '../../lib/player-season-war';
import {createProWarContext} from '../../lib/sim/pro-war';
import {draftClubs,emptyRecord} from "../../lib/sim/engine";
const seasonLabel=(s:PlayerSeason)=>s.careerMode==="pro"?"프로":s.careerMode==="college"?"대학":`고${s.grade}`;

const rate = (value: number | null, digits = 3) => {
  if (value === null) return "—";
  const text = value.toFixed(digits);
  return digits === 3 ? text.replace(/^0\./, ".") : text;
};

function BattingRow({ records, label, season, ended, war }: { records: RecordLine; label: string; season?: PlayerSeason; ended: boolean;war:number|null }) {
  const b = records.batting, rates = recordRates(records);
  return <tr className={season?.current ? "current-season" : ""}>
    <th scope="row">{label}{season?.current && <small>{ended ? "최종" : "진행 중"}</small>}{season?.schoolName && <span className="table-school">{season.schoolName}</span>}</th>
    <td>{b.AB}</td><td><b>{rate(rates.average)}</b></td>
    <td>{b.H}</td><td>{b["2B"]}</td><td>{b["3B"]}</td><td>{b.HR}</td><td>{b.RBI}</td><td>{b.SB??0}</td><td>{b.R}</td><td>{b.BB}</td><td>{b.SO}</td>
    <td>{rate(rates.obp)}</td><td>{rate(rates.slugging)}</td><td><b>{rate(rates.ops)}</b></td><td>{war===null?'—':war.toFixed(2)}</td>
  </tr>;
}

function PitchingRow({ records, label, season, ended,war }: { records: RecordLine; label: string; season?: PlayerSeason; ended: boolean;war:number|null }) {
  const p = records.pitching, rates = recordRates(records);
  return <tr className={season?.current ? "current-season" : ""}>
    <th scope="row">{label}{season?.current && <small>{ended ? "최종" : "진행 중"}</small>}{season?.schoolName && <span className="table-school">{season.schoolName}</span>}</th>
    <td>{p.BF}</td><td><b>{formatInnings(p.outs)}</b></td><td><b>{rate(rates.era, 2)}</b></td>
    <td>{p.H}</td><td>{p.HR}</td><td>{p.BB}</td><td>{p.SO}</td><td>{p.R}</td><td>{p.ER}</td><td>{rate(rates.whip, 2)}</td><td>{war===null?'—':war.toFixed(2)}</td>
  </tr>;
}

export default function SeasonRecords({ player, year, school, ended, mine, onMyRecords,state }: {
  state?:GameState;
  player: Player;
  year: number;
  school: string;
  ended: boolean;
  mine: boolean;
  onMyRecords: () => void;
}) {
  const [selectedYear, setSelectedYear] = useState("all");
  const [level,setLevel]=useState(player.careerMode==="pro"?"first":"all");
  const [club,setClub]=useState("all");
  const seasons = playerSeasons(player, year).map(season => ({ ...season, schoolName: season.schoolName ?? school }));
  const byYear = selectedYear === "all" ? seasons : seasons.filter(s => s.year === Number(selectedYear));
  const scoped=club==="all"?byYear:byYear.filter(s=>s.byClub?.[club]).map(s=>({...s,records:totalRecords([{records:s.byClub![club].first},{records:s.byClub![club].second}]),byLevel:{first:s.byClub![club].first,second:s.byClub![club].second},postseason:s.byClub![club].postseason,farmPostseason:s.byClub![club].farmPostseason,spring:emptyRecord()}));
  const visible = level==="all"?scoped:level==="highSchool"?scoped.filter(s=>!s.careerMode):scoped.filter(s=>s.byLevel).map(s=>({...s,records:level==="spring"?s.spring??emptyRecord():level==="farmPostseason"?s.farmPostseason??emptyRecord():level==="postseason"?s.postseason??emptyRecord():s.byLevel![level as "first"|"second"]}));
  const total = totalRecords(visible);
  const context=state?createProWarContext(state):undefined;
  const contributions=visible.map(season=>playerSeasonWar(player,season,level,club,context));
  const sumWar=(field:'batting'|'pitching')=>contributions.some(w=>w!==null)?contributions.reduce((sum,w)=>sum+(w?.[field]??0),0):null;
  const rates = recordRates(total);
  const showBatting=total.batting.PA>0,showPitching=total.pitching.outs>0;
  const summary = [
    ...(showBatting?[["타율", rate(rates.average)], ["안타", total.batting.H], ["홈런", total.batting.HR]]:[]),
    ...(showPitching?[["투구 이닝", formatInnings(total.pitching.outs)], ["평균자책점", rate(rates.era, 2)], ["탈삼진", total.pitching.SO]]:[]),
  ];
  return <div className="season-records">
    <div className="section-intro">
      <div><span className="eyebrow">PLAYER CAREER RECORDS</span><h1>{player.name}의 연도별 기록</h1>
        <p>{school} · {positionLabel(player)} · {player.age??16+player.grade}세 · {handednessLabel(player)}</p></div>
      {!mine && <button className="secondary" onClick={onMyRecords}>내 기록 보기</button>}
    </div>
    <div className="records-toolbar">
      <div><b>{selectedYear === "all" ? "커리어 통산" : `${selectedYear} 시즌`} 요약</b><span>{visible.length}개 시즌 · {ended ? "최종 기록" : "이번 주까지의 누적 기록"}</span></div>
      <div className="records-selectors"><label>시즌 선택 <select value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>
        <option value="all">모든 시즌</option>{seasons.map(s => <option value={s.year} key={s.year}>{s.year} · {seasonLabel(s)}</option>)}
      </select></label>{player.careerMode==="pro"&&<label>팀별 선택 <select value={club} onChange={e=>setClub(e.target.value)}><option value="all">모든 팀</option>{[...new Set(seasons.flatMap(s=>Object.keys(s.byClub??{})))].map(id=><option key={id} value={id}>{draftClubs[Number(id)]}</option>)}</select></label>}</div>
    </div>
    {player.careerMode === "pro" && <div className="segmented pro-level-filter">{[["first","프로"],["second","프로 2군"],["spring","시범경기"],["postseason","포스트시즌"],["farmPostseason","2군 포스트시즌"],["highSchool","고교"],["all","전체 정규 기록"]].map(([id,label])=><button className={level===id?"selected":""} key={id} onClick={()=>setLevel(id)}>{label}</button>)}</div>}<div className="career-record-summary">{summary.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    {showPitching&&<section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">PITCHING RECORDS</span><h2>연도별 투수 기록</h2></div><span className="small muted">{total.pitching.BF} 상대 타자</span></div>
      <div className="table-scroll season-table" tabIndex={0} role="region" aria-label="연도별 투수 기록, 가로로 스크롤 가능">
        <table className="pitching-seasons"><thead><tr>{["시즌", "상대 타자", "이닝", "평균자책점", "피안타", "피홈런", "볼넷", "탈삼진", "실점", "자책점", "WHIP", "WAR"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{visible.map((s,i) => <PitchingRow key={s.year} label={String(s.year)} records={s.records} season={s} ended={ended} war={contributions[i]?.pitching??null}/>)}</tbody>
          <tfoot><PitchingRow label="합계" records={total} ended={ended} war={sumWar('pitching')}/></tfoot>
        </table>
      </div>
    </section>}
    {showBatting&&<section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">BATTING RECORDS</span><h2>연도별 타자 기록</h2></div><span className="small muted">{total.batting.AB} 타수</span></div>
      <div className="table-scroll season-table" tabIndex={0} role="region" aria-label="연도별 타자 기록, 가로로 스크롤 가능">
        <table className="batting-seasons"><thead><tr>{["시즌", "타수", "타율", "안타", "2루타", "3루타", "홈런", "타점", "도루", "득점", "볼넷", "삼진", "출루율", "장타율", "OPS", "WAR"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{visible.map((s,i) => <BattingRow key={s.year} label={String(s.year)} records={s.records} season={s} ended={ended} war={contributions[i]?.batting??null}/>)}</tbody>
          <tfoot><BattingRow label="합계" records={total} ended={ended} war={sumWar('batting')}/></tfoot>
        </table>
      </div>
    </section>}
  </div>;
}
