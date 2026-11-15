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
  const rows=season.awards.filter(row=>row.category==="mvp"||row.category==="goldGlove"||row.category==='rookie'),mvp=rows.find(row=>row.category==="mvp"),rookie=rows.find(row=>row.category==='rookie');
  return <div className="season-awards">
    {mvp&&<div className={`awards-mvp ${mvp.playerId===state.playerId?'awards-mine':''}`}><span>SEASON MVP</span><h3>{mvp.playerName}{mvp.playerId===state.playerId&&<small>나의 선수</small>}</h3><p>{state.teams[mvp.club]?.name.replace(/ 1군$/,"")}</p><p>{awardRecordText(mvp)}</p></div>}
    {rookie&&<div className={`awards-mvp ${rookie.playerId===state.playerId?'awards-mine':''}`}><span>ROOKIE OF THE YEAR · 신인왕</span><h3>{rookie.playerName}{rookie.playerId===state.playerId&&<small>나의 선수</small>}</h3><p>{state.teams[rookie.club]?.name.replace(/ 1군$/,"")}</p><p>{awardRecordText(rookie)}</p></div>}
    <h3>골든글러브 수상자</h3><div className="table-scroll"><table><thead><tr><th>부문</th><th>선수</th><th>소속</th><th>시즌 기록</th></tr></thead><tbody>{rows.filter(row=>row.category==="goldGlove").map(row=><tr key={row.position} className={row.playerId===state.playerId?'my-player-row':''}><th scope="row">{row.kind.replace('골든글러브 · ','')}</th><td><b>{row.playerName}</b>{row.playerId===state.playerId&&' · 나'}</td><td>{state.teams[row.club]?.name.replace(/ 1군$/,"")??'—'}</td><td>{awardRecordText(row)}</td></tr>)}</tbody></table></div>
  </div>;
}
