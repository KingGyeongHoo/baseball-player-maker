import {selectionScore} from './engine';
import {firstTeamCapacity,firstTeamSlots,postseasonTeamCapacity} from './pro-roster';
import {setProSquad} from './pro-squads';
import type {GameState,Player} from './types';

export function needsPostseasonRosterUpgrade(s:GameState){
  return s.careerMode==='pro'&&s.proWorld?.stage==='postseason'&&!s.proWorld.seasonClosed
    &&!!s.proWorld.postseason&&s.proWorld.postseason.rosterVersion!==1&&!s.matchProgress;
}

// Select at qualification, including the clubs waiting for later rounds.
// Keep a complete regular roster, then use the extra places without role quotas.
export function expandPostseasonRosters(s:GameState){
  if(!needsPostseasonRosterUpgrade(s))return false;
  const world=s.proWorld!,post=world.postseason!,calledUp:string[]=[];
  const healthy=(p:Player)=>!p.injury||s.date>=p.injury.unavailableUntil;
  for(const club of post.seeds){
    const candidates=s.players.filter(p=>(p.teamId===club||p.teamId===club+10&&healthy(p))
      &&p.professional?.employment==='active'&&p.proContract?.status!=='developmental');
    const ranked=candidates.sort((a,b)=>Number(healthy(b))-Number(healthy(a))
      ||selectionScore(b)-selectionScore(a)||Number(b.teamId===club)-Number(a.teamId===club)||a.id.localeCompare(b.id));
    const selected=new Set<string>();
    for(const position of firstTeamSlots(s.seed,club)){
      const p=ranked.find(p=>p.position===position&&!selected.has(p.id));
      if(p)selected.add(p.id);
    }
    for(const p of ranked)if(selected.size<firstTeamCapacity&&!selected.has(p.id))selected.add(p.id);
    for(const p of ranked)if(selected.size<postseasonTeamCapacity&&healthy(p))selected.add(p.id);
    for(const p of candidates){
      if(selected.has(p.id)){
        if(p.teamId!==club)calledUp.push(p.id);
        setProSquad(s,p,'first');
      }else if(p.teamId===club)setProSquad(s,p,'second');
    }
  }
  world.postseasonExpansion={year:world.year,clubs:[...post.seeds],calledUp};
  post.rosterVersion=1;
  // Upgrade an ongoing save without resetting the bracket, scores or records.
  for(const series of post.series.filter(row=>row.winner===undefined))for(const club of series.clubs){
    series.rosters[String(club)]=s.players.filter(p=>p.teamId===club&&!series.excluded.includes(p.id)
      &&p.proContract?.status!=='developmental').slice(0,postseasonTeamCapacity).map(p=>p.id);
  }
  return true;
}

export function trimPostseasonRostersForOpening(s:GameState){
  const world=s.proWorld,expansion=world?.postseasonExpansion;
  const opening=s.calendar.competitions.find(c=>c.id==='pro-first')?.startDate;
  if(!world||!expansion||world.year<=expansion.year||!opening||s.date<opening||s.matchProgress)return [];
  const changes=expansion.clubs.map(club=>{
    const first=s.players.filter(p=>p.teamId===club).sort((a,b)=>selectionScore(a)-selectionScore(b)||a.id.localeCompare(b.id));
    const players=first.slice(0,Math.max(0,first.length-firstTeamCapacity));
    for(const p of players)setProSquad(s,p,'second');
    return {club,players};
  });
  delete world.postseasonExpansion;
  world.openingRosterDate=s.date;
  return changes;
}
