import {positions} from '../../lib/sim/engine';
import {proClubNames} from '../../lib/sim/club-names';
import {clubStoveMoves,type StoveReport} from '../../lib/sim/stove-report';

import type {Player} from '../../lib/sim/types';

export default function StoveChanges({report,playerId,players}:{report:StoveReport;playerId:string;players?:Player[]}){
  const moves=clubStoveMoves(report.moves,report.club,players);
  const trades=moves.filter(p=>p.direction==='traded'&&p.exchange&&p.otherClub!==undefined);
  const freeAgents=moves.filter(p=>p.direction==='fa');
  const retired=moves.filter(p=>p.direction==='retired');
  function player(p:{id:string;name:string;position:keyof typeof positions}){
    return <><strong className="registration-player-name">{p.name}</strong>{' '}
      <span className="registration-player-position">({positions[p.position]}){p.id===playerId?' · 내 선수':''}</span></>;
  }
  const tradeSection=<section className="registration-column stove-section">
      <h3>트레이드 {trades.length}건</h3>
      {trades.length?<ul className="registration-player-list">{trades.map((p,i)=>{
        return <li key={i} className="stove-trade">
          <div className="stove-trade-out"><small>{proClubNames[report.club]}</small>{player(p)}</div>
          <span aria-label="교환">↔</span>
          <div className="stove-trade-in"><small>{proClubNames[p.otherClub!]}</small>{player(p.exchange!)}</div>
        </li>;
      })}</ul>:<p className="registration-empty">없음</p>}
    </section>;
  if(report.tradeOnly)return tradeSection;
  return <><h3>{proClubNames[report.club]}</h3>
    <section className="registration-column stove-section">
      <h3>은퇴 {retired.length}명</h3>
      {retired.length?<ul className="registration-player-list">{retired.map(p=><li key={p.id}>{player(p)}{p.retiredNumber!==undefined&&<small>영구결번 {p.retiredNumber}번</small>}</li>)}</ul>:<p className="registration-empty">없음</p>}
    </section>
    <section className="registration-column stove-section"><h3>FA {freeAgents.length}명</h3>
      {freeAgents.length?<div className="table-scroll"><table><thead><tr>{['이름','포지션','우리 팀','유형','상대 팀'].map(label=><th key={label}>{label}</th>)}</tr></thead>
      <tbody>{freeAgents.map(p=>{
        const stay=p.from!==undefined&&p.from===p.to,incoming=p.to===report.club;
        const label=stay?'잔류':incoming?'영입':'이적';
        const other=incoming?p.from:p.to;
        return <tr key={p.id}>
          <th scope="row" className="stove-fa-name">{p.name}</th><td>{positions[p.position]}</td>
          <td>{proClubNames[report.club]}</td>
          <td><span className={`stove-fa-direction ${stay?'stay':incoming?'in':'out'}`} aria-label={label}><span aria-hidden="true">{stay?'−':incoming?'←':'→'}</span>{label}</span></td>
          <td>{stay?'—':other===undefined?'미상':proClubNames[other]}</td>
        </tr>;
      })}</tbody></table></div>:<p className="registration-empty">없음</p>}
    </section>
    <div className="registration-changes stove-section" aria-label="신규 입단·재계약 불가 명단" role="group">
      {(['joined','released'] as const).map(direction=>{
        const joined=direction==='joined',players=moves.filter(row=>row.direction===direction&&row.reason!=='트레이드');
        if(joined)players.sort((a,b)=>Number(a.reason==='신고')-Number(b.reason==='신고')||a.name.localeCompare(b.name,'ko'));
        return <section className={`registration-column ${joined?'promoted':'removed'}`} key={direction}>
          <h3><span className="registration-direction" aria-hidden="true">{joined?'↑':'↓'}</span>{joined?'신규 입단':'재계약 불가'} {players.length}명</h3>
          {players.length?<ul className="registration-player-list">{players.map((p,i)=><li key={`${p.id}-${i}`} className={p.id===playerId?'registration-mine':''}>
            <span>{player(p)}</span>{joined&&<small className="stove-move-type">{p.reason}</small>}
          </li>)}</ul>:<p className="registration-empty">없음</p>}
        </section>;
      })}
    </div>
    {tradeSection}</>;
}
