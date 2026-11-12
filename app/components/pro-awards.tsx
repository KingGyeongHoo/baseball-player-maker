import {formatInnings,recordRates} from "../../lib/player-records";
import type {ProAward,ProSeasonArchive} from "../../lib/sim/pro-types";
import type {GameState} from "../../lib/sim/types";

const rate=(n:number|null,digits=3)=>n===null?"—":n.toFixed(digits);
export function awardRecordText(award:ProAward){
  const r=award.records;if(!r)return "시즌 기록 보관";
  const rates=recordRates(r);
  return award.field==="pitching"?`${formatInnings(r.pitching.outs)}이닝 · ${r.pitching.SO}K · ERA ${rate(rates.era,2)} · ${r.games?.wins??0}승 ${r.games?.holds??0}홀드 ${r.games?.saves??0}세이브`
    :`${r.batting.AB}타수 · ${r.batting.H}안타 · ${r.batting.HR}홈런 · ${r.batting.RBI}타점 · 타율 ${rate(rates.average)} · OPS ${rate(rates.ops)}`;
}
export function SeasonAwards({state,season}:{state:GameState;season:ProSeasonArchive}){
  const rows=season.awards.filter(row=>row.category==="mvp"||row.category==="goldGlove"),mvp=rows.find(row=>row.category==="mvp");
  return <div className="season-awards">
    {mvp&&<div className={`awards-mvp ${mvp.playerId===state.playerId?'awards-mine':''}`}><span>SEASON MVP</span><h3>{mvp.playerName}{mvp.playerId===state.playerId&&<small>나의 선수</small>}</h3><p>{state.teams[mvp.club]?.name.replace(/ 1군$/,"")}</p><p>{awardRecordText(mvp)}</p></div>}
    <h3>골든글러브 수상자</h3><div className="table-scroll"><table><thead><tr><th>부문</th><th>선수</th><th>소속</th><th>시즌 기록</th></tr></thead><tbody>{rows.filter(row=>row.category==="goldGlove").map(row=><tr key={row.position} className={row.playerId===state.playerId?'my-player-row':''}><th scope="row">{row.kind.replace('골든글러브 · ','')}</th><td><b>{row.playerName}</b>{row.playerId===state.playerId&&' · 나'}</td><td>{state.teams[row.club]?.name.replace(/ 1군$/,"")??'—'}</td><td>{awardRecordText(row)}</td></tr>)}</tbody></table></div>
    <details className="awards-rules"><summary>기록 평가 기준</summary><p>1군 정규시즌만 평가합니다. 규정 타석 기준은 골든글러브 200, MVP 100입니다. 투수는 30이닝 이상이 대상입니다. 해당 부문에 적격 선수가 없으면 수상자를 비워 둡니다.</p><p>야수는 리그 대비 OPS·출전량·홈런·타점, 투수는 리그 대비 ERA·이닝·탈삼진·볼넷으로 평가합니다. MVP는 타자·투수 분야별 상대 성과와 출전량을 비교합니다. 능력치·평판·출전평가·팀 승수는 반영하지 않습니다.</p><p>야수 부문은 가장 많이 선발 출전한 수비 위치로 정합니다. 수비 기록을 따로 집계하지 않으므로 수비 능력치를 수상 점수에 대신 넣지 않습니다.</p></details>
  </div>;
}
