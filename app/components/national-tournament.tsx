import {useState} from 'react';
import {nationalTable} from '../../lib/sim/national-tournament';
import type {Game} from '../../lib/sim/types';
import type {NationalTournament} from '../../lib/sim/national-tournament';
import type {NationalSelection} from '../../lib/sim/national-teams';

function KnockoutGame({t,game,title,medal,waiting}:{t:NationalTournament;game?:Game;title:string;medal?:'gold'|'bronze';waiting?:string[]}){
  const completed=game?.status==='completed',mine=game&&[game.homeTeamId,game.awayTeamId].includes(0);
  return <article className={`national-match-card${medal?' medal-'+medal:''}${mine?' my-game':''}`} aria-label={title}>
    <header><div><span>{medal==='gold'?'CHAMPIONSHIP':medal==='bronze'?'BRONZE MEDAL':'KNOCKOUT'}</span><h4>{title}</h4></div><small>{completed?'경기 종료':game?.status==='inProgress'?'진행 중':game?'경기 예정':'대진 대기'}</small></header>
    <div className="national-match-teams">{[0,1].map(side=>{
      const id=game?(side===0?game.homeTeamId:game.awayTeamId):undefined,winner=completed&&game?.advancingTeamId===id;
      return <div key={side} className={`${id===0?'national-korea ':''}${winner?'national-winner':''}`}><span>{id===undefined?waiting?.[side]??'진출국 미정':t.countries[id].name}{winner&&<small>{medal==='gold'?'우승':medal==='bronze'?'3위':'진출'}</small>}</span><b>{completed?game.score[side]:'—'}</b></div>;
    })}</div>
    <footer>{game?<time dateTime={game.date}>{Number(game.date.slice(5,7))}월 {Number(game.date.slice(8))}일</time>:'앞 라운드 종료 후 대진 확정'}</footer>
  </article>;
}

