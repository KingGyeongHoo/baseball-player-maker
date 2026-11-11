import {clamp,emptyRecord,hash,isPitcher,params,previewPlayer,random,reputationScore} from './engine';
import {seededPlayerName} from './player-names';
import type {Player,Position} from './types';

export const firstTeamCapacity=29;
export const proRosterPositions:Position[]=['C','C','1B','2B','2B','3B','SS','SS','LF','LF','CF','CF','RF','RF','DH',...Array<Position>(6).fill('SP'),...Array<Position>(8).fill('RP'),'CP'];
export function firstTeamSlots(seed:string,club:number):Position[]{
  const pitchers=12+hash(`${seed}:${club}:pitcher-depth`)%4,starters=5+hash(`${seed}:${club}:starter-depth`)%2;
  const hitters:Position[]=['C','SS','CF','2B','1B','3B','LF','RF','DH','C','SS','CF','2B','LF','RF','1B','3B'];
  return [...hitters.slice(0,firstTeamCapacity-pitchers),...Array<Position>(starters).fill('SP'),...Array<Position>(pitchers-starters-1).fill('RP'),'CP'];
}

export function createCareerNPC(seed:string,teamId:number,index:number,mode:'pro'|'college',first:boolean,position:Position):Player {
  const n=hash(`${seed}:name`),p=previewPlayer(seed,seededPlayerName(`${seed}:player-name`),position);
  p.id=`${mode}-npc-${teamId}-${index}`;p.teamId=teamId;p.grade=mode==='pro'?0:4;
  p.careerMode=mode;p.age=mode==='pro'?(first?24:20)+n%10:19+n%4;
  const main=isPitcher(p.primaryRole)?['velocity','control','movement']:['contact','power','speed','defense'];
  const source={rngStates:{generation:hash(seed),training:0,match:0,injury:0,draft:0,events:0}};
  const profile=mode==='pro'?(hash(`${seed}:ability-profile`)%10001/10000-.5)*(isPitcher(p.primaryRole)?22:26):0;
  for(const key of Object.keys(p.stats) as (keyof Player['stats'])[]){
    const core=main.includes(key),shared=['stamina','recovery','arm','bq'].includes(key);
    const center=core||shared?first?params['pro.first_mean']:mode==='college'?core?50.5:55.5:params['pro.second_mean']:params['pro.secondary_mean'];
    p.stats[key]=clamp(center+(core?profile:0)+(random(source,'generation')-.5)*(core&&mode==='pro'?(isPitcher(p.primaryRole)?25:28):core||shared?15:10),1);
  }
  p.initialStats={...p.stats};p.performanceReputation=null;p.reputation=reputationScore(p);
  if(mode==='pro')p.seasonByLevel={first:emptyRecord(),second:emptyRecord()};
  return p;
}
