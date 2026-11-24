import {getPlayer} from '../../lib/sim/engine';
import {displayedHonorStatus} from '../../lib/sim/retirement-honor-status';
import type {GameState} from '../../lib/sim/types';

export function RetirementHonorsPanel({state}:{state:GameState}){
  const player=getPlayer(state),status=displayedHonorStatus(state,player);
  if(!status||status.debutSeasons<10||!state.proWorld)return null;
  const retired=player.professional?.employment==='retired';
  const honor=state.proWorld.retirementHonors?.find(row=>row.playerId===player.id);
  const number=state.proWorld.retiredNumbers?.find(row=>row.playerId===player.id);
  const rows=[
    {title:'은퇴식',met:retired?!!honor?.ceremony:status.ceremony,description:'홈팬과 함께 선수 생활의 마지막을 기념합니다.'},
    {title:'은퇴 투어',met:retired?!!honor?.tour:status.tour,description:'마지막 시즌, 각 구장을 돌며 팬들과 작별합니다.'},
    {title:'영구결번',met:retired?!!number:status.retiredNumber,description:'구단이 등번호를 영구히 남겨 선수의 공헌을 기립니다.'},
  ];
  return <section className="panel career-retirement-honors" aria-label="은퇴 예우">
    <div className="panel-heading"><h2>은퇴 예우</h2><span className="small muted">{status.year}시즌 종료 기준</span></div>
    <div className="retirement-eligibility-grid">{rows.map(row=><article key={row.title}><span className={`retirement-honor-badge ${row.met?'honor-qualified':'honor-pending'}`} aria-label={`${row.title} ${row.met?'기준 충족':'기준 미충족'}`}><span className="retirement-medal-face">{row.title}</span></span><small>{row.description}</small></article>)}</div>
  </section>;
}
