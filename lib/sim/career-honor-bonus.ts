import {seasonAwardsPublished} from './season-awards-publication';
import {individualTitleFromKind,individualTitleName} from './pro-individual-titles';
import {proTeamName} from './club-names';
import type {GameState} from './types';

type BonusIndex=Map<string,Map<number,Map<number,Map<string,number>>>>;
export function buildCareerHonorBonusIndex(s:GameState,includeUnannounced=false):BonusIndex{
  const index:BonusIndex=new Map();
  const add=(id:string,year:number,club:number,key:string,tenths:number)=>{
    const years=index.get(id)??new Map(),clubs=years.get(year)??new Map(),awards=clubs.get(club)??new Map();
    awards.set(key,tenths);clubs.set(club,awards);years.set(year,clubs);index.set(id,years);
  };
  for(const season of s.proWorld?.seasons??[]){
    if(!includeUnannounced&&!seasonAwardsPublished(s,season))continue;
    for(const award of season.awards){
      if(award.level==='second')continue;
      if(award.category==='mvp'||!award.category&&award.kind==='시즌 MVP')add(award.playerId,season.year,award.club,'mvp',10);
      if(award.category==='goldGlove'||!award.category&&award.kind.startsWith('골든글러브'))add(award.playerId,season.year,award.club,'goldGlove',5);
      const title=individualTitleFromKind(award.kind);if(title)add(award.playerId,season.year,award.club,`title:${title}`,5);
    }
    for(const award of season.individualAwards??[]){
      if(award.level!=='first')continue;
      const title=individualTitleName(award);if(!title)continue;
      for(const winner of award.winners)add(winner.playerId,season.year,winner.club,`title:${title}`,5);
    }
  }
  for(const entry of s.nationalTeams??[]){
    if(entry.kind==='youth')continue;
    for(const member of entry.roster){
      const team=(member.team??'').replace(/ (?:1군|2군|잔류군\(3군\)|육성선수)$/,'');
      const club=member.club??Array.from({length:10},(_,id)=>id).find(id=>proTeamName(id)===team)??-1;
      add(member.id,entry.year,club,`national:${entry.kind}`,2);
    }
  }
  return index;
}
export function careerHonorBonusYears(index:BonusIndex,playerId:string,club?:number,throughYear=Infinity){
  const result=new Map<number,number>();
  for(const [year,clubs] of index.get(playerId)??[]){
    if(year>throughYear)continue;
    const awards=new Map<string,number>();
    for(const [id,entries] of clubs)if(club===undefined||club===id)for(const [key,points] of entries)awards.set(key,points);
    const points=Math.min(30,[...awards.values()].reduce((sum,n)=>sum+n,0))/10;
    if(points)result.set(year,points);
  }
  return result;
}
