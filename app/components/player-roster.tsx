"use client";
import { memo, useMemo, useState } from "react";
import {
  draftProjection,
  getPlayer,
  isPitcher,
  ovr,
  positionLabel,
} from "../../lib/sim/engine";
import { scoreText } from "../../lib/display";
import { rosterAssignments } from "../../lib/roster-status";
import {
  compareRosterPlayers,
  rosterFieldMember,
  rosterGradeScore,
  rosterLevelMember,
  rosterMetrics,
  rosterRecords,
  type RosterField,
  type RosterLevel,
} from "../../lib/roster-records";
import type { DraftPick, GameState, Player } from "../../lib/sim/types";
import { dashboardRecordValues } from "./dashboard-records";
import DraftRoundBadge from "./draft-round-badge";
import { proSquad } from "../../lib/sim/pro-squads";
import Tooltip from "./tooltip";
import GradeBadge from "./grade-badge";

const rosterScoreText = (score: number | null | undefined) => score != null && Number.isFinite(score) ? score.toFixed(1) : "—";

export function PlayerGrade({
  player,
  pro = player.careerMode === "pro",
}: {
  player: Player;
  pro?: boolean;
  state?:GameState;
}) {
  const score = rosterGradeScore(player, pro),
    source = pro ? "출전평가" : "평판";
  return (
    <Tooltip
      content={
        <>
          <strong>
            {source} 점수 {score == null ? "—" : score.toFixed(1)}/100
          </strong>
        </>
      }
    >
      <GradeBadge score={score} pro={pro} label={source}/>
    </Tooltip>
  );
}

