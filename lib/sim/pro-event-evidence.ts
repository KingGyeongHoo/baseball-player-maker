import {addDays,emptyRecord,getPlayer,mergeRecord,roleFor,roleScore} from "./engine";
import {ensureProEvents} from "./pro-event-ledger";
import type {GameState,Player,Position} from "./types";

export function recentProEvidence(s:GameState,p:Player,date=s.date){
  const level=p.teamId<10?"first":"second",competition=`pro-${level}`,from=addDays(date,-14),upper=date>s.date?s.date:date,records=emptyRecord();let starts=0,teamGames=0,startsKnown=true;
  for(const game of s.calendar.events){if(game.date<=from||game.date>upper||game.status!=="completed"||game.competitionId!==competition)continue;
    if([game.homeTeamId,game.awayTeamId].includes(p.teamId)){teamGames++;if(!game.proAppearanceComplete)startsKnown=false;}
    if(game.boxScore[p.id])mergeRecord(records,game.boxScore[p.id]);
    if(game.proAppearances?.[p.id]?.startedPitching)starts++;
  }
  const opening=s.calendar.competitions.find(c=>c.id===competition)?.startDate??`${s.calendar.seasonYear}-03-01`;
  const tracked=ensureProEvents(s).introducedAt<=from&&(s.proWorld?.stage==="camp"?`${s.calendar.seasonYear}-03-01`:opening)<=from&&(!p.professional?.lastRegistration||p.professional.lastRegistration<=from);
  return {records,starts,startsKnown,teamGames,tracked,from,level};
}
export function proFieldTarget(s:GameState,p:Player=getPlayer(s)):Position|undefined {
  const adjacent:Partial<Record<Position,Position[]>>={C:["1B"],"1B":["3B"],"2B":["SS"],"3B":["1B"],SS:["2B"],LF:["RF"],CF:["LF","RF"],RF:["LF"]},order:Position[]=["C","1B","2B","3B","SS","LF","CF","RF"];
  const candidates=[...new Set([...p.eligiblePositions,...(adjacent[p.position]??[])])].filter(pos=>pos!==p.position&&(pos!=="C"||p.eligiblePositions.includes("C"))&&!['SP','RP','CP','DH'].includes(pos)&&roleScore(p,roleFor(pos))>=45&&(pos!=="CF"||p.stats.defense>=55&&p.stats.speed>=55));
  const rivals=(position:Position)=>s.players.filter(q=>q.id!==p.id&&q.teamId>=0&&q.teamId%10===p.teamId%10&&q.professional?.employment==="active"&&q.position===position).length;
  return candidates.sort((a,b)=>roleScore(p,roleFor(b))-roleScore(p,roleFor(a))||rivals(a)-rivals(b)||order.indexOf(a)-order.indexOf(b))[0];
}
