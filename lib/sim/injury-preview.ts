import {accumulation,clamp,isPitcher,params,ticketsUsed,trainingEffort,trainingFatigueDay} from './engine';
import {conditioningMultiplier,equipmentStats} from './offseason-shop';
import {emptyInjuryLoad,injuryRiskEstimate,injuryTrainingPolicy,injuryView} from './injury-system';
import {injuryRules as rules} from './injury-rules';
import type {Player,Policy} from './types';
import {proPitchFatigueRate,proPitchingFatigueRules,proPitchStint,proStarterEligible} from './pro-pitching-fatigue';

// Illustrative single-action estimates, with the same post-load fatigue order as live play.
export function injuryActionPreview(p:Player,policy:Policy,date:string){
  const view=injuryView(p,date),allowed=injuryTrainingPolicy(p,policy,date),used=ticketsUsed(allowed);
  const resting=p.forcedRest||policy.mode==='rest'||!!p.injuryRetirement;
  const professional=p.careerMode==='pro'||!!p.professional;
  const fatigue=trainingFatigueDay(p.fatigue,equipmentStats(p).recovery,resting?0:allowed,conditioningMultiplier(p),professional);
  const trainingLoad=!resting&&used?(rules.trainingBaseLoad+trainingEffort(allowed).equivalentTickets/rules.trainingTicketReference)*rules.trainingLoadScale*(view.stage==='rehab'?rules.rehabLoad:1):0;
  const trainingFatigue=Math.max(p.fatigue,fatigue.peak,fatigue.end);
  const training=injuryRiskEstimate(p,{...emptyInjuryLoad(),key:'preview',date,cause:'training',fatigue:trainingFatigue,training:trainingLoad});
  const pitching=isPitcher(p.primaryRole)||!!p.twoWay,batting=!isPitcher(p.primaryRole)||!!p.twoWay;
  const starter=(p.twoWay?.pitchingPosition??p.position)==='SP';
  const innings=starter?6:professional?1:2,outs=pitching?innings*3:0;
  const fielding=batting&&p.position!=='DH'&&!p.twoWay;
  const rate=proPitchFatigueRate(equipmentStats(p).stamina,conditioningMultiplier(p));
  const pitches=Math.min(innings*16,proPitchStint(p.fatigue,rate,starter).budget+4);
  const pitchingFatigue=professional?(pitching?pitches*rate:0):outs*params['fatigue.pitch_out']*accumulation(equipmentStats(p).stamina)*conditioningMultiplier(p);
  const gameFatigue=clamp(p.fatigue+pitchingFatigue+(fielding?params['fatigue.field_game']*accumulation(equipmentStats(p).stamina)*conditioningMultiplier(p):0));
  const game=injuryRiskEstimate(p,{key:'preview',date,cause:'game',fatigue:gameFatigue,training:0,pitching:outs/3*4*rules.pitchingLoadPerBatter,batting:batting?4*rules.battingLoadPerPA:0,fielding:fielding?rules.fieldingGameLoad:0});
  const pitchingAllowed=!professional||!pitching||(starter?proStarterEligible(p)&&p.fatigue<80:p.fatigue<proPitchingFatigueRules.relieverLimit);
  return {view,allowed,training,trainingFatigue,game,gameFatigue,gameAllowed:!resting&&!view.remaining&&pitchingAllowed,gameAssumption:[pitching?professional?`추정 ${pitches}구`:`${innings}이닝·이닝당 4타자`:'',batting?'4타석':'',fielding?'9이닝 수비':''].filter(Boolean).join(' + ')};
}
