import {accumulation,clamp,isPitcher,params,ticketsUsed,trainingEffort,trainingFatigueDay} from './engine';
import {conditioningMultiplier} from './offseason-shop';
import {emptyInjuryLoad,injuryRiskEstimate,injuryTrainingPolicy,injuryView} from './injury-system';
import {injuryRules as rules} from './injury-rules';
import type {Player,Policy} from './types';

// Illustrative single-action estimates, with the same post-load fatigue order as live play.
export function injuryActionPreview(p:Player,policy:Policy,date:string){
  const view=injuryView(p,date),allowed=injuryTrainingPolicy(p,policy,date),used=ticketsUsed(allowed);
  const resting=p.forcedRest||policy.mode==='rest'||!!p.injuryRetirement;
  const fatigue=trainingFatigueDay(p.fatigue,p.stats.recovery,resting?0:allowed,conditioningMultiplier(p));
  const trainingLoad=!resting&&used?(rules.trainingBaseLoad+trainingEffort(allowed).equivalentTickets/rules.trainingTicketReference)*rules.trainingLoadScale*(view.stage==='rehab'?rules.rehabLoad:1):0;
  const trainingFatigue=Math.max(p.fatigue,fatigue.end);
  const training=injuryRiskEstimate(p,{...emptyInjuryLoad(),key:'preview',date,cause:'training',fatigue:trainingFatigue,training:trainingLoad});
  const pitching=isPitcher(p.primaryRole)||!!p.twoWay,batting=!isPitcher(p.primaryRole)||!!p.twoWay;
  const innings=p.primaryRole==='선발'?6:2,outs=pitching?innings*3:0;
  const fielding=batting&&p.position!=='DH'&&!p.twoWay;
  const gameFatigue=clamp(p.fatigue+(outs*params['fatigue.pitch_out']*params[`stance.${p.stance.pitching}_cost`]+(fielding?params['fatigue.field_game']:0))*accumulation(p.stats.stamina)*conditioningMultiplier(p));
  const game=injuryRiskEstimate(p,{key:'preview',date,cause:'game',fatigue:gameFatigue,training:0,pitching:outs/3*4*rules.pitchingLoadPerBatter,batting:batting?4*rules.battingLoadPerPA:0,fielding:fielding?rules.fieldingGameLoad:0});
  return {view,allowed,training,trainingFatigue,game,gameFatigue,gameAllowed:!resting&&!view.remaining,gameAssumption:[pitching?`${innings}이닝·이닝당 4타자`:'',batting?'4타석':'',fielding?'9이닝 수비':''].filter(Boolean).join(' + ')};
}
