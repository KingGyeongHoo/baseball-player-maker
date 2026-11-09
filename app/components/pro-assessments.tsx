import { getPlayer } from "../../lib/sim/engine";
import {
  assessmentValue,
  renewalAssessment,
} from "../../lib/sim/pro-assessment";
import { proContractRules } from "../../lib/sim/pro-contract-rules";
import { salaryQuote } from "../../lib/sim/pro-market";
import { rosterGrade } from "../../lib/roster-grades";
import type { GameState } from "../../lib/sim/types";
const scoreText = (value: number | null) =>
  value === null ? "—" : value.toFixed(1);
export default function ProAssessments({ state }: { state: GameState }) {
  const p = getPlayer(state),
    rows = p.professional?.assessments ?? [],
    year = state.calendar.seasonYear,
    value = assessmentValue(p, year),
    renewal = renewalAssessment(p, year),
    frozen = rows.some((row) => row.year === year);
  return (
    <section
      className="contract-assessments"
      aria-label="누적 출전평가와 연봉 기준"
    >
      <h3>올해와 누적 출전평가</h3>
      <div className="assessment-metrics">
        <div>
          <span>올해 평가 {frozen ? "확정" : "진행 중"}</span>
          <b>
            {value.current === null
              ? "미평가"
              : `${scoreText(value.current)} · ${rosterGrade(value.current, true)}`}
          </b>
        </div>
        <div>
          <span>
            누적 평균 · {rows.filter((row) => row.score !== null).length}개 평가
            시즌
          </span>
          <b>
            {value.cumulative === null
              ? "—"
              : `${scoreText(value.cumulative)} · ${rosterGrade(value.cumulative, true)}`}
          </b>
        </div>
        <div>
          <span>평가 기반 기준 연봉</span>
          <b>
            {Math.trunc(salaryQuote(p, year) / 10_000).toLocaleString()}만 원
          </b>
        </div>
      </div>
      <p className="micro muted">
        올해 {proContractRules.currentWeight * 100}% + 누적 평균{" "}
        {proContractRules.cumulativeWeight * 100}%. 결산 점수는 시즌당 한 번
        확정되며 미평가 시즌은 평균에서 제외합니다. 실제 제안은 예산·등록
        신분·재협상 조건에 따릅니다. 기존 보장 계약과 수령액은 유지됩니다. 1군
        연 20경기 이하 또는 최초 3시즌을 제외한 누적 평가 E 이하가 각각
        나이·성장에 따라 3~5시즌 지속되면 방출합니다. 잔류군·신고선수 3시즌 지속
        방출도 적용합니다.
      </p>
      <p className="contract-assessment-notice">
        재계약 판정용 누적 · 최초 {proContractRules.rookieGraceSeasons}시즌 제외
        ·{" "}
        {renewal.score === null
          ? "평가 대기"
          : `${scoreText(renewal.score)} · ${renewal.grade} · ${renewal.seasons}개 평가 시즌`}
      </p>
      {p.professional?.nonRenewal && (
        <p className="contract-assessment-notice">
          {p.professional.nonRenewal.year} 판정 ·{" "}
          {p.professional.nonRenewal.reason}
        </p>
      )}
      {p.professional?.developmentalRetry &&
        p.proContract?.status === "developmental" && (
          <p className="contract-assessment-notice">
            신고 재영입 기한: {p.professional.developmentalRetry.deadlineYear}{" "}
            시즌 종료 · 정식 전환 실패 시 방출
          </p>
        )}
      {rows.length > 0 && (
        <details>
          <summary>시즌별 확정 평가 ({rows.length}시즌)</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>시즌</th>
                  <th>출전평가</th>
                  <th>등급</th>
                  <th>1군 출전경기</th>
                  <th>누적 평균</th>
                  <th>누적 등급</th>
                  <th>재계약 판정용 누적</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td>{scoreText(row.score)}</td>
                    <td>{row.grade}</td>
                    <td>{row.firstGames ?? "—"}</td>
                    <td>{scoreText(row.cumulative)}</td>
                    <td>{row.cumulativeGrade}</td>
                    <td>
                      {scoreText(renewalAssessment(p, row.year).score)} ·{" "}
                      {renewalAssessment(p, row.year).grade}
                    </td>
                    <td>
                      {row.firstTeam
                        ? "1군 등록"
                        : row.secondOnly
                          ? "2군 잔류"
                          : row.reserveSeason
                            ? "잔류·신고 지속"
                            : "일반"}
                      {row.source === "reconstructed"
                        ? " · 과거 자료 복원"
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
