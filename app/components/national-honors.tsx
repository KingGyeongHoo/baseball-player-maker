import {nationalRules} from '../../lib/sim/national-teams';
import type {GameState} from '../../lib/sim/types';
export default function NationalHonors({state,playerId}:{state:GameState;playerId:string}){
  const entries=(state.nationalTeams??[]).filter(e=>e.roster.some(p=>p.id===playerId)||e.tournament?.countries[0].players.some(p=>p.id===playerId));
  if(!entries.length)return null;
  return <section className="panel"><h3>국가대표 커리어</h3><div className="table-scroll"><table><thead><tr><th>대회</th><th>출전 기록</th><th>결과·수상</th></tr></thead><tbody>{entries.map(e=>{const p=e.tournament?.countries[0].players.find(p=>p.id===playerId),r=p?.records,awards=e.tournament?.awards?.filter(a=>a.id===playerId).map(a=>a.title);return <tr key={`${e.year}:${e.kind}`}><td>{e.year} {nationalRules[e.kind].name}</td><td>{r?`${r.batting.AB}타수 ${r.batting.H}안타 ${r.batting.HR}홈런 / ${Math.floor(r.pitching.outs/3)}.${r.pitching.outs%3}이닝 ${r.pitching.SO}K`:'선발'}</td><td>{awards?.length?awards.join(' · '):e.tournament?.finished?e.tournament.champion===0?'우승':'대회 종료':e.participated===false&&playerId===state.playerId?'참가 사양':'대표 선발'}</td></tr>;})}</tbody></table></div></section>;
}
