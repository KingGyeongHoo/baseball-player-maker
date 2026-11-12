import type {EventCategory} from './event-stories';
import type {Player,Stat,Stats} from './types';

export type EventFocus='velocity'|'control'|'movement'|'contact'|'power'|'speed'|'defense'|'physical'|'bq';
export type EventFocusRule=EventFocus|'precision'|'force'|'weak'|'strong'|'fielding';
const pitchingCore:Stat[]=['velocity','control','movement'];
const battingCore:Stat[]=['contact','power','speed','defense'];
export type EventField='pitching'|'batting';
export function eventFieldsFor(player:Pick<Player,'twoWay'|'primaryRole'>,focus?:EventFocusRule,explicit?:EventField):EventField[]{
  if(explicit)return [explicit];
  if(!player.twoWay)return [['선발','중간계투','마무리'].includes(player.primaryRole)?'pitching':'batting'];
  if(pitchingCore.includes(focus as Stat))return ['pitching'];
  if(battingCore.includes(focus as Stat))return ['batting'];
  return player.twoWay?['pitching','batting']:['선발','중간계투','마무리'].includes(player.primaryRole)?['pitching']:['batting'];
}

export function resolveEventFocus(focus:EventFocusRule|undefined,pitching:boolean,stats:Stats):EventFocus {
  const core=pitching?pitchingCore:battingCore;
  if(focus==='precision')return pitching?'control':'contact';
  if(focus==='force')return pitching?'velocity':'power';
  if(focus==='fielding')return pitching?'control':'defense';
  if(focus==='weak'||focus==='strong')return core.reduce((a,b)=>(focus==='weak'?stats[b]<stats[a]:stats[b]>stats[a])?b:a) as EventFocus;
  return focus??'bq';
}

// The focus is drawn before the ID/date so a larger catalog or more eligible
// dates cannot increase a skill's frequency. Missing focuses are renormalized.
export function eventFocusPool<T>(candidates:T[],focus:(candidate:T)=>EventFocus,pitching:boolean,roll:number,twoWay=false):T[]{
  const core=pitching?pitchingCore:battingCore;
  const weights:[EventFocus,number][]=twoWay
    ?[...pitchingCore.map(key=>[key as EventFocus,.4/pitchingCore.length] as [EventFocus,number]),...battingCore.map(key=>[key as EventFocus,.4/battingCore.length] as [EventFocus,number]),['physical',.1],['bq',.1]]
    :[...core.map(key=>[key as EventFocus,.8/core.length] as [EventFocus,number]),['physical',.1],['bq',.1]];
  const groups=weights.map(([key,weight])=>({weight,items:candidates.filter(c=>focus(c)===key)})).filter(g=>g.items.length);
  const total=groups.reduce((sum,g)=>sum+g.weight,0);
  let remaining=roll*total;
  for(const group of groups){remaining-=group.weight;if(remaining<0)return group.items;}
  return groups.at(-1)?.items??[];
}

export const baseballEventChance=.9;

// Choose the category before choosing an event ID. Catalog size, available
// dates and the number of buttons must not set the category's draw weight.
// When a category has no eligible events, use the other eligible category.
export function eventCategoryPool<T>(candidates:T[],category:(candidate:T)=>EventCategory,roll:number):T[]{
  const baseball=candidates.filter(c=>category(c)==='baseball'),daily=candidates.filter(c=>category(c)==='daily');
  if(!baseball.length)return daily;
  if(!daily.length)return baseball;
  return roll<baseballEventChance?baseball:daily;
}
