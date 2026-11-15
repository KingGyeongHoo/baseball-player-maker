import {formatInnings} from '../../lib/player-records';
import {individualAwardRows} from '../../lib/sim/pro-individual-awards';
import type {GameState,ProLevel} from '../../lib/sim/types';
import type {ProIndividualAward,ProSeasonArchive} from '../../lib/sim/pro-types';

export function awardValueText(row:ProIndividualAward){
  return row.format==='innings'?formatInnings(row.value):row.format==='percent'?`${(row.value*100).toFixed(1)}%`:row.format==='decimal'?row.value.toFixed(2):row.format==='rate'?row.value.toFixed(3).replace(/^0\./,'.'):String(row.value);
}
export function IndividualAwardsTable({state,season,level,field,onRecords}:{state:GameState;season?:ProSeasonArchive;level:ProLevel;field:'batting'|'pitching';onRecords?:(id:string)=>void}){
  const rows=individualAwardRows(season?.individualAwards,level,field);
  return rows.length?<div className="table-scroll"><table><thead><tr><th>수상 항목</th><th>1위 선수</th><th>소속</th><th>기록</th></tr></thead><tbody>{rows.flatMap(row=>row.winners.map(winner=><tr key={`${row.metric}:${winner.playerId}`} className={winner.playerId===state.playerId?'my-player-row':''}><th scope="row">{row.label}{row.winners.length>1&&<small> · 공동 1위</small>}</th><td>{onRecords&&state.players.some(p=>p.id===winner.playerId)?<button className="player-name-button" onClick={()=>onRecords(winner.playerId)}>{winner.playerName}</button>:winner.playerName}</td><td>{state.teams[winner.club]?.name.replace(/ 1군$/,'')??'—'}</td><td><b>{awardValueText(row)}</b></td></tr>))}</tbody></table></div>:<p className="empty-note">{season?'규정 기록을 충족한 수상자가 없거나 이 시즌의 개인 수상 기록이 없습니다.':'시즌 종료 후 항목별 1위 선수가 확정됩니다.'}</p>;
}
