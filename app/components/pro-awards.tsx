import {formatInnings,recordRates} from "../../lib/player-records";
import type {ProAward,ProSeasonArchive} from "../../lib/sim/pro-types";
import type {GameState} from "../../lib/sim/types";
import {emptyRecord,mergeRecord} from '../../lib/sim/engine';

const rate=(n:number|null,digits=3)=>n===null?"—":n.toFixed(digits);
export function awardRecordText(award:ProAward){
  const r=award.records;if(!r)return "시즌 기록 보관";
  const rates=recordRates(r);
  return award.field==="pitching"?`${formatInnings(r.pitching.outs)}이닝 · ${r.pitching.SO}탈삼진 · 평균자책점 ${rate(rates.era,2)} · ${r.games?.wins??0}승 ${r.games?.holds??0}홀드 ${r.games?.saves??0}세이브`
    :`${r.batting.AB}타수 · ${r.batting.H}안타 · ${r.batting.HR}홈런 · ${r.batting.RBI}타점 · 타율 ${rate(rates.average)} · OPS ${rate(rates.ops)}`;
}
export function seriesAwardRecordText(state:GameState,award:ProAward){
  const id=award.seriesId??award.series,prefix=award.level==='second'?'pro-farm-playoffs':'pro-playoffs';
  const games=id?state.calendar.events.filter(game=>game.competitionId===`${prefix}-${id}`&&game.date.startsWith(`${award.year}-`)&&game.status==='completed'&&game.boxScore[award.playerId]):[];
  const totals=emptyRecord();for(const game of games)mergeRecord(totals,game.boxScore[award.playerId]);
  const r=award.records??(games.length?totals:undefined);if(!r)return '시리즈 기록이 없습니다.';
  const pitching=award.field?award.field==='pitching':r.pitching.BF>0&&r.batting.PA===0;
  const field=pitching?'pitching':'batting';
  const observed=games.filter(game=>{const record=game.boxScore[award.playerId];return pitching?record.pitching.BF>0:record.batting.PA>0;}).length;
  const count=r.games?.[field]??(observed||null),lead=count===null?'':`${count}경기 · `,rates=recordRates(r);
  return pitching?`${lead}${formatInnings(r.pitching.outs)}이닝 · 평균자책점 ${rate(rates.era,2)} · ${r.pitching.SO}탈삼진 · ${r.games?.wins??0}승 · ${r.games?.holds??0}홀드 · ${r.games?.saves??0}세이브 · WHIP ${rate(rates.whip,2)}`
    :`${lead}${r.batting.AB}타수 · ${r.batting.H}안타 · 타율 ${rate(rates.average)} · ${r.batting.HR}홈런 · ${r.batting.RBI}타점 · OPS ${rate(rates.ops)}`;
}
export function SeasonAwards({state,season}:{state:GameState;season:ProSeasonArchive}){
  const rows=season.awards.filter(row=>row.category==="mvp"||row.category==="goldGlove"||row.category==='rookie'),mvp=rows.find(row=>row.category==="mvp"),rookie=rows.find(row=>row.category==='rookie');
  return <div className="season-awards">
    {mvp&&<div className={`awards-mvp ${mvp.playerId===state.playerId?'awards-mine':''}`}><span>SEASON MVP</span><h3>{mvp.playerName}{mvp.playerId===state.playerId&&<small>나의 선수</small>}</h3><p>{state.teams[mvp.club]?.name.replace(/ 1군$/,"")}</p><p>{awardRecordText(mvp)}</p></div>}
    {rookie&&<div className={`awards-mvp ${rookie.playerId===state.playerId?'awards-mine':''}`}><span>ROOKIE OF THE YEAR · 신인왕</span><h3>{rookie.playerName}{rookie.playerId===state.playerId&&<small>나의 선수</small>}</h3><p>{state.teams[rookie.club]?.name.replace(/ 1군$/,"")}</p><p>{awardRecordText(rookie)}</p></div>}
    <h3>골든글러브 수상자</h3><div className="table-scroll"><table><thead><tr><th>부문</th><th>선수</th><th>소속</th><th>시즌 기록</th></tr></thead><tbody>{rows.filter(row=>row.category==="goldGlove").map(row=><tr key={row.position} className={row.playerId===state.playerId?'my-player-row':''}><th scope="row">{row.kind.replace('골든글러브 · ','')}</th><td><b>{row.playerName}</b>{row.playerId===state.playerId&&' · 나'}</td><td>{state.teams[row.club]?.name.replace(/ 1군$/,"")??'—'}</td><td>{awardRecordText(row)}</td></tr>)}</tbody></table></div>
  </div>;
}
