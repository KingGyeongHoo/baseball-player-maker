import {addDays,hash,params,pitchingRole,roleScore,selectionScore} from './engine';
import type {GameState,Player} from './types';
export const PRO_BALANCE_VERSION=2;

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

export function proBullpenPlan(pitchers:Player[],seed:string,date:string,side:number){
  const byAbility=(a:Player,b:Player)=>roleScore(b,pitchingRole(b))-roleScore(a,pitchingRole(a))||a.id.localeCompare(b.id);
  const closers=pitchers.filter(p=>pitchingRole(p)==='마무리').sort(byAbility);
  const relief=pitchers.filter(p=>pitchingRole(p)==='중간계투').sort(byAbility);
  const starters=pitchers.filter(p=>pitchingRole(p)==='선발').sort(byAbility);
  const club=pitchers[0]?.teamId??side,key=`${seed}:${date}:${club}:${side}`;
  const closerId=closers[closers.length>1&&hash(`${key}:save-rest`)%100<28?1:0]?.id;
  // The reserve closer can bridge two innings when the primary closer is on
  // closing duty. Both hold and save opportunities still come from the score.
  const setupId=closers.length>1&&closerId===closers[0].id&&hash(`${key}:setup`)%100<95?closers[1].id:relief[0]?.id;
  const bridgeId=hash(`${key}:bridge`)%100<80?relief[0]?.id:undefined;
  return {closerId,setupId,bridgeId,longReliefId:starters.at(-1)?.id};
}

export function proPitcherOutLimit(p:Player,starter:boolean,seed:string,date:string,closerId?:string,bridgeId?:string,lead?:number){
  if(!starter)return pitchingRole(p)==='마무리'?(closerId&&closerId!==p.id?6:3):pitchingRole(p)==='선발'?9:p.id===bridgeId?6:6-(hash(`${seed}:${date}:${p.id}:length`)%3===0?3:0);
  // Approximately 5–6⅔ innings, reflecting stamina and outing-to-outing variation.
  // A tied game moves to the rested bullpen after five innings; keep the
  // winning starter longer rather than assigning another full inning by rank.
  if(lead===0)return 15;
  const situation=lead===undefined?0:lead>0?1:-1;
  return Math.max(15,Math.min(20,Math.round(16+(p.stats.stamina-65)*.08)+(hash(`${seed}:${date}:${p.id}:length`)%3-1)+situation));
}

export function proReliefPriority(p:Player,date:string,inning:number,lead:number,closerId?:string,longReliefId?:string,setupId?:string,bridgeId?:string){
  const role=pitchingRole(p),save=inning>=9&&lead>=1&&lead<=3;
  const days=p.lastPitched?(Date.parse(date)-Date.parse(p.lastPitched))/86400000:10;
  // Reserve the closer for saves; distribute middle relief rather than exhausting
  // the strongest pitcher every day. Starters are emergency long relief only.
  const workload=p.seasonStats.pitching.outs;
  return selectionScore(p,role)+(p.id===closerId?(save?100:-45):role==='선발'&&p.id!==longReliefId?-55:15)
    +(p.id===setupId&&inning>=7&&inning<9&&lead>=1&&lead<=3?65:0)
    +(p.id===bridgeId?(inning>=6&&inning<7&&lead>=1&&lead<=3?65:lead<=0||lead>3?-25:0):0)
    +(p.id===longReliefId&&inning<7?25:0)
    -(days<=1?35:days<3?12:0)-(p.id===closerId?0:workload/8);
}
export function proReliefReady(p:Player,date:string,longReliefId?:string){
  return pitchingRole(p)!=='선발'||!p.lastPitched||date>=addDays(p.lastPitched,p.id===longReliefId?3:4);
}

export function proRotationStarter(s:GameState,pitchers:Player[],date:string){
  if(s.proWorld?.stage==='postseason')return undefined;
  const rotation=[...pitchers].filter(p=>pitchingRole(p)==='선발').sort((a,b)=>roleScore(b,pitchingRole(b))-roleScore(a,pitchingRole(a))||a.id.localeCompare(b.id)).slice(0,5);
  const ready=rotation.filter(p=>p.fatigue<params['coach.starter_fatigue']&&(!p.lastPitched||date>=addDays(p.lastPitched,params['coach.starter_rest']+1)));
  if(!ready.length)return undefined;
  const team=ready[0].teamId,competition=team<10?'pro-first':'pro-second',starts=new Map<string,number>();
  for(const game of s.calendar.events){
    if(game.competitionId!==competition||game.status!=='completed'||game.date>=date)continue;
    const side=game.homeTeamId===team?0:game.awayTeamId===team?1:-1;
    if(side<0)continue;const id=game.lineup[side]?.[9];if(id)starts.set(id,(starts.get(id)??0)+1);
  }
  // Calendar rest alone permits the ace to skip the fifth starter after every
  // Monday off. Balance actual starts within the rested five-man rotation.
  return ready.sort((a,b)=>(starts.get(a.id)??0)-(starts.get(b.id)??0)||selectionScore(b,pitchingRole(b))-selectionScore(a,pitchingRole(a))||a.id.localeCompare(b.id))[0];
}
