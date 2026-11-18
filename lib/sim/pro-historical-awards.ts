import {individualAwards} from './pro-individual-awards';
import {rookieOfYearAward} from './pro-evaluation';
import {syncAwardBonuses} from './pro-award-bonuses';
import {backfillSeriesMvps} from './pro-series-awards';
import type {GameState,Player,Position} from './types';

export function backfillSeasonHonors(s:GameState){
  const report:{rookies:{year:number;playerId?:string;playerName?:string;recordedPlayers:number}[];homeRuns:{year:number;level:'first'|'second';value:number;names:string[]}[];changed:boolean}={rookies:[],homeRuns:[],changed:false};
  if(!s.proWorld)return report;
  report.changed=backfillSeriesMvps(s);
  for(const season of s.proWorld.seasons){
    const missingRookie=season.rookieRulesVersion!==1;
    const missingCountingTitle=(['first','second'] as const).some(level=>
      ['HR','SO'].some(metric=>!season.individualAwards?.some(row=>row.level===level&&row.metric===metric)));
    if(!missingRookie&&!missingCountingTitle)continue;
    const players=s.players.flatMap(p=>{
      const old=p.career.find(row=>row.careerMode==='pro'&&row.year===season.year);
      const levels=old?.byLevel??(s.calendar.seasonYear===season.year&&s.proWorld!.seasonClosed?p.seasonByLevel:undefined);
      if(!p.professional||!levels)return [];
      const role=p.professional.assessments?.find(row=>row.year===season.year)?.role??p.primaryRole;
      const position:Position=role==='선발'?'SP':role==='중간계투'?'RP':role==='마무리'?'CP':p.position;
      return [{...p,primaryRole:role,position,teamId:old?.schoolId??p.teamId,seasonByLevel:levels} as Player];
    });
    if(!players.length)continue;
    const archived={...s,players,calendar:{...s.calendar,seasonYear:season.year}};
    if(missingRookie){
      const winner=rookieOfYearAward(archived);
      season.awards=season.awards.filter(row=>row.category!=='rookie'&&row.kind!=='신인상'&&row.kind!=='신인왕');
      if(winner)season.awards.push(winner);
      season.rookieRulesVersion=1;report.changed=true;
      report.rookies.push({year:season.year,recordedPlayers:players.length,...(winner?{playerId:winner.playerId,playerName:winner.playerName}:{})});
    }
    if(missingCountingTitle)for(const award of individualAwards(archived).filter(row=>row.metric==='HR'||row.metric==='SO')){
      season.individualAwards??=[];
      if(season.individualAwards.some(row=>row.level===award.level&&row.metric===award.metric))continue;
      season.individualAwards.push(award);report.changed=true;
      if(award.metric==='HR')report.homeRuns.push({year:season.year,level:award.level,value:award.value,names:award.winners.map(row=>row.playerName)});
    }
  }
  report.changed=syncAwardBonuses(s)||report.changed;
  return report;
}
