import {useState} from 'react';
import NationalTournamentView from './national-tournament';
import {positions,emptyRecord} from '../../lib/sim/engine';
import {recordRates,formatInnings} from '../../lib/player-records';
import {nationalRules} from '../../lib/sim/national-teams';
import type {GameState,Position} from '../../lib/sim/types';

const order:Position[]=['SP','RP','CP','C','1B','2B','3B','SS','LF','CF','RF','DH'];
const rate=(n:number|null,digits=3)=>n===null?'—':n.toFixed(digits).replace(/^0\./,'.');
export default function NationalRosters({state,onRecords,initialField='pitching'}:{state:GameState;onRecords:(id:string)=>void;initialField?:'pitching'|'batting'}){
  const rows=[...(state.nationalTeams??[])].sort((a,b)=>b.start.localeCompare(a.start));
  const [selected,setSelected]=useState('latest'),[field,setField]=useState<'pitching'|'batting'>(initialField);
  const entry=rows.find(row=>row.year+'-'+row.kind===selected)??rows[0];
  const members=entry?.tournament?entry.tournament.countries[0].players.map(p=>({id:p.id,name:p.name,position:p.position,team:entry.roster.find(r=>r.id===p.id)?.team??state.teams[state.players.find(r=>r.id===p.id)?.teamId??-1]?.name??'—',records:p.records})):entry?.roster.map(p=>({...p,records:emptyRecord()}))??[];
  const visible=members.filter(p=>(['SP','RP','CP'].includes(p.position)?'pitching':'batting')===field).sort((a,b)=>order.indexOf(a.position)-order.indexOf(b.position)||a.name.localeCompare(b.name,'ko'));
  const headers=field==='pitching'?['이름','포지션','소속팀','출전경기','이닝','승','패','홀드','세이브','ERA']:['이름','포지션','소속팀','출전경기','타수','안타','홈런','타점','타율','OPS'];
  return <section className="panel national-rosters" aria-label="국제대회 순위와 대한민국 대표팀">
    <div className="panel-heading"><h2>순위·대진표</h2>{rows.length>0&&<label>대회 <select value={entry?entry.year+'-'+entry.kind:''} onChange={event=>setSelected(event.target.value)}>{rows.map(row=><option key={row.year+'-'+row.kind} value={row.year+'-'+row.kind}>{row.year} {nationalRules[row.kind].name}</option>)}</select></label>}</div>
    {!entry?<p className="empty-note">아직 발표된 국가대표 명단이 없습니다. 대회 선발 시 이곳에 기록됩니다.</p>:<>
      <p className="draft-board-note">{entry.year} {nationalRules[entry.kind].name} · {entry.start}~{entry.end}</p>
      <NationalTournamentView key={entry.year+'-'+entry.kind} entry={entry}/>
      <div className="panel-heading"><h2>대한민국 대표팀</h2><div className="segmented small-segment"><button className={field==='pitching'?'selected':''} onClick={()=>setField('pitching')}>투수</button><button className={field==='batting'?'selected':''} onClick={()=>setField('batting')}>타자</button></div></div>
      <div className="table-scroll"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(p=>{const r=p.records,rates=recordRates(r),counts=r.games??{};return <tr key={p.id} className={p.id===state.playerId?'my-player-row':''}><td>{state.players.some(row=>row.id===p.id)?<button className="player-name-button" onClick={()=>onRecords(p.id)}>{p.name}</button>:p.name}</td><td>{positions[p.position]}</td><td>{p.team}</td>{field==='pitching'?<><td>{counts.pitching??0}</td><td>{formatInnings(r.pitching.outs)}</td><td>{counts.wins??0}</td><td>{counts.losses??0}</td><td>{counts.holds??0}</td><td>{counts.saves??0}</td><td>{rate(rates.era,2)}</td></>:<><td>{counts.batting??0}</td><td>{r.batting.AB}</td><td>{r.batting.H}</td><td>{r.batting.HR}</td><td>{r.batting.RBI}</td><td>{rate(rates.average)}</td><td>{rate(rates.ops)}</td></>}</tr>;})}</tbody></table></div>
    </>}
  </section>;
}
