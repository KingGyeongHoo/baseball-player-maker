import { useState } from "react";
import { positions } from "@/lib/sim/engine";
import { formatInnings, playerSeasons, recordRates, totalRecords, type PlayerSeason } from "@/lib/player-records";
import type { Player, RecordLine } from "@/lib/sim/types";

const rate = (value: number | null, digits = 3) => {
  if (value === null) return "—";
  const text = value.toFixed(digits);
  return digits === 3 ? text.replace(/^0\./, ".") : text;
};

function BattingRow({ records, label, season, ended }: { records: RecordLine; label: string; season?: PlayerSeason; ended: boolean }) {
  const b = records.batting, rates = recordRates(records);
  return <tr className={season?.current ? "current-season" : ""}>
    <th scope="row">{label}{season?.current && <small>{ended ? "최종" : "진행 중"}</small>}</th>
    <td>{season ? `고${season.grade}` : "—"}</td><td>{b.PA}</td><td>{b.AB}</td><td><b>{rate(rates.average)}</b></td>
    <td>{b.H}</td><td>{b["2B"]}</td><td>{b["3B"]}</td><td>{b.HR}</td><td>{b.RBI}</td><td>{b.R}</td><td>{b.BB}</td><td>{b.SO}</td>
    <td>{rate(rates.obp)}</td><td>{rate(rates.slugging)}</td><td><b>{rate(rates.ops)}</b></td><td>{b.GB}</td><td>{b.FB}</td>
  </tr>;
}

function PitchingRow({ records, label, season, ended }: { records: RecordLine; label: string; season?: PlayerSeason; ended: boolean }) {
  const p = records.pitching, rates = recordRates(records);
  return <tr className={season?.current ? "current-season" : ""}>
    <th scope="row">{label}{season?.current && <small>{ended ? "최종" : "진행 중"}</small>}</th>
    <td>{season ? `고${season.grade}` : "—"}</td><td>{p.BF}</td><td><b>{formatInnings(p.outs)}</b></td><td><b>{rate(rates.era, 2)}</b></td>
    <td>{p.H}</td><td>{p.HR}</td><td>{p.BB}</td><td>{p.SO}</td><td>{p.R}</td><td>{p.ER}</td><td>{rate(rates.whip, 2)}</td>
  </tr>;
}

export default function SeasonRecords({ player, year, school, ended, mine, onMyRecords }: {
  player: Player;
  year: number;
  school: string;
  ended: boolean;
  mine: boolean;
  onMyRecords: () => void;
}) {
  const [selectedYear, setSelectedYear] = useState("all");
  const seasons = playerSeasons(player, year);
  const visible = selectedYear === "all" ? seasons : seasons.filter(s => s.year === Number(selectedYear));
  const total = totalRecords(visible);
  const rates = recordRates(total);
  const summary = [
    ["타율", rate(rates.average)], ["안타", total.batting.H], ["홈런", total.batting.HR],
    ["투구 이닝", formatInnings(total.pitching.outs)], ["ERA", rate(rates.era, 2)], ["탈삼진", total.pitching.SO],
  ];
  return <div className="season-records">
    <div className="section-intro">
      <div><span className="eyebrow">PLAYER CAREER RECORDS</span><h1>{player.name}의 연도별 기록</h1>
        <p>{school} · {positions[player.position]} · 고교 {player.grade}학년{mine ? " · 나의 선수" : ""}</p></div>
      {!mine && <button className="secondary" onClick={onMyRecords}>내 기록 보기</button>}
    </div>
    <div className="records-toolbar">
      <div><b>{selectedYear === "all" ? "고교 통산" : `${selectedYear} 시즌`} 요약</b><span>{visible.length}개 시즌 · {ended ? "최종 기록" : "이번 주까지의 누적 기록"}</span></div>
      <label>시즌 선택 <select value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>
        <option value="all">전체 시즌</option>{seasons.map(s => <option value={s.year} key={s.year}>{s.year} · 고{s.grade}</option>)}
      </select></label>
    </div>
    <div className="career-record-summary">{summary.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">BATTING RECORDS</span><h2>연도별 타격 기록</h2></div><span className="small muted">{total.batting.PA} 타석</span></div>
      <div className="table-scroll season-table" tabIndex={0} role="region" aria-label="연도별 타격 기록, 가로로 스크롤 가능">
        <table className="batting-seasons"><thead><tr>{["시즌", "학년", "PA", "AB", "AVG", "H", "2B", "3B", "HR", "RBI", "R", "BB", "SO", "OBP", "SLG", "OPS", "GB", "FB"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{visible.map(s => <BattingRow key={s.year} label={String(s.year)} records={s.records} season={s} ended={ended} />)}</tbody>
          <tfoot><BattingRow label="합계" records={total} ended={ended} /></tfoot>
        </table>
      </div>
      {!total.batting.PA && <p className="empty-note">선택한 시즌에 타격 출전 기록이 없습니다. 타율·출루율·장타율·OPS는 미평가로 표시됩니다.</p>}
      <p className="records-caption">PA 타석 · AB 타수 · AVG 타율 · H 안타 · RBI 타점 · R 득점 · BB 볼넷 · SO 삼진 · OBP 출루율 · SLG 장타율 · GB 땅볼 · FB 뜬공</p>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">PITCHING RECORDS</span><h2>연도별 투구 기록</h2></div><span className="small muted">{total.pitching.BF} 상대 타자</span></div>
      <div className="table-scroll season-table" tabIndex={0} role="region" aria-label="연도별 투구 기록, 가로로 스크롤 가능">
        <table className="pitching-seasons"><thead><tr>{["시즌", "학년", "BF", "IP", "ERA", "H", "HR", "BB", "SO", "R", "ER", "WHIP"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{visible.map(s => <PitchingRow key={s.year} label={String(s.year)} records={s.records} season={s} ended={ended} />)}</tbody>
          <tfoot><PitchingRow label="합계" records={total} ended={ended} /></tfoot>
        </table>
      </div>
      {!total.pitching.outs && <p className="empty-note">선택한 시즌에 투구 아웃 기록이 없습니다. ERA·WHIP는 미평가로 표시됩니다.</p>}
      <p className="records-caption">BF 상대 타자 · IP 이닝 · ERA 평균자책점 · H 피안타 · HR 피홈런 · BB 볼넷 · SO 탈삼진 · R 실점 · ER 자책점. 5.2이닝은 5이닝 2아웃입니다.</p>
    </section>
    <div className="info-box">통산 비율 기록은 모든 시즌의 실제 타수·타석·투구 아웃을 합산해 계산합니다. 플레이 이전의 시즌 기록은 제공하지 않으며, 투수 개인 승·패·세이브는 현재 집계하지 않습니다.</div>
  </div>;
}