export default function NationalTournamentView({entry,initialMode='league'}:{entry:NationalSelection;playerId?:string;initialMode?:'league'|'knockout'}){
  const t=entry.tournament,leagues=t?.stages.filter(s=>!s.knockout)??[];
  const [mode,setMode]=useState<string|null>(initialMode==='knockout'?'knockout':null),[selection,setSelection]=useState<{round:string;choice:string}|null>(null);
  if(!t)return <p className="empty-note">명단 발표 · 참가 선택 후 대회 대진이 편성됩니다.</p>;
  const choices=leagues.flatMap(stage=>stage.groups.map((group,i)=>({id:stage.id+':'+i,stage,group,label:stage.name+(stage.groups.length>1?' · '+String.fromCharCode(65+i)+'조':'')})));
  const current=t.stages[t.current]??t.stages.at(-1),round=current?.id??'';
  const preferred=current&&!current.knockout?current.id:leagues.at(-1)?.id;
  const view=mode??preferred??'knockout';
  const selected=choices.find(c=>selection?.round===round&&c.id===selection.choice&&c.stage.id===view)??choices.find(c=>c.stage.id===view&&c.group.includes(0))??choices.find(c=>c.stage.id===view);
  const tabs=[...leagues.map(stage=>({id:stage.id,name:stage.name})),...(entry.kind==='premier12'&&!leagues.some(stage=>stage.id==='super')?[{id:'super',name:'슈퍼라운드'}]:[])];
  const placement=['apbc','premier12'].includes(entry.kind);
  const roundDefinitions=placement?[{id:'medals',name:'순위 결정전',count:2}]:entry.kind==='wbc'?[{id:'quarter',name:'8강',count:4},{id:'semi',name:'4강 · 준결승',count:2},{id:'final',name:'결승전',count:1}]:entry.kind==='olympics'?[{id:'quarter',name:'준준결승',count:2},{id:'semi',name:'4강 · 준결승',count:2},{id:'medals',name:'메달 결정전',count:2}]:[{id:'medals',name:'메달 결정전',count:2}];
  // Unknown historical knockout stages remain visible alongside their real results.
  const rounds=[...roundDefinitions,...t.stages.filter(stage=>stage.knockout&&!roundDefinitions.some(round=>round.id===stage.id)).map(stage=>({id:stage.id,name:stage.name,count:stage.groups.reduce((sum,group)=>sum+group.length/2,0)}))];
  const select=(choice:string)=>setSelection({round,choice});
  const games=selected?t.games.filter(g=>g.national?.stage===selected.stage.id&&selected.group.includes(g.homeTeamId)&&selected.group.includes(g.awayTeamId)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)):[];
  const dates=[...new Set(games.map(game=>game.date))];
  const standings=selected?nationalTable(t,selected.stage,selected.group):[],groupIndex=selected?.stage.groups.indexOf(selected.group)??0;
  const placementTable=selected&&(selected.stage.id==='super'||entry.kind==='apbc');
  const advance=entry.kind==='youth'?3:entry.kind==='olympics'?3:2;
  return <div className="national-tournament">
    <div className="national-tabs" role="tablist" aria-label="국제대회 대진 보기">{tabs.map(tab=><button key={tab.id} role="tab" aria-selected={view===tab.id} className={view===tab.id?'selected':''} onClick={()=>setMode(tab.id)}>{tab.name}</button>)}<button role="tab" aria-selected={view==='knockout'} className={view==='knockout'?'selected':''} onClick={()=>setMode('knockout')}>토너먼트</button></div>
    {view!=='knockout'&&selected&&<>
      <div className="national-round-selectors">
        {selected.stage.groups.length>1&&<label className="national-group-select">조 선택 <select aria-label="국제대회 조 선택" value={selected.id} onChange={e=>select(e.target.value)}>{choices.filter(c=>c.stage.id===selected.stage.id).map(c=><option key={c.id} value={c.id}>{c.label.split(' · ').at(-1)}</option>)}</select></label>}
      </div>
      <section className="competition-standings"><header className="competition-group-heading"><div><span>{selected.stage.groups.length>1?`GROUP ${String.fromCharCode(65+groupIndex)}`:selected.stage.id==='super'?'SUPER ROUND':'GROUP STAGE'}</span><h3>{selected.stage.name} 순위{selected.stage.groups.length>1?` · ${String.fromCharCode(65+groupIndex)}조`:''}</h3></div><small>{selected.group.length}팀 · {games.filter(game=>game.status==='completed').length}/{games.length}경기 종료</small></header>
      <div className="table-scroll"><table><thead><tr><th>순위</th><th>국가</th><th>경기</th><th>승</th><th>패</th><th>득실차</th><th>진출 현황</th></tr></thead><tbody>{standings.map((r,i)=><tr key={r.id} className={r.id===0?'my-player-row':''}><td><span className={`group-rank${i<2?' group-promoted':''}`}>{i+1}</span></td><td><b>{t.countries[r.id].name}</b></td><td>{r.wins+r.losses}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.runs-r.allowed>0?'+':''}{r.runs-r.allowed}</td><td><span className={`group-progress${i<2?' qualifying':''}`}>{selected.stage.byes?.includes(r.id)?'준결승 직행':placementTable?i<2?'결승권':i<4?'3·4위전권':'—':i<advance?'진출권':'—'}</span></td></tr>)}</tbody></table></div></section>
      <h3 className="national-stage-heading">{selected.stage.name} 경기 결과</h3>
      <div className="national-league-games">{dates.map(date=><section key={date} className="national-match-day" aria-label={`${date} 경기`}><h4><time dateTime={date}>{Number(date.slice(5,7))}월 {Number(date.slice(8))}일</time><span>{games.filter(game=>game.date===date).length}경기</span></h4><div>{games.filter(game=>game.date===date).map(game=><article key={game.id} className={`national-league-game${[game.homeTeamId,game.awayTeamId].includes(0)?' my-game':''}`}><small>{game.national?.carried?'이전 라운드 성적 이월':game.status==='completed'?'경기 종료':'경기 예정'}</small><div><span>{t.countries[game.homeTeamId].name}</span><b>{game.status==='completed'?`${game.score[0]} : ${game.score[1]}`:'VS'}</b><span>{t.countries[game.awayTeamId].name}</span></div></article>)}</div></section>)}</div>
      {!games.length&&<p className="empty-note">이 라운드의 경기 일정이 아직 없습니다.</p>}
    </>}
    {view!=='knockout'&&!selected&&<p className="empty-note">조별리그가 끝나면 {tabs.find(tab=>tab.id===view)?.name} 진출국과 일정이 확정됩니다.</p>}
    {view==='knockout'&&<div className={`national-bracket${placement?' national-placement-bracket':''}`} aria-label="국제대회 토너먼트 대진표">
      {placement?<div className="national-placement-games">{(['gold','bronze'] as const).map((medal,i)=>{
        const game=t.games.find(game=>game.national?.stage==='medals'&&game.national.group===i),source=entry.kind==='premier12'?'슈퍼라운드':'조별리그';
        return <KnockoutGame key={medal} t={t} game={game} medal={medal} title={i===0?'결승전 · 1·2위전':'3·4위전'} waiting={[`${source} ${i===0?1:3}위`,`${source} ${i===0?2:4}위`]}/>;
      })}</div>:rounds.map((stage,index)=>{
        const matches=t.games.filter(game=>game.national?.stage===stage.id).sort((a,b)=>(a.national?.group??0)-(b.national?.group??0)||a.id.localeCompare(b.id)),decided=matches.length>0&&matches.every(game=>game.status==='completed');
        return <section key={stage.id} className={`national-bracket-round${decided?' decided':''}`} aria-label={stage.name}>
          <header className="national-bracket-round-heading"><span>ROUND {String(index+1).padStart(2,'0')}</span><h3>{stage.name}</h3><small>{decided?'종료':matches.length?'대진 확정':'진출국 대기'}</small></header>
          <div className="national-bracket-matches">{Array.from({length:Math.max(matches.length,stage.count)},(_,i)=>{
            const game=matches[i],medal=stage.id==='medals'?(i===0?'gold':'bronze'):stage.id==='final'?'gold':undefined;
            return <KnockoutGame key={game?.id??i} t={t} game={game} medal={medal} title={medal==='gold'?'결승전':medal==='bronze'?'3·4위전':`${stage.name} ${i+1}경기`}/>;
          })}</div>
        </section>;
      })}
    </div>}

    {t.finished&&<p className="draft-board-note">우승 · {t.countries[t.champion!]?.name}{t.awards?.[0]?' · MVP '+t.awards[0].name:''}</p>}
  </div>;
}
