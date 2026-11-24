import type {EventFocus} from './event-selection';
import type {CareerEvent,CareerEventBranch,Player,Stat} from './types';

const fixedDecisions=new Set(['T10','P06','P08','PE08','PE09','PE10','PE11','PE12','PE18','PE25','PE26','PE27','PE29','PE84']);
const statKeys=new Set<Stat>(['contact','power','speed','defense','velocity','control','movement','stamina','recovery','arm','bq']);
type Choice=CareerEvent['choices'][number];

function beneficial(branch:CareerEventBranch,pitching:boolean){
  const match=branch.match;
  return Object.values(branch.weeks??{}).some(value=>value>0)||Object.values(branch.stats??{}).some(value=>value>0)
    ||(branch.reputation??0)>0||(branch.selectionBonus??0)>0||(branch.steal??0)>0||(branch.fatigue??0)<0||(branch.fatigueRange?.max??0)<0||!!branch.recoveryPercent
    ||!!match&&(pitching?((match.k??0)>0||(match.hit??0)<0||(match.hr??0)<0||(match.bb??0)<0):((match.hit??0)>0||(match.hr??0)>0||(match.bb??0)>0||(match.k??0)<0));
}

export function eventAbilityStats(event:CareerEvent,choice:Choice,player:Player,focus:EventFocus='bq'):Stat[]{
  const success=choice.outcomes[0];
  if(success.steal!==undefined)return ['speed'];
  const pitching=event.proEvent?.field?event.proEvent.field==='pitching':event.scene? !event.scene.batting:['선발','중간계투','마무리'].includes(player.primaryRole);
  if(success.match){
    if(!pitching){
      if((success.match.hr??0)>0)return ['power'];
      if((success.match.hit??0)>0||(success.match.k??0)<0)return ['contact'];
      if((success.match.bb??0)>0)return ['bq'];
    }else{
      if(/변화구|결정구|구종|슬라이더|커브|체인지업/.test(choice.label))return ['movement'];
      if(/코스|제구|낮게|낮은|침착/.test(choice.label))return ['control'];
      if((success.match.k??0)>0)return ['velocity'];
      return ['control'];
    }
  }
  const trained=[...new Set([...Object.entries(success.weeks??{}),...Object.entries(success.stats??{})].filter(([key,value])=>statKeys.has(key as Stat)&&value>0).map(([key])=>key as Stat))];
  if(trained.length)return trained;
  if((success.fatigue??0)<0||(success.fatigueRange?.max??0)<0||success.recoveryPercent)return ['recovery'];
  return focus==='physical'?['stamina','recovery','arm']:[focus];
}

// Center the ability adjustment on 50; one original event roll still decides the result.
export function abilityAdjustedEventOutcomes(event:CareerEvent,choice:Choice,player:Player,focus:EventFocus='bq'):CareerEventBranch[]{
  const outcomes=choice.outcomes;
  if(fixedDecisions.has(event.definitionId)||event.nationalContext||event.proEvent?.nationalKind||event.proEvent?.channel==='major'||event.proEvent?.channel==='followup'||event.proEvent?.target||outcomes.length!==2)return outcomes;
  const [success,failure]=outcomes;
  if(success.weight<=0||success.weight>=100||Math.abs(success.weight+failure.weight-100)>1e-9)return outcomes;
  const pitching=event.proEvent?.field?event.proEvent.field==='pitching':event.scene?!event.scene.batting:['선발','중간계투','마무리'].includes(player.primaryRole);
  if(!beneficial(success,pitching)||beneficial(failure,pitching))return outcomes;
  const keys=eventAbilityStats(event,choice,player,focus);
  const ability=keys.reduce((sum,key)=>sum+Math.max(0,Math.min(100,player.stats[key]??0)),0)/keys.length;
  const weight=Math.max(0,Math.min(100,success.weight+(ability-50)*.5));
  return [{...success,weight},{...failure,weight:100-weight}];
}
