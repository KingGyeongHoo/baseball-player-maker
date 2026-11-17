import type {ReactNode} from 'react';
import type {GameState} from '../../lib/sim/types';
import type {AllstarLeague} from '../../lib/sim/pro-allstar-types';
import {formatInnings} from '../../lib/player-records';

export default function AllstarResult({state,entry,renderPlayerName}:{state:GameState;entry:AllstarLeague;renderPlayerName?:(id:string,name:string)=>ReactNode}){
  const played=entry.game?.status==='completed',score=played?entry.game!.score:[0,0],mvp=played?entry.mvp:undefined;
  const member=mvp?[...entry.blue.roster,...entry.white.roster].find(row=>row.playerId===mvp.playerId):undefined;
  const club=member?state.teams[member.club]?.name.replace(/ [12]군$/,''):undefined;
  const record=mvp?entry.game?.boxScore[mvp.playerId]:undefined;
  return <>
    <div className="allstar-scoreboard" role="group" aria-label={`BLUE ${score[0]} 대 ${score[1]} WHITE`}><span className="allstar-blue">BLUE</span><strong className="allstar-blue">{score[0]}</strong><span className="allstar-versus">VS</span><strong className="allstar-white">{score[1]}</strong><span className="allstar-white">WHITE</span></div>
    <article className={`awards-mvp allstar-mister${mvp?.playerId===state.playerId?' awards-mine':''}`} aria-label="미스터 올스타">
      <span>MR. ALL-STAR · 미스터 올스타</span><h3>{mvp?(renderPlayerName?.(mvp.playerId,mvp.name)??mvp.name):'선정 대기'}{mvp?.playerId===state.playerId&&<small>나의 선수</small>}</h3>
      {mvp?<><p>{club&&`${club} · `}{mvp.side==='blue'?'BLUE':'WHITE'}</p>{record&&<p>{record.batting.PA>0&&`${record.batting.AB}타수 · ${record.batting.H}안타 · ${record.batting.HR}홈런 · ${record.batting.RBI}타점`}{record.batting.PA>0&&record.pitching.outs>0&&' / '}{record.pitching.outs>0&&`${formatInnings(record.pitching.outs)}이닝 · ${record.pitching.SO}탈삼진 · ${record.pitching.ER}자책점`}</p>}</>:<p>경기 종료 후 발표</p>}
    </article>
  </>;
}
