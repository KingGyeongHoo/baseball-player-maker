import {useState,type CSSProperties} from 'react';
import {formatInnings,recordRates} from "../../lib/player-records";
import type {ProAward,ProSeasonArchive} from "../../lib/sim/pro-types";
import type {GameState,ProLevel} from "../../lib/sim/types";
import {emptyRecord,mergeRecord,positions} from '../../lib/sim/engine';
import {IndividualAwardsTable} from './individual-awards-table';
import Ballpark from './ballpark';

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
const glovePositions=[['CF',50,15],['LF',20,29],['RF',80,29],['SS',31,46],['2B',69,46],['3B',18,64],['1B',82,64],['P',50,65],['DH',18,88],['C',50,88]] as const;

function GoldGlovePlayer({state,award,position,x,y}:{state:GameState;award:ProAward;position:string;x:number;y:number}){
  const records=award.records,rates=records&&recordRates(records);
  const lines=records&&rates?(award.field==='pitching'||position==='투수'?
    [`${formatInnings(records.pitching.outs)}이닝 · ERA ${rate(rates.era,2)}`,`${records.pitching.SO}탈삼진`]:
    [`타율 ${rate(rates.average).replace(/^0(?=\.)/,'')} · ${records.batting.HR}홈런`,`${records.batting.H}안타 · ${records.batting.RBI}타점`]):[];
  return <div className={`gold-glove-player${award.playerId===state.playerId?' gold-glove-player-mine':''}`}
    style={{'--field-x':`${x}%`,'--field-y':`${y}%`} as CSSProperties}>
    <span className="gold-glove-position">{position}</span>
    <b>{award.playerName}{award.playerId===state.playerId&&<small>나</small>}</b>
    <span className="gold-glove-club">{state.teams[award.club]?.name.replace(/ 1군$/,"")??'—'}</span>
    <span className="gold-glove-record" title={records?awardRecordText(award):undefined}>
      {lines.length?lines.map(line=><span key={line}>{line}</span>):'기록 없음'}
    </span>
  </div>;
}

export function GoldGloveAwards({state,season}:{state:GameState;season:ProSeasonArchive}){
  const rows=season.awards.filter(row=>row.category==='goldGlove');
  if(!rows.length)return <p className="empty-note">골든글러브 수상자가 없습니다.</p>;
  const find=(position:'P'|keyof typeof positions)=>rows.find(row=>row.position===position||!row.position&&row.kind===`골든글러브 · ${position==='P'?'투수':positions[position]}`);
  return <section className="gold-glove-lineup" aria-label="골든글러브 포지션별 수상자">
    <div className="gold-glove-field">
      <Ballpark showCaption={false} stretch/>
      {glovePositions.map(([position,x,y])=>{
        const award=find(position);
        return award&&<GoldGlovePlayer key={position} state={state} award={award} position={position==='P'?'투수':positions[position]} x={x} y={y}/>;
      })}
    </div>
  </section>;
}

export function SeasonAwards({state,season,showTitles=false}:{state:GameState;season:ProSeasonArchive;showTitles?:boolean}){
  const [level,setLevel]=useState<ProLevel>('first');
  const cards=[
    {label:'1군 MVP',award:season.awards.find(row=>row.category==='mvp'&&(row.level??'first')==='first')},
    {label:'2군 MVP',award:season.awards.find(row=>row.category==='mvp'&&row.level==='second')},
    {label:'신인상',award:season.awards.find(row=>row.category==='rookie')},
  ];
  return <div className="season-awards">
    {cards.map(({label,award})=>award||showTitles?<div key={label} className={`awards-mvp${award?.playerId===state.playerId?' awards-mine':''}`}><span>{label}</span>{award?<><h3>{award.playerName}{award.playerId===state.playerId&&<small>나의 선수</small>}</h3><p>{state.teams[award.club]?.name.replace(/ 1군$/,"")}</p><p>{awardRecordText(award)}</p></>:<p className="empty-note">수상자 없음</p>}</div>:null)}
    {showTitles&&<>
      <div className="segmented" aria-label="타이틀홀더 리그">{(['first','second'] as const).map(key=><button type="button" key={key} aria-pressed={level===key} className={level===key?'selected':''} onClick={()=>setLevel(key)}>{key==='first'?'1군':'2군'}</button>)}</div>
      <div className="title-award-columns">{(['pitching','batting'] as const).map(field=><section className="title-award-field" key={field}>
        <h3>{field==='pitching'?'투수 타이틀홀더':'타자 타이틀홀더'}</h3>
        <IndividualAwardsTable state={state} season={season} level={level} field={field} compact/>
      </section>)}</div>
    </>}
  </div>;
}
