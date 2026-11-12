import {addDays,available,hash,params,pitchingRole,roleScore,selectionScore} from './engine';
import type {Game,GameState,Player} from './types';
import {guaranteedProStarter} from './pro-positions';
import {farmSelectionTier,proGameTeam} from './pro-farm-roster';
export const PRO_BALANCE_VERSION=3;
export const proPitchingWorkloadTargets={SP:{games:26.8,innings:146.4,perGame:5.46},RP:{games:56,innings:53.3,perGame:.95},CP:{games:59.5,innings:61.1,perGame:1.03}} as const;

// Calibration targets are diagnostics, never caps on a player's records.
export const proSeasonTargets={
  hitters:{H:{max:[185,205],mean:[75,85]},HR:{max:[35,55],mean:[7,11]},RBI:{max:[118,158],mean:[36,44]},AVG:{max:[.350,.380],mean:[.260,.280]},OPS:{max:[.978,1.138],mean:[.710,.770]}},
  pitching:{ERA:{min:[1.3,1.8],mean:[3.9,4.2]},SP:{winsMax:[17,23],winsMean:[9,12],lossesMax:[13,17],lossesMean:[6,9]},RP:{holdsMax:[32,41],holdsMean:[5,8]},CP:{savesMax:[31,37],savesMean:[20,28]}},
} as const;

export function proMatchParameters(base:Record<string,number>):Record<string,number>{
  return {...base,'pro.balance.version':PRO_BALANCE_VERSION,'match.hit_base':.260,'match.hit_slope':.004,'match.defense_center':65,
    'match.hr_base':.089,'match.hr_slope':.006,'match.hr_min':.015,'match.hr_max':.36,
    'match.double_base':.175,'match.k_base':.29,'match.k_slope':.003,'match.k_max':.48};
}

export function proBullpenPlan(pitchers:Player[],seed:string,date:string,side:number,recent:Game[]=[],eligibleIds?:Set<string>,evaluationIds?:Set<string>){
  const byAbility=(a:Player,b:Player)=>Number(evaluationIds?.has(b.id)??false)-Number(evaluationIds?.has(a.id)??false)||farmSelectionTier(a)-farmSelectionTier(b)||Number(guaranteedProStarter(b,b.position,date))-Number(guaranteedProStarter(a,a.position,date))||roleScore(b,pitchingRole(b))-roleScore(a,pitchingRole(a))||a.id.localeCompare(b.id);
  const closers=pitchers.filter(p=>pitchingRole(p)==='마무리').sort(byAbility);
  const relief=pitchers.filter(p=>pitchingRole(p)==='중간계투').sort(byAbility);
  const club=pitchers[0]?proGameTeam(pitchers[0]):side,key=`${seed}:${date}:${club}:${side}`;
  const mainCloser=closers[0],backupCloser=relief[0];
  const ready=(p:Player|undefined)=>!!p&&(!eligibleIds||eligibleIds.has(p.id))&&available(p,date)&&p.fatigue<params['coach.replace_fatigue']&&proReliefReady(p,date,undefined,recent);
  // One main closer. One designated middle reliever covers only when the main
  // closer cannot pitch; he remains a middle reliever on other days.
  const closer=ready(mainCloser)?mainCloser:ready(backupCloser)?backupCloser:undefined;
  const middle=relief.filter(p=>p.id!==closer?.id);
  const closerId=closer?.id,mainCloserId=mainCloser?.id,backupCloserId=backupCloser?.id;
  const setupId=middle.find(p=>guaranteedProStarter(p,p.position,date))?.id??middle[hash(`${key}:setup`)%Math.max(1,Math.min(3,middle.length))]?.id;
  const bridgeId=middle.find(p=>p.id!==setupId)?.id;
  const longReliefId=[...middle].sort((a,b)=>farmSelectionTier(a)-farmSelectionTier(b)||b.stats.stamina-a.stats.stamina||a.id.localeCompare(b.id))[0]?.id;
  const earlyCloser=!!closerId&&hash(`${seed}:${date}:${closerId}:length`)%100<30;
  return {closerId,mainCloserId,backupCloserId,setupId,bridgeId,longReliefId,earlyCloser};
}

export function proPitcherOutLimit(p:Player,starter:boolean,seed:string,date:string,closerId?:string,_bridgeId?:string,lead?:number,runs=0,batters=0,currentOuts=0){
  const roll=hash(`${seed}:${date}:${p.id}:length`)%100;
  // A struggling outing can end with zero or one out. A rare good day can
  // reach eight innings or a three-inning relief stint, without record caps.
  if(runs>=(starter?4:2)&&batters>=(starter?12:5))return currentOuts;
  if(!starter)return p.id===closerId||pitchingRole(p)==='마무리'?(roll<30?6:3):roll<3?9:roll<10?6:roll<12?1:roll<18?2:3;
  if(roll<3&&runs<=1&&p.fatigue<65)return 24;
  const variation=hash(`${seed}:${date}:${p.id}:starter-length`)%5-2;
  return Math.max(12,Math.min(21,Math.round(18.4+(p.stats.stamina-65)*.06)+variation+(lead!==undefined&&lead<0?-1:0)));
}

