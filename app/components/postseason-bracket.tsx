import {postseasonRounds} from "../../lib/pro-postseason";
import type {GameState} from "../../lib/sim/types";
import type {ProSeries} from "../../lib/sim/pro-types";

export default function PostseasonBracket({state}:{state:GameState}){
  const world=state.proWorld,post=world?.postseason;
  if(!post||!world||!["postseason","summary"].includes(world.stage))return null;
  const legacy=post.format!=="kbo-v1";
  const cards=legacy?[...post.series.map(series=>({id:series.id,label:series.stage==="final"?"한국시리즈":"준결승",format:series.target===4?"7전 4선승":"5전 3선승",series,clubs:[...series.clubs] as (number|undefined)[],waiting:["준결승 1 승자","준결승 2 승자"]})),...(!post.series.some(s=>s.stage==="final")?[{id:"final",label:"한국시리즈",format:"7전 4선승",series:undefined as ProSeries|undefined,clubs:[undefined,undefined],waiting:["준결승 1 승자","준결승 2 승자"]}]:[])]:postseasonRounds.map(round=>{
    const series=post.series.find(s=>s.id===round.id),previous=post.series.find(s=>s.id===round.from);
    const priorLabel=postseasonRounds.find(r=>r.id===round.from)?.label;
    return {id:round.id,label:round.label,format:round.stage==="wildcard"?"2선승 · 4위 1승 선취":round.stage==="final"?"7전 4선승":"5전 3선승",series,
      clubs:series?[...series.clubs]:[post.seeds[round.seed],round.stage==="wildcard"?post.seeds[4]:previous?.winner],waiting:["진출팀 대기",`${priorLabel} 승자`]};
  });
  const team=(id:number)=>state.teams[id]?.name.replace(/ [12]군$/,"")??`구단 ${id+1}`;
  return <section className="panel postseason-bracket" aria-label="포스트시즌 대진표"><div className="panel-heading"><div><span className="eyebrow">ROAD TO THE CHAMPIONSHIP</span><h2>{world.year} 포스트시즌 대진표</h2></div><span className="postseason-badge">{post.champion===undefined?"가을야구":"우승 확정"}</span></div>
    <div className={`postseason-rounds ${legacy?"legacy-bracket":""}`}>{cards.map(card=>{
      const series=card.series,next=series&&series.winner===undefined?state.calendar.events.find(g=>g.id===`${world.year}:${series.id}:${series.game-1}`):undefined;
      return <article className={`postseason-round ${series?.winner!==undefined?"decided":series?"playing":"waiting"}`} key={card.id}>
        <div className="postseason-round-heading"><h3>{card.label}</h3><span>{series?.winner!==undefined?"종료":series?"진행 중":"대기"}</span></div><p className="postseason-format">{card.format}</p>
        <div className="postseason-teams">{card.clubs.map((id,i)=><div key={i} className={`postseason-team ${id!==undefined&&series?.winner===id?"winner":""}`}>
          <span><small>{id===undefined?"진출팀":`${post.seeds.indexOf(id)+1}위`}</small><b>{id===undefined?card.waiting[i]:team(id)}</b></span><strong>{series?series.wins[i]:"—"}</strong>
        </div>)}</div>
        <p className="postseason-round-status">{series?.winner!==undefined?`${team(series.winner)} ${card.id==="final"?"우승":"진출"}`:next?`${next.date.slice(5).replace("-",".")} · ${next.round}차전${next.status==="inProgress"?" 진행 중":" 예정"}`:"앞 시리즈 종료 후 대진 확정"}</p>
      </article>;
    })}</div>
    {!legacy&&<p className="postseason-note">1위 한국시리즈 · 2위 플레이오프 · 3위 준플레이오프 직행. 와일드카드는 4위의 1승을 포함해 표시하며 실제 최대 2경기, 무승부 시 4위가 진출합니다.</p>}
    {legacy&&<p className="postseason-note">이미 진행된 기존 시즌의 대진과 기록입니다. 다음 시즌부터 5팀 계단식 포스트시즌이 적용됩니다.</p>}
    {post.champion!==undefined&&<div className="postseason-champion"><span>한국시리즈 우승</span><b>{team(post.champion)}</b></div>}
  </section>;
}
