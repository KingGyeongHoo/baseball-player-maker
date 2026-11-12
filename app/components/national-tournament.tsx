import {useState} from 'react';
import {nationalTable} from '../../lib/sim/national-tournament';
import type {NationalSelection} from '../../lib/sim/national-teams';

export default function NationalTournamentView({entry,initialMode='league'}:{entry:NationalSelection;playerId?:string;initialMode?:'league'|'knockout'}){
  const t=entry.tournament,leagues=t?.stages.filter(s=>!s.knockout)??[],knockouts=t?.stages.filter(s=>s.knockout)??[];
  const [mode,setMode]=useState(initialMode),[selection,setSelection]=useState('');
  if(!t)return <p className="empty-note">명단 발표 · 참가 선택 후 대회 대진이 편성됩니다.</p>;
  const hasLeague=leagues.length>0,view=hasLeague?mode:'knockout';
  const choices=leagues.flatMap(stage=>stage.groups.map((group,i)=>({id:stage.id+':'+i,stage,group,label:stage.name+(stage.groups.length>1?' · '+String.fromCharCode(65+i)+'조':'')})));
  const selected=choices.find(c=>c.id===selection)??choices.find(c=>c.stage.id===t.stages[t.current].id&&c.group.includes(0))??choices.find(c=>c.group.includes(0))??choices[0];
  return <div className="national-tournament">
    <div className="national-tabs" role="tablist" aria-label="국제대회 대진 보기">{hasLeague&&<button role="tab" aria-selected={view==='league'} className={view==='league'?'selected':''} onClick={()=>setMode('league')}>조별리그</button>}<button role="tab" aria-selected={view==='knockout'} className={view==='knockout'?'selected':''} onClick={()=>setMode('knockout')}>토너먼트</button></div>
    {view==='league'&&selected&&<><label className="national-group-select">조 선택 <select value={selected.id} onChange={e=>setSelection(e.target.value)}>{choices.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label><div className="table-scroll"><table><thead><tr><th>순위</th><th>국가</th><th>경기</th><th>승</th><th>패</th><th>득실차</th></tr></thead><tbody>{nationalTable(t,selected.stage,selected.group).map((r,i)=><tr key={r.id} className={r.id===0?'my-player-row':''}><td>{i+1}</td><td>{t.countries[r.id].name}{selected.stage.byes?.includes(r.id)?' · 준결승 직행':''}</td><td>{r.wins+r.losses}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.runs-r.allowed}</td></tr>)}</tbody></table></div></>}
    {view==='knockout'&&(knockouts.length?<div className="national-rounds">{knockouts.map(stage=><section key={stage.id} className="national-round"><h3>{stage.name}</h3><div className="national-knockout">{t.games.filter(g=>g.national?.stage===stage.id).map(g=><article className={'bracket-game '+([g.homeTeamId,g.awayTeamId].includes(0)?'my-game':'')} key={g.id}><small>{stage.id==='medals'?(g.national?.group===0?'결승':'동메달 결정전'):g.date.slice(5)}</small>{[g.homeTeamId,g.awayTeamId].map((id,side)=><div key={id} className={g.advancingTeamId===id?'bracket-winner':''}><span>{t.countries[id].name}</span><b>{g.status==='completed'?g.score[side]:'—'}</b></div>)}</article>)}</div></section>)}</div>:<p className="empty-note">조별리그가 끝나면 토너먼트 대진이 확정됩니다.</p>)}
    {t.finished&&<p className="draft-board-note">우승 · {t.countries[t.champion!]?.name}{t.awards?.[0]?' · MVP '+t.awards[0].name:''}</p>}
  </div>;
}
