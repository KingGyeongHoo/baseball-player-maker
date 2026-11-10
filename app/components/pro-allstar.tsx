"use client";
import {useEffect,useId,useRef,useState} from "react";
import {allstarBallot,allstarLevels,allstarSeasonView,allstarSideLabels,allstarSides,allstarSlots,nextAllstarVoteDate} from "../../lib/sim/pro-allstar";
import {allstarDates} from "../../lib/sim/pro-allstar-calendar";
import type {AllstarLevel,AllstarSide} from "../../lib/sim/pro-allstar-types";
import type {GameState,Position} from "../../lib/sim/types";
import {formatInnings} from "../../lib/player-records";

const slotLabels:Record<Position,string>={SP:"선발투수",RP:"중간계투",CP:"마무리",C:"포수",'1B':"1루수",'2B':"2루수",'3B':"3루수",SS:"유격수",LF:"좌익수",CF:"중견수",RF:"우익수",DH:"지명타자"};
const methods={vote:"투표 선발",manager:"감독 추천",replacement:"대체 선발"};
function AllstarDialog({state,onClose,onRecords}:{state:GameState;onClose:()=>void;onRecords:(id:string)=>void}){
  const ref=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),id=useId();
  const [level,setLevel]=useState<AllstarLevel>("first"),[side,setSide]=useState<AllstarSide>("blue");
  const season=allstarSeasonView(state),[view,setView]=useState(season.finalizedAt?"roster":"votes"),dates=allstarDates(season.year),entry=season.levels[level],target=entry[side];
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();heading.current?.focus();return()=>dialog?.close();},[]);
  const openRecords=(playerId:string)=>{onClose();onRecords(playerId);};
  return <dialog className="modal allstar-modal" ref={ref} aria-labelledby={id} onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="modal-header"><h2 id={id} ref={heading} tabIndex={-1}>{season.year} 올스타</h2><button type="button" className="text-button" aria-label="올스타 닫기" onClick={onClose}>닫기</button></div>
    <div className="allstar-modal-body">
      <p className="allstar-dates">2군 {dates.second} (금) · 1군 {dates.first} (토)<br/>{dates.restStart}~{dates.restEnd} 휴식 · {dates.resume} 정규경기 재개</p>
      <div className="allstar-controls"><div className="segmented" aria-label="올스타 리그">{allstarLevels.map(key=><button key={key} className={level===key?"selected":""} aria-pressed={level===key} onClick={()=>setLevel(key)}>{key==="first"?"1군":"2군"}</button>)}</div>
        <div className="segmented" aria-label="올스타 진영">{allstarSides.map(key=><button key={key} className={side===key?"selected":""} aria-pressed={side===key} onClick={()=>setSide(key)}>{allstarSideLabels[key]}</button>)}</div>
      </div>
      <p className={`allstar-team-label ${side}`}>{allstarSideLabels[side]} · {side==="blue"?"베어스 / 자이언츠 / 라이온즈 / 랜더스 / 위즈":"트윈스 / 다이노스 / 타이거즈 / 히어로즈 / 이글스"}</p>
      <div className="allstar-view-tabs segmented" aria-label="올스타 현황"><button className={view==="votes"?"selected":""} onClick={()=>setView("votes")}>투표 현황</button><button disabled={!season.finalizedAt} className={view==="roster"?"selected":""} onClick={()=>setView("roster")}>최종 명단</button><button disabled={!entry.game&&!entry.cancelled} className={view==="result"?"selected":""} onClick={()=>setView("result")}>경기 결과</button></div>
      {season.skipped?<p className="empty-note">이 시즌은 올스타 일정이 지난 뒤 기능이 적용됐습니다. 다음 시즌부터 참여합니다.</p>:<>
      {view==="votes"&&<><p className="allstar-update">{season.finalizedAt?"6월 30일 최종 집계 완료":`최근 집계 ${season.lastUpdated??"집계 전"} · 다음 집계 ${nextAllstarVoteDate(state)??"확정 대기"}`}<br/>구단별 부문 후보 1명 · 누적 득표 상위 3명. 소속 군이 바뀌면 다른 군으로 표가 이전되지 않습니다.</p>
        <div className="allstar-ballot-grid">{allstarSlots.map(slot=>{
          const rows=allstarBallot(state,level,side,slot),mine=rows.findIndex(row=>row.playerId===state.playerId);
          return <section key={slot} className="allstar-ballot-card"><h3>{slotLabels[slot]}</h3>{rows.length?<ol>{rows.slice(0,3).map((row,index)=><li key={row.playerId} className={row.playerId===state.playerId?"allstar-mine":""}><b>{index+1}</b><span><button className="player-name-button" onClick={()=>openRecords(row.playerId)}>{row.name}</button><small>{state.teams[row.club]?.name.replace(/ 1군$/,"")}{!row.nominated?" · 이전 후보":""}</small></span><strong>{row.votes.toLocaleString()}<small>표</small></strong></li>)}</ol>:<p className="empty-note">해당 군의 실제 출전 기록이 있는 후보를 기다립니다.</p>}
            {mine>=3&&<p className="allstar-my-vote">내 순위 {mine+1}위 · {rows[mine].votes.toLocaleString()}표</p>}
          </section>;
        })}</div></>}
      {view==="roster"&&<><p className="allstar-update">최종 {target.roster.length}명 · 투표 선발 {target.roster.filter(row=>row.method==="vote").length}명 · 감독 추천 및 대체 {target.roster.filter(row=>row.method!=="vote").length}명<br/>6월 말 소속 군 기준 · 부상·출전 불가 시 대체 선발</p><div className="table-scroll"><table className="allstar-roster-table"><thead><tr><th>부문</th><th>선수</th><th>구단</th><th>선발</th></tr></thead><tbody>{target.roster.map(row=><tr key={row.playerId} className={row.playerId===state.playerId?"my-player-row":""}><td>{slotLabels[row.slot]}</td><td><button className="player-name-button" onClick={()=>openRecords(row.playerId)}>{row.name}</button></td><td>{state.teams[row.club]?.name.replace(/ 1군$/,"")}</td><td>{methods[row.method]}</td></tr>)}</tbody></table></div>{target.withdrawn.length>0&&<p className="allstar-update">출전 불가로 대체된 선수 {target.withdrawn.length}명 · 기존 선발 이력과 보상은 유지합니다.</p>}</>}
      {view==="result"&&(entry.cancelled?<p className="empty-note">{entry.cancelled}</p>:entry.game?<><div className="allstar-score"><span>BLUE Team</span><strong>{entry.game.score[0]} : {entry.game.score[1]}</strong><span>WHITE Team</span></div><p className="allstar-mvp">미스터 올스타 · <b>{entry.mvp?.name??"선정 대기"}</b>{entry.mvp?` (${allstarSideLabels[entry.mvp.side]})`:""}</p><p className="allstar-update">올스타 기록은 정규·포스트시즌 성적에 합산하지 않습니다.</p><div className="table-scroll"><table><thead><tr><th>선수</th><th>타석</th><th>안타</th><th>홈런</th><th>타점</th><th>이닝</th><th>탈삼진</th></tr></thead><tbody>{target.roster.filter(row=>{const r=entry.game!.boxScore[row.playerId];return r&&(r.batting.PA||r.pitching.BF);}).map(row=>{const r=entry.game!.boxScore[row.playerId];return <tr key={row.playerId}><td>{row.name}</td><td>{r.batting.PA}</td><td>{r.batting.H}</td><td>{r.batting.HR}</td><td>{r.batting.RBI}</td><td>{formatInnings(r.pitching.outs)}</td><td>{r.pitching.SO}</td></tr>;})}</tbody></table></div></>:<p className="empty-note">아직 경기가 열리지 않았습니다.</p>)}
      </>}
    </div>
  </dialog>;
}
export default function ProAllstar({state,onRecords}:{state:GameState;onRecords:(id:string)=>void}){
  const [open,setOpen]=useState(false);if(state.careerMode!=="pro"||state.date<`${state.calendar.seasonYear}-05-01`)return null;
  const season=allstarSeasonView(state);
  return <><section className="allstar-entry"><div><span>ALL-STAR</span><b>{season.year} 별들의 무대</b><small>{season.skipped?"다음 시즌부터 참여":season.finalizedAt?"1·2군 최종 명단과 경기 결과":"1·2군 누적 투표 · 2주 간격 집계"}</small></div><button type="button" className="primary" onClick={()=>setOpen(true)}>올스타</button></section>{open&&<AllstarDialog state={state} onClose={()=>setOpen(false)} onRecords={onRecords}/>}</>;
}
