import {nationalRules,type NationalSelection} from '../../lib/sim/national-teams';
import {formatInnings} from '../../lib/player-records';
import type {GameState} from '../../lib/sim/types';

export function nationalTeamResult(entry:NationalSelection){
  const t=entry.tournament;
  if(!t)return '—';
  if(t.champion===0)return '우승';
  const final=t.games.find(g=>g.national?.stage==='final'||g.national?.stage==='medals'&&g.national.group===0);
  if(final&&[final.homeTeamId,final.awayTeamId].includes(0)&&final.status==='completed')return final.advancingTeamId===0?'우승':'준우승';
  if(t.bronze===0)return '3위';
  const bronze=t.games.find(g=>g.national?.stage==='medals'&&g.national.group===1);
  if(bronze&&[bronze.homeTeamId,bronze.awayTeamId].includes(0)&&bronze.status==='completed')return '4위';
  const last=[...t.stages].reverse().find(stage=>stage.groups.some(group=>group.includes(0)));
  if(!last)return t.finished?'대회 종료':'진행 중';
  const lost=t.games.some(g=>g.national?.stage===last.id&&g.national.knockout&&[g.homeTeamId,g.awayTeamId].includes(0)&&g.status==='completed'&&g.advancingTeamId!==undefined&&g.advancingTeamId!==0);
  const advanced=!last.byes?.includes(0)&&t.stages.slice(t.stages.indexOf(last)+1).some(stage=>!stage.groups.some(group=>group.includes(0)));
  if(!t.finished&&!lost&&!advanced)return '진행 중';
  return last.id==='semi'?'4강 탈락':last.id==='quarter'?'8강 탈락':`${last.name} 탈락`;
}

export default function NationalHonors({state,playerId}:{state:GameState;playerId:string}){
  const entries=(state.nationalTeams??[]).filter(e=>e.roster.some(p=>p.id===playerId)||e.tournament?.countries[0].players.some(p=>p.id===playerId));
  if(!entries.length)return null;
  return <section className="panel national-career"><div className="panel-heading"><h2>국가대표</h2></div><div className="career-panel-body"><div className="table-scroll"><table><thead><tr><th>대회</th><th>기록</th><th>결과</th><th>수상</th></tr></thead><tbody>{entries.map(e=>{
    const p=e.tournament?.countries[0].players.find(p=>p.id===playerId),r=p?.records,member=e.roster.find(p=>p.id===playerId),awards=e.tournament?.awards?.filter(a=>a.id===playerId).map(a=>a.title);
    const pitching=member?.field==='pitching'||['SP','RP','CP'].includes(p?.position??member?.position??'');
    const records=[...(!pitching||r?.batting.PA?[`${r?.batting.AB??0}타수 ${r?.batting.H??0}안타 ${r?.batting.HR??0}홈런 ${r?.batting.RBI??0}타점`]:[]),...(pitching||r?.pitching.outs?[`${formatInnings(r?.pitching.outs??0)}이닝 ${r?.pitching.SO??0}탈삼진`]:[])].join(' / ');
    return <tr key={`${e.year}:${e.kind}`}><td>{e.year} {nationalRules[e.kind].name}</td><td>{e.participated===false&&playerId===state.playerId?'참가 사양':records}</td><td>{nationalTeamResult(e)}</td><td>{awards?.length?awards.join(' · '):'—'}</td></tr>;
  })}</tbody></table></div></div></section>;
}
