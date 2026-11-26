"use client";
import {useState} from 'react';
import {allstarBallot,allstarLevels,allstarSeasonView,allstarSlots,allstarVotingDates} from '../../lib/sim/pro-allstar';
import type {AllstarCandidate,AllstarLevel,AllstarMember} from '../../lib/sim/pro-allstar-types';
import type {GameState,Position} from '../../lib/sim/types';
import AllstarResult from './allstar-result';

const slotLabels:Record<Position,string>={SP:'선발',RP:'중계',CP:'마무리',C:'포수','1B':'1루수','2B':'2루수','3B':'3루수',SS:'유격수',LF:'좌익수',CF:'중견수',RF:'우익수',DH:'지명타자'};
const clubName=(state:GameState,club:number)=>state.teams[club]?.name.replace(/ [12]군$/,'')??'소속 미상';
const methods={vote:'투표 선발',manager:'감독 추천',replacement:'대체 선발'};
export default function ProAllstar({state,onRecords}:{state:GameState;onRecords:(id:string)=>void}){
  const [level,setLevel]=useState<AllstarLevel>('first');
  const season=allstarSeasonView(state),entry=season.levels[level];
  const [view,setView]=useState<'votes'|'roster'>(season.finalizedAt?'roster':'votes');
  const beforeVoting=state.date<allstarVotingDates(season.year)[0];
  const candidates=allstarLevels.flatMap(key=>(['blue','white'] as const).flatMap(side=>Object.values(season.levels[key][side].ballots).flat()));
  const highestVotes=Math.max(0,...candidates.map(row=>row.votes));
  const voteLeaders=new Set(candidates.filter(row=>highestVotes>0&&row.votes===highestVotes).map(row=>row.playerId));
  const playerName=(id:string,name:string)=><>{state.players.some(p=>p.id===id)?<button className="player-name-button" onClick={()=>onRecords(id)}>{name}</button>:name}{voteLeaders.has(id)&&<span className="allstar-vote-leader" data-vote-leader={id}><span aria-hidden="true">★</span>{voteLeaders.size>1?'공동 최다 득표':'최다 득표'}</span>}</>;
  const ballot=(rows:AllstarCandidate[])=><ol className="allstar-vote-list">{Array.from({length:3},(_,index)=>{
    const row=rows[index];
    return <li key={index} className={row?.playerId===state.playerId?'allstar-mine':undefined}><b>{index+1}위</b>{row?<><span>{playerName(row.playerId,row.name)}<small>{clubName(state,row.club)}</small></span><strong>{row.votes.toLocaleString()}<small>표</small></strong></>:<span className="muted">—</span>}</li>;
  })}</ol>;
  const roster=(rows:AllstarMember[])=><ul className="allstar-final-list">{rows.length?rows.map(row=><li key={row.playerId} className={row.playerId===state.playerId?'allstar-mine':undefined}><span>{playerName(row.playerId,row.name)}<small className={`allstar-selection-method${row.method==='vote'?' is-vote':''}`}>{methods[row.method]}</small></span><small>{clubName(state,row.club)}</small></li>):<li className="muted">—</li>}</ul>;
  return <section className="panel allstar-panel">
    <div className="panel-heading allstar-heading"><h2>{season.year} 올스타</h2><div className="segmented" aria-label="올스타 리그">{allstarLevels.map(key=><button key={key} className={level===key?'selected':''} aria-pressed={level===key} onClick={()=>setLevel(key)}>{key==='first'?'1군':'2군'}</button>)}</div></div>
    <div className="allstar-content">
      <AllstarResult state={state} entry={entry} renderPlayerName={playerName}/>
      {entry.cancelled&&<p className="empty-note">{entry.cancelled}</p>}
      <div className="allstar-view-tabs segmented" aria-label="올스타 현황"><button aria-pressed={view==='votes'} className={view==='votes'?'selected':''} onClick={()=>setView('votes')}>투표 현황</button><button disabled={!season.finalizedAt} aria-pressed={view==='roster'} className={view==='roster'?'selected':''} onClick={()=>setView('roster')}>최종 명단</button></div>
      {season.skipped?<p className="empty-note">이 시즌의 올스타 기록이 없습니다.</p>:beforeVoting?<p className="empty-note">5월 1일부터 누적 투표 현황을 확인할 수 있습니다.</p>:<div className={`allstar-comparison${view==='votes'?' allstar-voting':''}`} aria-label={view==='votes'?'포지션별 올스타 투표 현황':'포지션별 올스타 최종 명단'}>
        <div className="allstar-comparison-heading"><h3 className="allstar-blue">BLUE</h3><span>포지션</span><h3 className="allstar-white">WHITE</h3></div>
        {allstarSlots.map(slot=><section className="allstar-position-row" key={slot} aria-label={slotLabels[slot]}><div>{view==='votes'?ballot(allstarBallot(state,level,'blue',slot).slice(0,3)):roster(entry.blue.roster.filter(row=>row.slot===slot))}</div><h4 className="allstar-position-label">{slotLabels[slot]}</h4><div>{view==='votes'?ballot(allstarBallot(state,level,'white',slot).slice(0,3)):roster(entry.white.roster.filter(row=>row.slot===slot))}</div></section>)}
      </div>}
    </div>
  </section>;
}
