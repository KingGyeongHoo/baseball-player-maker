"use client";
import {useState} from "react";
import {formatInnings} from "../../lib/player-records";
import type {GameState,ProLevel} from "../../lib/sim/types";
import type {ProIndividualAward,ProSeasonArchive} from "../../lib/sim/pro-types";
import {SeasonAwards} from "./pro-awards";
import ProAllstar from "./pro-allstar";
import {ProAllstarHonors} from "./pro-career-panels";
import {individualTitleName} from '../../lib/sim/pro-individual-awards';

export function awardValueText(row:ProIndividualAward){
  return row.format==="innings"?formatInnings(row.value):row.format==="percent"?`${(row.value*100).toFixed(1)}%`:row.format==="decimal"?row.value.toFixed(2):row.format==="rate"?row.value.toFixed(3).replace(/^0\./,'.'):String(row.value);
}
export function IndividualAwards({state,season,onRecords}:{state:GameState;season?:ProSeasonArchive;onRecords:(id:string)=>void}){
  const [level,setLevel]=useState<ProLevel>('first'),[field,setField]=useState<'batting'|'pitching'>('batting');
  const rows=season?.individualAwards?.filter(row=>row.level===level&&row.field===field&&individualTitleName(row)).map(row=>({...row,label:individualTitleName(row)!}))??[];
  return <section className="panel"><div className="panel-heading"><h2>개인 수상 · 항목별 1위</h2></div><div className="career-panel-body">
    <div className="awards-filters"><div className="segmented" aria-label="개인 수상 리그">{(['first','second'] as const).map(key=><button key={key} aria-pressed={level===key} className={level===key?'selected':''} onClick={()=>setLevel(key)}>{key==='first'?'1군':'2군'}</button>)}</div><div className="segmented" aria-label="개인 수상 분야">{(['batting','pitching'] as const).map(key=><button key={key} aria-pressed={field===key} className={field===key?'selected':''} onClick={()=>setField(key)}>{key==='batting'?'타자':'투수'}</button>)}</div></div>
    {rows.length?<div className="table-scroll"><table><thead><tr><th>수상 항목</th><th>1위 선수</th><th>소속</th><th>기록</th></tr></thead><tbody>{rows.flatMap(row=>row.winners.map(winner=><tr key={`${row.metric}:${winner.playerId}`} className={winner.playerId===state.playerId?'my-player-row':''}><th scope="row">{row.label}{row.winners.length>1&&<small> · 공동 1위</small>}</th><td>{state.players.some(p=>p.id===winner.playerId)?<button className="player-name-button" onClick={()=>onRecords(winner.playerId)}>{winner.playerName}</button>:winner.playerName}</td><td>{state.teams[winner.club]?.name.replace(/ 1군$/,'')??'—'}</td><td><b>{awardValueText(row)}</b></td></tr>))}</tbody></table></div>:<p className="empty-note">{season?'규정 기록을 충족한 수상자가 없거나 이 시즌의 개인 수상 기록이 없습니다.':'시즌 종료 후 항목별 1위 선수가 확정됩니다.'}</p>}
    <p className="micro muted">정규리그 기록만 반영합니다. 타격 비율 기록은 규정 타석, 투구 비율 기록·홀드·세이브는 규정 이닝을 충족해야 합니다. 선발은 1군 144이닝·2군 117이닝, 불펜은 1군 48이닝·2군 39이닝이며 동률은 공동 1위로 표시합니다.</p>
  </div></section>;
}
export default function ProAwardsHub({state,onRecords}:{state:GameState;onRecords:(id:string)=>void}){
  const [category,setCategory]=useState('allstar'),[year,setYear]=useState(state.calendar.seasonYear);
  const seasons=state.proWorld?.seasons??[],years=[...new Set([state.calendar.seasonYear,...seasons.map(row=>row.year)])].sort((a,b)=>b-a),season=seasons.find(row=>row.year===year);
  const viewState=year===state.calendar.seasonYear?state:{...state,calendar:{...state.calendar,seasonYear:year},proWorld:state.proWorld?{...state.proWorld,allstar:season?.allstar}:undefined};
  const selectCategory=(key:string)=>{setCategory(key);if(key!=='allstar'&&!season&&seasons.length)setYear(seasons.at(-1)!.year);};
  return <div className="pro-awards-hub"><div className="section-intro"><div><span className="eyebrow">SEASON AWARDS</span><h1>어워드</h1><p>올스타와 한 시즌을 빛낸 선수들</p></div><label className="awards-year">시즌<select aria-label="어워드 시즌" value={year} onChange={event=>setYear(Number(event.target.value))}>{years.map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
    <div className="segmented awards-category-tabs" aria-label="어워드 종류">{[['allstar','올스타'],['gold','골든글러브'],['individual','개인 수상']].map(([key,label])=><button key={key} className={category===key?'selected':''} aria-pressed={category===key} onClick={()=>selectCategory(key)}>{label}</button>)}</div>
    {category==='allstar'&&<>{year!==state.calendar.seasonYear&&!season?.allstar?<p className="empty-note">이 시즌의 올스타 기록이 없습니다.</p>:<ProAllstar key={year} state={viewState} onRecords={onRecords}/>}<ProAllstarHonors state={state}/></>}
    {category==='gold'&&<section className="panel"><div className="panel-heading"><h2>{year} 골든글러브</h2></div><div className="career-panel-body">{season?.awardsCeremony?.presentedAt?<SeasonAwards state={state} season={season}/>:<p className="empty-note">{season?.awardsCeremony?`${season.awardsCeremony.scheduledAt} 시상식에서 리그 MVP와 포지션별 수상자를 발표합니다.`:'시즌 종료 후 12월 시상식에서 수상자를 발표합니다.'}</p>}</div></section>}
    {category==='individual'&&<IndividualAwards key={year} state={state} season={season} onRecords={onRecords}/>}
  </div>;
}
