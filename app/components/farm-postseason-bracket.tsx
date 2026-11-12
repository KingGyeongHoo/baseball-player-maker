import type {GameState} from '../../lib/sim/types';

export default function FarmPostseasonBracket({state}:{state:GameState}){
  const post=state.proWorld?.farmPostseason;if(!post)return null;
  const team=(id:number)=>state.teams[id]?.name??`2군 ${id-9}`;
  return <section className="panel postseason-bracket" aria-label="2군 포스트시즌 대진표">
    <div className="panel-heading"><h2>{state.calendar.seasonYear} 2군 포스트시즌</h2><span className="postseason-badge">{post.champion===undefined?'진행 중':'우승 확정'}</span></div>
    <div className="postseason-rounds legacy-bracket">{['semi-a','semi-b','final'].map((id,index)=>{
      const series=post.series.find(row=>row.id===id),next=series&&series.winner===undefined?state.calendar.events.find(g=>g.id===`${state.calendar.seasonYear}:farm:${id}:${series.game-1}`):undefined;
      return <article key={id} className={`postseason-round ${series?.winner!==undefined?'decided':series?'playing':'waiting'}`}>
        <div className="postseason-round-heading"><h3>{id==='final'?'결승':`준결승 ${index+1}`}</h3><span>{id==='final'?'5전 3선승':'3전 2선승'}</span></div>
        <div className="postseason-teams">{series?series.clubs.map((club,i)=><div key={club} className={`postseason-team ${series.winner===club?'winner':''}`}><span><small>{post.seeds.indexOf(club)+1}위</small><b>{team(club)}</b></span><strong>{series.wins[i]}</strong></div>):<p>준결승 종료 후 대진 확정</p>}</div>
        <p className="postseason-round-status">{series?.winner!==undefined?`${team(series.winner)} ${id==='final'?'우승':'진출'}`:next?`${next.date} · ${next.round}차전`:'대기'}</p>
      </article>;
    })}</div>
    <p className="postseason-note">2군·3군·신고선수 등록 가능 · 출전 우선순위 2군 → 3군 → 신고선수. 최대 경기 후 승수가 같으면 정규 순위가 높은 팀이 진출합니다. 기록은 정규시즌과 따로 보관합니다.</p>
  </section>;
}
