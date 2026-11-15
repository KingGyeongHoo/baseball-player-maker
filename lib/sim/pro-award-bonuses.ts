import type {GameState,Player} from './types';
import type {ProAward} from './pro-types';

export const awardBonusPoints={mvp:3,goldGlove:2,rookie:2,wildcardMvp:1,semiMvp:1,playoffMvp:1,finalMvp:1} as const;
export function awardCategory(award:ProAward){
  if(award.category==='seriesMvp')return award.series?`${award.series}Mvp` as const:undefined;
  return award.category??(award.kind==='시즌 MVP'?'mvp':award.kind.startsWith('골든글러브')?'goldGlove':award.kind==='신인왕'?'rookie':undefined);
}
export const awardRatingBonus=(p:Player)=>Math.min(10,(p.professional?.awardBonuses??[]).reduce((sum,row)=>sum+row.points,0));
// Reconcile from announced trophies, rather than incrementing a score on load
// or acknowledgment. Each season/category can grant its bonus only once.
export function syncAwardBonuses(s:GameState){
  if(!s.proWorld)return false;
  const byPlayer=new Map<string,NonNullable<NonNullable<Player['professional']>['awardBonuses']>>();
  const collect=(award:ProAward,year:number)=>{const category=awardCategory(award);if(!category)return;
    const rows=byPlayer.get(award.playerId)??[];
    if(!rows.some(row=>row.year===year&&row.category===category))rows.push({year,category,points:awardBonusPoints[category]});
    byPlayer.set(award.playerId,rows);
  };
  for(const season of s.proWorld.seasons){
    for(const award of season.awards){if(award.category!=='seriesMvp'&&season.awardsCeremony&&!season.awardsCeremony.presentedAt)continue;collect(award,season.year);}
  }
  for(const series of s.proWorld.postseason?.series??[])if(series.winner!==undefined&&series.mvp)collect(series.mvp,s.proWorld.year);
  let changed=false;
  for(const p of s.players){if(!p.professional)continue;const rows=byPlayer.get(p.id)??[];
    if(JSON.stringify(p.professional.awardBonuses??[])!==JSON.stringify(rows)){p.professional.awardBonuses=rows;changed=true;}
  }
  return changed;
}
