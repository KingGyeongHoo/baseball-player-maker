import {formatInnings} from '../../lib/player-records';
import {hasRunsTitle,individualAwardRows,individualAwardMetrics,recoverRunsTitle} from '../../lib/sim/pro-individual-awards';
import type {GameState,ProLevel} from '../../lib/sim/types';
import type {ProIndividualAward,ProSeasonArchive} from '../../lib/sim/pro-types';

export function awardValueText(row:ProIndividualAward){
  return row.format==='innings'?formatInnings(row.value):row.format==='percent'?`${(row.value*100).toFixed(1)}%`:row.format==='decimal'?row.value.toFixed(2):row.format==='rate'?row.value.toFixed(3).replace(/^0\./,'.'):String(row.value);
}
export function IndividualAwardsTable({state,season,level,field,onRecords,compact=false}:{state:GameState;season?:ProSeasonArchive;level:ProLevel;field:'batting'|'pitching';onRecords?:(id:string)=>void;compact?:boolean}){
  let rows=individualAwardRows(season?.individualAwards,level,field);
  if(season&&field==='batting'&&!hasRunsTitle(season,level)){
    const runs=recoverRunsTitle(state,season,level);
    rows=rows.filter(row=>row.metric!=='R');
    if(runs)rows.push(runs);
  }
  if(compact){
    const units:Record<string,string>={wins:'승',holds:'홀드',saves:'세이브',SO:'탈삼진',H:'안타',HR:'홈런',RBI:'타점',R:'득점',SB:'도루'};
    const displayRows=individualAwardMetrics()[field].flatMap(metric=>{
      const matches=rows.filter(row=>row.metric===metric.id);
      return matches.length?matches:[{level,field,metric:metric.id,label:metric.label,value:0,winners:[]}];
    });
    return <div className="table-scroll"><table className="title-awards-table"><thead><tr><th>타이틀</th><th>선수</th><th>기록</th></tr></thead><tbody>{displayRows.map((row,index)=><tr key={`${row.metric}:${index}`} className={row.winners.some(winner=>winner.playerId===state.playerId)?"my-player-row":undefined}><th scope="row">{row.metric==='avg'?'타율왕':row.label}{row.winners.length>1&&<small>공동 1위</small>}</th><td>{row.winners.length?row.winners.map(winner=><div className="title-award-winner" key={winner.playerId}>{onRecords&&state.players.some(p=>p.id===winner.playerId)?<button className="player-name-button" onClick={()=>onRecords(winner.playerId)}>{winner.playerName}</button>:<b>{winner.playerName}</b>}<small>{state.teams[winner.club]?.name.replace(/ 1군$/,'')??'—'}</small></div>):<span className="muted">{season?'기록 없음':'미정'}</span>}</td><td><b>{row.winners.length?`${awardValueText(row)}${units[row.metric]??''}`:'—'}</b></td></tr>)}</tbody></table></div>;
  }
  return rows.length?<div className="table-scroll"><table><thead><tr><th>수상 항목</th><th>1위 선수</th><th>소속</th><th>기록</th></tr></thead><tbody>{rows.flatMap(row=>row.winners.map(winner=><tr key={`${row.metric}:${winner.playerId}`} className={winner.playerId===state.playerId?'my-player-row':''}><th scope="row">{row.label}{row.winners.length>1&&<small> · 공동 1위</small>}</th><td>{onRecords&&state.players.some(p=>p.id===winner.playerId)?<button className="player-name-button" onClick={()=>onRecords(winner.playerId)}>{winner.playerName}</button>:winner.playerName}</td><td>{state.teams[winner.club]?.name.replace(/ 1군$/,'')??'—'}</td><td><b>{awardValueText(row)}</b></td></tr>))}</tbody></table></div>:<p className="empty-note">{season?'규정 기록을 충족한 수상자가 없거나 이 시즌의 개인 수상 기록이 없습니다.':'시즌 종료 후 항목별 1위 선수가 확정됩니다.'}</p>;
}
