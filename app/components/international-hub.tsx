import {nationalInYear,nationalRules} from '../../lib/sim/national-teams';
import type {NationalKind} from '../../lib/sim/national-teams';
import type {GameState} from '../../lib/sim/types';
import NationalRosters from './national-rosters';

export default function InternationalHub({state,onRecords}:{state:GameState;onRecords:(id:string)=>void}){
  const kinds:NationalKind[]=state.careerMode==='pro'?['wbc','olympics','premier12','apbc']:state.careerMode?[]:['youth'];
  const upcoming=kinds.map(kind=>{let year=state.calendar.seasonYear;while(!nationalInYear(kind,year)||`${year}-${nationalRules[kind].month}-30`<state.date)year++;return {kind,year};}).sort((a,b)=>`${a.year}-${nationalRules[a.kind].month}`.localeCompare(`${b.year}-${nationalRules[b.kind].month}`));
  return <div className="international-hub"><div className="section-intro"><div><span className="eyebrow">INTERNATIONAL BASEBALL</span><h1>국제대회</h1><p>대표팀 선발부터 조별리그·결승·수상까지, 국가대표의 여정을 확인하세요.</p></div></div>
    {!state.nationalTeams?.length&&<section className="panel"><div className="panel-heading"><h2>다가오는 국제대회</h2></div><div className="international-upcoming">{upcoming.map(({kind,year})=><article key={kind}><small>{year}년 {Number(nationalRules[kind].month)}월</small><b>{nationalRules[kind].name}</b><span>{kind==='youth'?'매년 · 투수 15명·타자 15명':`${['apbc','olympics'].includes(kind)?'25세 이하 · ':''}30명 선발 · 4년 주기`}</span></article>)}</div></section>}
    <NationalRosters state={state} onRecords={onRecords}/>
  </div>;
}
