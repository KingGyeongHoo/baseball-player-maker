import {emptyRecord} from './sim/engine';
import {proWarAssessment,type ProWarContext} from './sim/pro-war';
import type {PlayerSeason} from './player-records';
import type {Player} from './sim/types';
import type {ProWarLine} from './sim/pro-types';

export function playerSeasonWar(player:Player,season:PlayerSeason,scope:string,club='all',context?:ProWarContext){
  if(season.careerMode!=='pro'||scope==='highSchool')return null;
  const regular=['all','first','second'].includes(scope);
  const frozen=club==='all'&&regular?player.professional?.assessments?.find(r=>r.year===season.year)?.war:undefined;
  const split=regular?season.byLevel:undefined;
  const second=scope==='second'||scope==='farmPostseason';
  const calculated=frozen??proWarAssessment({...player,seasonByLevel:split??{
    first:second?emptyRecord():season.records,second:second?season.records:emptyRecord(),
  }},context);
  const lines=scope==='all'?[calculated.first,calculated.second]:[second?calculated.second:calculated.first];
  const role=player.professional?.assessments?.find(r=>r.year===season.year)?.role;
  const relief=role?['중간계투','마무리'].includes(role):['RP','CP'].includes(player.twoWay?.pitchingPosition??player.position);
  const sum=(fn:(line:ProWarLine)=>number)=>lines.reduce((total,line)=>total+fn(line),0);
  return {batting:sum(r=>r.batting+r.fielding+r.positional),pitching:sum(r=>r.pitching*(relief?3:1))};
}
