import {getPlayer} from '../../lib/sim/engine';
import {displayedHonorStatus} from '../../lib/sim/retirement-honor-status';
import {retirementHonorRules as rules} from '../../lib/sim/retirement-honors';
import {clubName} from '../../lib/sim/pro-world';
import type {GameState} from '../../lib/sim/types';

type ServicePath={count:number;required:number;label:string};
function servicePath(paths:ServicePath[]){
  const met=paths.filter(path=>path.count>=path.required);
  return met.length?met.sort((a,b)=>a.required-b.required)[0]:paths.sort((a,b)=>b.count/b.required-a.count/a.required)[0];
}
const points=(value:number|null|undefined)=>value==null?'—':Number(value.toFixed(2)).toLocaleString('ko-KR');
export function RetirementHonorsPanel({state}:{state:GameState}){
  const player=getPlayer(state),status=displayedHonorStatus(state,player);
  if(!status||status.debutSeasons<10||!state.proWorld)return null;
  const retired=player.professional?.employment==='retired';
  const honor=state.proWorld.retirementHonors?.find(row=>row.playerId===player.id);
  const number=state.proWorld.retiredNumbers?.find(row=>row.playerId===player.id);
  const progress=status.progress;
  const farewell=(requiredScore:number,consecutive:number,total:number,debut:number)=>{
    const service=servicePath([{count:progress?.consecutive??0,required:consecutive,label:'연속'},{count:progress?.seasons??0,required:total,label:'합산'}]);
    const standard=(progress?.cumulative??-Infinity)>=requiredScore&&service.count>=service.required;
    if(!standard&&(progress?.debutClubSeasons??0)>=debut)return {score:progress?.cumulative,requiredScore:0,service:{count:progress!.debutClubSeasons,required:debut,label:'데뷔 구단'}};
    return {score:progress?.cumulative,requiredScore,service};
  };
  const numberPaths:ServicePath[]=[{count:progress?.longest??0,required:rules.numberConsecutive,label:'연속'}];
  if(progress?.tradeException)numberPaths.push({count:progress.seasons,required:rules.numberAfterTrade,label:'합산'});
  const rows=[
    {title:'은퇴식',met:retired?!!honor?.ceremony:status.ceremony,description:'홈팬과 함께 선수 생활의 마지막을 기념합니다.',...farewell(rules.ceremonyScore,rules.ceremonyConsecutive,rules.ceremonyTotal,rules.debutCeremony)},
    {title:'은퇴 투어',met:retired?!!honor?.tour:status.tour,description:'마지막 시즌, 각 구장을 돌며 팬들과 작별합니다.',...farewell(rules.tourScore,rules.tourConsecutive,rules.tourTotal,rules.debutTour)},
    {title:'영구결번',met:retired?!!number:status.retiredNumber,description:'구단이 등번호를 영구히 남겨 선수의 공헌을 기립니다.',score:progress?.clubScore,requiredScore:rules.numberScore,service:servicePath(numberPaths)},
  ];
  return <section className="panel career-retirement-honors" aria-label="은퇴 예우">
    <div className="panel-heading"><h2>은퇴 예우</h2><span className="small muted">{status.year}시즌 종료 기준{progress?.club!==undefined?` · ${clubName(state,progress.club)}`:''}</span></div>
    <div className="retirement-eligibility-grid">{rows.map(row=><article key={row.title} aria-label={`${row.title} 진행 현황`}><span className={`retirement-honor-badge ${row.met?'honor-qualified':'honor-pending'}`} aria-label={`${row.title} ${row.met?'기준 충족':'기준 미충족'}`}><span className="retirement-medal-face">{row.title}</span></span>
      <dl className="retirement-honor-progress"><div><dt>{row.title==='영구결번'?'구단 누적 평가':'누적 평가'}</dt><dd>{row.requiredScore?<><b>{points(row.score)}</b><span>/ {row.requiredScore}</span></>:<b className="honor-no-score">조건 없음</b>}</dd></div><div><dt>보낸 시즌 <span>· {row.service.label}</span></dt><dd><b>{progress?row.service.count:'—'}</b><span>/ {row.service.required}</span></dd></div></dl>
      <small>{row.description}</small></article>)}</div>
  </section>;
}
