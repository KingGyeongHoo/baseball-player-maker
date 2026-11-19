"use client";
import {useState} from "react";
import type {GameState,ProLevel} from "../../lib/sim/types";
import type {ProSeasonArchive} from "../../lib/sim/pro-types";
import {GoldGloveAwards,SeasonAwards,seriesAwardRecordText} from "./pro-awards";
import ProAllstar from "./pro-allstar";
import {IndividualAwardsTable} from './individual-awards-table';
export {awardValueText} from './individual-awards-table';
import {seriesMvpNames} from '../../lib/sim/pro-series-awards';
import {farmSeriesMvpNames} from '../../lib/sim/pro-series-awards';
import {getPlayer} from '../../lib/sim/engine';

export function PostseasonAwards({state,year,onRecords,initialLevel}:{state:GameState;year:number;onRecords:(id:string)=>void;initialLevel?:ProLevel}){
  const [level,setLevel]=useState<ProLevel>(initialLevel??(getPlayer(state).teamId>=10?'second':'first'));
  const archived=state.proWorld?.seasons.find(row=>row.year===year)?.awards.filter(row=>row.category==='seriesMvp')??[];
  const live=state.proWorld?.year===year?[...(state.proWorld.postseason?.series??[]),...(state.proWorld.farmPostseason?.series??[])].flatMap(series=>series.mvp?[series.mvp]:[]):[];
  const stored=state.proWorld?.seasons.find(row=>row.year===year)?.farmPostseason?.series.flatMap(series=>series.mvp?[series.mvp]:[])??[];
  const rows=[...new Map([...archived,...stored,...live].filter(award=>(award.level??'first')===level).map(award=>[award.seriesId??award.series,award])).values()];
  const cards=level==='second'?Object.entries(farmSeriesMvpNames):Object.entries(seriesMvpNames);
  return <section className="panel"><div className="panel-heading awards-panel-heading"><h2>{year} 포스트시즌 MVP</h2><div className="segmented" aria-label="포스트시즌 MVP 리그">{(['first','second'] as const).map(key=><button key={key} aria-pressed={level===key} className={level===key?'selected':''} onClick={()=>setLevel(key)}>{key==='first'?'1군':'2군'}</button>)}</div></div><div className="career-panel-body"><div className={`postseason-rounds series-awards-grid${level==='second'?' legacy-bracket':''}`}>{cards.map(([id,label])=>{
    const award=rows.find(row=>level==='second'?row.seriesId===id:row.series===id);
    return <article key={id} className={`postseason-round series-award-card${award?.playerId===state.playerId?' awards-mine':''}`}><h3>{label}</h3>{award?<><b>{state.players.some(p=>p.id===award.playerId)?<button className="player-name-button" onClick={()=>onRecords(award.playerId)}>{award.playerName}</button>:award.playerName}</b><p>{state.teams[award.club]?.name.replace(/ 1군$/,'')}</p><p className="series-award-record">{seriesAwardRecordText(state,award)}</p></>:<p className="muted">시리즈 종료 후 발표</p>}</article>;
  })}</div></div></section>;
}

export function IndividualAwards({state,season,onRecords}:{state:GameState;season?:ProSeasonArchive;onRecords:(id:string)=>void}){
  const [level,setLevel]=useState<ProLevel>('first');
  return <section className="panel"><div className="panel-heading awards-panel-heading"><h2>타이틀</h2><div className="segmented" aria-label="타이틀 리그">{(['first','second'] as const).map(key=><button key={key} aria-pressed={level===key} className={level===key?'selected':''} onClick={()=>setLevel(key)}>{key==='first'?'1군':'2군'}</button>)}</div></div><div className="career-panel-body title-award-columns">{(['pitching','batting'] as const).map(field=><section className="title-award-field" key={field} aria-label={field==='pitching'?'투수 타이틀':'타자 타이틀'}><h3>{field==='pitching'?'투수':'타자'}</h3><IndividualAwardsTable state={state} season={season} level={level} field={field} onRecords={onRecords} compact/></section>)}</div></section>;
}
export default function ProAwardsHub({state,onRecords}:{state:GameState;onRecords:(id:string)=>void}){
  const [category,setCategory]=useState('allstar'),[year,setYear]=useState(state.calendar.seasonYear);
  const seasons=state.proWorld?.seasons??[],years=[...new Set([state.calendar.seasonYear,...seasons.map(row=>row.year)])].sort((a,b)=>b-a),season=seasons.find(row=>row.year===year);
  const viewState=year===state.calendar.seasonYear?state:{...state,calendar:{...state.calendar,seasonYear:year},proWorld:state.proWorld?{...state.proWorld,allstar:season?.allstar}:undefined};
  const selectCategory=(key:string)=>{setCategory(key);if(key!=='allstar'&&key!=='postseason'&&!season&&seasons.length)setYear(seasons.at(-1)!.year);};
  return <div className="pro-awards-hub"><div className="section-intro"><div><span className="eyebrow">SEASON AWARDS</span><h1>어워드</h1><p>올스타와 한 시즌을 빛낸 선수들</p></div><label className="awards-year">시즌<select aria-label="어워드 시즌" value={year} onChange={event=>setYear(Number(event.target.value))}>{years.map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
    <div className="segmented awards-category-tabs" aria-label="어워드 종류">{[['allstar','올스타'],['gold','골든글러브'],['individual','타이틀'],['postseason','포스트시즌 MVP']].map(([key,label])=><button key={key} className={category===key?'selected':''} aria-pressed={category===key} onClick={()=>selectCategory(key)}>{label}</button>)}</div>
    {category==='allstar'&&(year!==state.calendar.seasonYear&&!season?.allstar?<p className="empty-note">이 시즌의 올스타 기록이 없습니다.</p>:<ProAllstar key={year} state={viewState} onRecords={onRecords}/>)}
    {category==='gold'&&<section className="panel"><div className="panel-heading"><h2>{year} 골든글러브</h2></div><div className="career-panel-body">{season?.awardsCeremony?.presentedAt?<><SeasonAwards state={state} season={season}/><GoldGloveAwards state={state} season={season}/></>:<p className="empty-note">{season?.awardsCeremony?`${season.awardsCeremony.scheduledAt} 시상식에서 포지션별 골든글러브 수상자를 발표합니다.`:'시즌 종료 후 12월 시상식에서 수상자를 발표합니다.'}</p>}</div></section>}
    {category==='individual'&&<IndividualAwards key={year} state={state} season={season} onRecords={onRecords}/>}
    {category==='postseason'&&<PostseasonAwards state={state} year={year} onRecords={onRecords}/>}
  </div>;
}