export function RosterTable({
  state,
  players,
  field,
  level = "total",
  onSelect,
  selectedId,
  assignments,
  projections,
  sort,
  onSort,
}: {
  state: GameState;
  players: Player[];
  field: RosterField;
  level?: RosterLevel;
  onSelect: (id: string) => void;
  selectedId?: string;
  assignments?: Map<string, unknown>;
  projections?: Map<string, DraftPick>;
  sort?: string;
  onSort?: (sort: string) => void;
}) {
  const pro = state.careerMode === "pro",
    metrics = rosterMetrics[field];
  return (
    <div className="table-scroll roster-table roster-records-table">
      <table>
        <thead>
          <tr>
            <th>선수</th>
            <th aria-sort={sort === "ovr" ? "descending" : undefined}>
              {onSort ? (
                <button className="roster-sort" onClick={() => onSort("ovr")}>
                  OVR{sort === "ovr" ? " ↓" : ""}
                </button>
              ) : (
                "OVR"
              )}
            </th>
            <th aria-sort={sort === "grade" ? "descending" : undefined}>
              {onSort ? (
                <button className="roster-sort" onClick={() => onSort("grade")}>
                  등급{sort === "grade" ? " ↓" : ""}
                </button>
              ) : (
                "등급"
              )}
            </th>
            <th>{pro ? "소속" : "학교"}</th>
            <th>{pro ? "나이" : "학년"}</th>
            <th>포지션</th>
            {metrics.map((m) => (
              <th
                key={m.id}
                aria-sort={
                  sort === m.id
                    ? m.ascending
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {onSort ? (
                  <button className="roster-sort" onClick={() => onSort(m.id)}>
                    {m.label}
                    {sort === m.id ? (m.ascending ? " ↑" : " ↓") : ""}
                  </button>
                ) : (
                  m.label
                )}
              </th>
            ))}
            <th>{pro ? "출전평가" : "평판"}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr
              key={p.id}
              className={[
                p.id === state.playerId ? "my-player-row" : "",
                p.id === selectedId ? "selected-row" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <td>
                <button
                  className="player-name-button"
                  onClick={() => onSelect(p.id)}
                >
                  {p.name}
                  {p.jerseyNumber !== undefined && (
                    <small className="roster-number">#{p.jerseyNumber}</small>
                  )}
                  {projections?.has(p.id) ? (
                    <DraftRoundBadge
                      round={projections.get(p.id)!.round}
                      forecast={state.phase !== "ended"}
                    />
                  ) : (
                    assignments && (
                      <small
                        className={`roster-badge ${assignments.has(p.id) ? "starter" : "reserve"}`}
                      >
                        {p.teamId < 0
                          ? "무소속"
                          : pro && p.teamId >= 30
                            ? "육성"
                            : pro && p.teamId >= 20
                              ? "잔류"
                              : assignments.has(p.id)
                                ? "주전"
                                : "후보"}
                      </small>
                    )
                  )}
                </button>
              </td>
              <td title={field === "pitching" ? "투수 오버롤" : "타자 오버롤"}>
                <b>{scoreText(ovr(p, field === "pitching"))}</b>
              </td>
              <td>
                <PlayerGrade player={p} pro={pro}/>
              </td>
              <td>{state.teams[p.teamId]?.name ?? "무소속"}</td>
              <td>{pro ? (p.age ?? "—") : `${p.grade}학년`}</td>
              <td>{positionLabel(p)}</td>
              {dashboardRecordValues(
                rosterRecords(p, level),
                field === "pitching",
              ).map(([label, value]) => (
                <td key={label}>{value}</td>
              ))}
              <td>
                <b title={pro ? "보직 기량 + 시즌 중심 성적 보정(최대 ±7점) · 피로 감점 없음" : "역할별 능력·경기 성적·이벤트 보너스를 반영한 평판"}>
                  {rosterScoreText(rosterGradeScore(p, pro))}
                </b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!players.length && (
        <p className="empty-note">검색 조건에 맞는 선수가 없습니다.</p>
      )}
    </div>
  );
}

function PlayerRoster({
  state,
  onSelect,
  selectedId,
}: {
  state: GameState;
  onSelect: (id: string) => void;
  selectedId?: string;
}) {
  const mine = getPlayer(state),
    pro = state.careerMode === "pro";
  const [scope, setScope] = useState("team"),
    [field, setField] = useState<RosterField>(
      isPitcher(mine.primaryRole) ? "pitching" : "batting",
    );
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("grade"),
    [level, setLevel] = useState<RosterLevel>(
      pro ? (proSquad(mine.teamId) ?? "total") : "total",
    );
  const assignments = useMemo(
    () =>
      rosterAssignments(
        state.players.filter((p) => p.teamId >= 0 && (!pro || p.teamId < 20)),
      ),
    [state.players, pro],
  );
  const rows = useMemo(() => {
    const club =
      state.postSchool?.pro?.club ??
      (mine.teamId >= 0 ? mine.teamId % 10 : undefined);
    return state.players
      .filter(
        (p) =>
          p.professional?.employment !== "retired" &&
          rosterFieldMember(p, field) &&
          (!pro || rosterLevelMember(p, level)) &&
          (scope === "all" ||
            (pro
              ? p.teamId >= 0 && p.teamId % 10 === club
              : p.teamId === mine.teamId)) &&
          (p.name.includes(query) ||
            (state.teams[p.teamId]?.name ?? "무소속").includes(query)),
      )
      .sort((a, b) =>
        compareRosterPlayers(a, b, field, pro ? level : "total", sort, pro),
      );
  }, [state, mine.teamId, field, level, scope, query, sort, pro]);
  const projections = useMemo(
    () =>
      new Map<string, DraftPick>(
        (!pro && scope === "all"
          ? state.phase === "ended"
            ? state.draftOutcome?.revealed
              ? state.draft
              : []
            : draftProjection(state)
          : []
        ).map((pick) => [pick.playerId, pick]),
      ),
    [state, pro, scope],
  );
  const limit = pro ? 120 : 100;
  return (
    <section className="panel player-roster">
      <div className="panel-heading">
        <h2>
          {scope === "all"
            ? pro
              ? "리그 선수"
              : "전국 고교 선수"
            : pro
              ? "소속 구단 선수"
              : `${state.teams[mine.teamId]?.name ?? "우리 학교"} 로스터`}
        </h2>
        <span className="small muted">{rows.length.toLocaleString()}명</span>
      </div>
      <div className="roster-controls">
        <div className="segmented" aria-label="선수 범위">
          <button
            className={scope === "team" ? "selected" : ""}
            onClick={() => setScope("team")}
          >
            {pro ? "소속 팀" : "우리 학교"}
          </button>
          <button
            className={scope === "all" ? "selected" : ""}
            onClick={() => setScope("all")}
          >
            {pro ? "전체" : "전국"}
          </button>
        </div>
        <div className="segmented" aria-label="투타 구분">
          {(
            [
              ["pitching", "투수"],
              ["batting", "타자"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={field === id ? "selected" : ""}
              onClick={() => {
                setField(id);
                setSort("grade");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {pro && (
          <div
            className="segmented roster-squad-filter"
            aria-label="선수단과 기록"
          >
            {(
              [
                ["first", "1군"],
                ["second", "2군"],
                ["third", "잔류군(3군)"],
                ["developmental", "육성선수"],
                ["total", "전체·시즌 합계"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={level === id ? "selected" : ""}
                onClick={() => setLevel(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <input
          aria-label="선수 검색"
          placeholder={pro ? "선수·팀 검색" : "선수·학교 검색"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="로스터 정렬"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="grade">등급순 ({pro ? "출전평가" : "평판"})</option>
          <option value="ovr">OVR 높은순</option>
          {rosterMetrics[field].map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.ascending ? " 낮은순" : " 높은순"}
            </option>
          ))}
        </select>
      </div>
      <RosterTable
        state={state}
        players={rows.slice(0, limit)}
        field={field}
        level={pro ? level : "total"}
        selectedId={selectedId}
        onSelect={onSelect}
        assignments={pro || scope === "team" ? assignments : undefined}
        projections={!pro && scope === "all" ? projections : undefined}
        sort={sort}
        onSort={setSort}
      />
      <p className="micro muted training-note">
        {rows.length > limit
          ? `${rows.length.toLocaleString()}명 중 상위 ${limit}명 표시 · `
          : ""}
        {pro
          ? "선수를 누르면 연도별 기록을 볼 수 있습니다."
          : "선수를 누르면 상세 능력과 기록을 볼 수 있습니다."}{" "}
        겸업 선수는 두 목록에 표시됩니다.
      </p>
      <details className="roster-grade-guide">
        <summary>등급과 기록 기준</summary>
        <p>
          {pro
            ? "출전평가 등급: S 81 초과 · A 79~81 · B 77~79 미만 · C 75~77 미만 · D 73~75 미만 · E 71~73 미만 · F 71 미만."
            : "평판 등급: S 80 초과 · A 72~80 · B 64~72 미만 · C 56~64 미만 · D 48~56 미만 · E 40~48 미만 · F 40 미만."}
        </p>
        <p>
          {pro
            ? "프로 출전평가는 보직 기량과 시즌 전체 성적이 중심이며 최근 성적은 약하게 반영합니다. 성적 보정은 최대 ±7점이고 피로 감점은 없습니다. WAR는 시즌평가에 사용합니다."
            : "고교 등급은 역할별 능력과 표본을 보정한 경기 성적, 이벤트 보너스를 포함한 평판을 사용합니다."}{" "}
          OVR을 다시 더하지 않습니다. {pro ? "출전평가" : "평판"} 열은 소수 첫째 자리까지 표시하며
          등급도 이 점수로 판정합니다.
        </p>
        <p>
          {pro
            ? "1군은 해당 리그 기록이나 등록 선수를, 2군 경기는 2군·3군 통합 선수단과 실제 출전 기록을 표시합니다. 등급은 선택한 기록 리그와 관계없이 현재 출전평가를 사용합니다. "
            : ""}
          기록은 이번 시즌 정규 기록이며, —는 기록이 없거나 기존 저장에서
          집계되지 않은 값입니다.{" "}
          {pro
            ? "잔류군·육성선수는 자체 경기와 주전·후보 구분 없이 간헐적으로 2군 평가 경기에 출전합니다."
            : "주전·후보는 기본 능력 기준입니다."}
        </p>
      </details>
    </section>
  );
}
export default memo(PlayerRoster);