export function proReliefPriority(p:Player,date:string,inning:number,lead:number,closerId?:string,longReliefId?:string,setupId?:string,bridgeId?:string,teamGames=144){
  const role=pitchingRole(p),save=inning>=9&&lead>=1&&lead<=3;
  const days=p.lastPitched?(Date.parse(date)-Date.parse(p.lastPitched))/86400000:10;
  // Reserve the closer for saves; distribute middle relief rather than exhausting
  // the strongest pitcher every day. Starters are emergency long relief only.
  const record=p.seasonByLevel?.[p.teamId<10?'first':'second']??p.seasonStats;
  const outings=record.games?.pitching??record.pitching.outs/3,innings=record.pitching.outs/3;
  const excess=Math.max(0,outings-(role==='마무리'?59.5:56)*Math.min(1,(teamGames+1)/144));
  return -1000*farmSelectionTier(p)+selectionScore(p,role)*.35+(guaranteedProStarter(p,p.position,date)?15:0)+(p.id===closerId?(save?100:-200):role==='마무리'?-70:15)
    +(p.id===setupId&&inning>=7&&inning<9&&lead>=1&&lead<=3?15:0)
    +(p.id===bridgeId&&inning>=6&&inning<7?10:0)+(p.id===longReliefId&&inning<5?15:0)
    -(days<=1?30:days<3?8:0)-outings*.65-innings*.35-excess*(role==='마무리'?25:8);
}
export function proReliefReady(p:Player,date:string,_longReliefId?:string,recent:Game[]=[]){
  if(pitchingRole(p)==='선발'||p.lastPitched===date)return false;
  if(recent.length>=12){
    const record=p.seasonByLevel?.[p.teamId<10?'first':'second'],target=pitchingRole(p)==='마무리'?59.5:56;
    if((record?.games?.pitching??0)>target*Math.min(1,recent.length/144)+2)return false;
  }
  if(p.lastPitched!==addDays(date,-1))return true;
  // Two consecutive days require a day off. Holidays and rainouts are not
  // appearances; inspect actual pitching records instead of dates alone.
  return !recent.some(g=>g.date===addDays(date,-2)&&(g.boxScore[p.id]?.pitching.BF??0)>0);
}

export function proRecentTeamGames(s:GameState,team:number,date:string){
  const competition=team<10?'pro-first':'pro-second';
  return s.calendar.events.filter(g=>(g.competitionId===competition||competition==='pro-second'&&g.competitionId.startsWith('pro-farm-playoffs-'))&&!g.exhibition&&g.status==='completed'&&g.date<=date&&[g.homeTeamId,g.awayTeamId].includes(team)).sort((a,b)=>a.date.localeCompare(b.date));
}
export function proStarterReady(s:GameState,p:Player,date:string,team=proGameTeam(p)){
  if(pitchingRole(p)!=='선발'||!available(p,date)||p.fatigue>=params['coach.starter_fatigue']||p.lastPitched&&date<addDays(p.lastPitched,params['coach.starter_rest']+1))return false;
  return !proRecentTeamGames(s,team,date).slice(-4).some(g=>g.lineup[g.homeTeamId===team?0:1]?.[9]===p.id||(g.boxScore[p.id]?.pitching.BF??0)>0);
}
export function proRotationStarter(s:GameState,pitchers:Player[],date:string){
  if(s.proWorld?.stage==='postseason')return undefined;
  if(!pitchers.length)return undefined;
  const team=proGameTeam(pitchers[0]),starts=new Map<string,number>();
  for(const game of proRecentTeamGames(s,team,date)){
    const id=game.lineup[game.homeTeamId===team?0:1]?.[9];if(id)starts.set(id,(starts.get(id)??0)+1);
  }
  const starters=[...pitchers].filter(p=>pitchingRole(p)==='선발').sort((a,b)=>farmSelectionTier(a)-farmSelectionTier(b)||Number(guaranteedProStarter(b,b.position,date))-Number(guaranteedProStarter(a,a.position,date))||roleScore(b,pitchingRole(b))-roleScore(a,pitchingRole(a))||a.id.localeCompare(b.id));
  const ready=starters.slice(0,5).filter(p=>proStarterReady(s,p,date,team));
  const backup=starters.slice(5).find(p=>proStarterReady(s,p,date,team));
  if(backup&&!ready.length)return backup;
  if(ready.length)return ready.sort((a,b)=>farmSelectionTier(a)-farmSelectionTier(b)||(starts.get(a.id)??0)-(starts.get(b.id)??0)||selectionScore(b,pitchingRole(b))-selectionScore(a,pitchingRole(a))||a.id.localeCompare(b.id))[0];
  // A vacancy must be covered by a genuine reserve starter. Neither an opener
  // nor a closer can bypass the rotation's role and rest requirements.
  return undefined;
}
