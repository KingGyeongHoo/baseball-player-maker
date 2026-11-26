import {random} from './engine';
import {injuryBodies,injuryGrade,injuryRules as rules,type InjuryBody,type InjuryGrade,type RecoveryStage} from './injury-rules';
import {ticketKeys,statKeys,type GameState,type Player,type Policy,type Stats,type Ticket} from './types';
export type InjuryLoad={training:number;pitching:number;batting:number;fielding:number};
export type InjuryExposure=InjuryLoad&{key:string;date:string;cause:'training'|'game'|'event'|'legacy';fatigue:number;trainingTickets?:Partial<Record<Ticket,number>>;recentLoad?:number};
export type InjuryEpisode={
  id:string;key:string;date:string;season:number;body:InjuryBody;severity:InjuryGrade;cause:InjuryExposure['cause'];
  fatigue:number;load:InjuryLoad&{recent:number};requiredDays:number;treatmentUntil:string;unavailableUntil:string;adaptationUntil:string;
  returnedOn?:string;missedDays?:number;recurrence:boolean;previousId?:string;temporary:Partial<Stats>;permanent:Partial<Stats>;
  permanentApplied:boolean;state:RecoveryStage;retired:boolean;updatedAt:string;medicalReportRead?:boolean;
};
export type InjuryWorkload={date:string;load:number;keys:string[]}[];
export type InjurySeasonAdjustment={days:number;penalty:number;reason:string};
const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const add=(date:string,days:number)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
// Every player shares calendar dates. Cache only immutable parsing results,
// never player state; bound memory across long careers and save switches.
const dateMilliseconds=new Map<string,number>();
function timestamp(date:string){
  const cached=dateMilliseconds.get(date);if(cached!==undefined)return cached;
  const value=Date.parse(date);
  if(dateMilliseconds.size>=1024)dateMilliseconds.clear();
  dateMilliseconds.set(date,value);return value;
}
const days=(from:string,to:string)=>Math.max(0,Math.round((timestamp(to)-timestamp(from))/86400000));
export const emptyInjuryLoad=():InjuryLoad=>({training:0,pitching:0,batting:0,fielding:0});
// Exhibition clones may have scaled abilities. Transfer only newly committed losses.
export function copyInjuryOutcome(target:Pick<Player,'stats'|'injury'|'injuryHistory'|'injuryWorkload'|'injuryRetirement'>,source:Player){
  const known=new Set(target.injuryHistory?.map(row=>row.id));
  for(const row of source.injuryHistory??[])if(!known.has(row.id))for(const [key,n] of Object.entries(row.permanent)){const stat=key as keyof Stats;target.stats[stat]=Math.max(1,target.stats[stat]-n!);}
  target.injury=source.injury;target.injuryHistory=source.injuryHistory;target.injuryWorkload=source.injuryWorkload;target.injuryRetirement=source.injuryRetirement;
}
const total=(load:InjuryLoad)=>load.training+load.pitching+load.batting+load.fielding;
export function recoveryStage(episode:InjuryEpisode,date:string):RecoveryStage{
  return episode.retired?'retired':date<episode.treatmentUntil?'treatment':date<episode.unavailableUntil?'rehab':date<episode.adaptationUntil?'adaptation':'healthy';
}
export function injuryView(p:Player,date:string){
  const episode=p.injuryHistory?.find(row=>row.id===p.injury?.episodeId);
  const recovering=(p.injuryHistory??[]).filter(row=>row.state!=='superseded'&&row.date<=date);
  const stage:RecoveryStage=p.injuryRetirement?'retired':recovering.some(row=>date<row.treatmentUntil)?'treatment':p.injury&&date<p.injury.unavailableUntil?(episode?'rehab':'treatment'):recovering.some(row=>date<row.adaptationUntil)||p.injury&&!episode?'adaptation':'healthy';
  return {episode,stage,remaining:p.injury?days(date,p.injury.unavailableUntil):0};
}
export function advanceInjuryRecovery(p:Player,date:string){
  if(!p.injury)return;
  const active=p.injuryHistory?.find(row=>row.id===p.injury?.episodeId);
  if(!active){
    if(date>=p.injury.unavailableUntil){p.injury.penaltyRemaining=Math.max(0,p.injury.originalPenalty*(1-days(p.injury.unavailableUntil,date)/Math.max(1,p.injury.penaltyRecoverDays)));if(!p.injury.penaltyRemaining)p.injury=null;}
    return;
  }
  const effects:Partial<Stats>={};
  for(const row of p.injuryHistory??[]){
    if(!row.retired&&!row.returnedOn&&date>=p.injury.unavailableUntil){row.returnedOn=p.injury.unavailableUntil;row.missedDays=days(row.date,row.returnedOn);}
    if(row.state==='healthy'||row.state==='superseded')continue;
    row.state=recoveryStage(row,date);row.updatedAt=date;
    const factor=date<row.unavailableUntil?1:clamp(1-days(row.unavailableUntil,date)/Math.max(1,days(row.unavailableUntil,row.adaptationUntil)));
    for(const [key,value] of Object.entries(row.temporary)){const stat=key as keyof Stats;effects[stat]=(effects[stat]??0)+value!*factor;}
  }
  p.injury.effects=effects;p.injury.penaltyRemaining=Math.max(0,...Object.values(effects));
  if(date>=p.injury.unavailableUntil&&!p.injury.penaltyRemaining&&!p.injuryRetirement)p.injury=null;
}

export function validInjuryData(p:Player){
  const validDate=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  const modifiers=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.entries(v).every(([key,value])=>statKeys.includes(key as keyof Stats)&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100);
  if(p.injury&&(!validDate(p.injury.startDate)||!validDate(p.injury.unavailableUntil)||p.injury.unavailableUntil<p.injury.startDate||!Object.hasOwn(rules.grades,p.injury.severity)||![p.injury.originalPenalty,p.injury.penaltyRemaining,p.injury.penaltyRecoverDays].every(n=>Number.isFinite(n)&&n>=0)))return false;
  if(p.injuryHistory!==undefined){
    if(!Array.isArray(p.injuryHistory))return false;const ids=new Set<string>(),keys=new Set<string>();
    for(const row of p.injuryHistory){
      if(!row||typeof row.id!=='string'||typeof row.key!=='string'||ids.has(row.id)||keys.has(row.key)||!Object.hasOwn(injuryBodies,row.body)||!Object.hasOwn(rules.grades,row.severity)||!validDate(row.date)||!validDate(row.treatmentUntil)||!validDate(row.unavailableUntil)||!validDate(row.adaptationUntil)||!validDate(row.updatedAt)||!Number.isInteger(row.season)||!Number.isInteger(row.requiredDays)||row.requiredDays<3||row.severity!==injuryGrade(row.requiredDays)||days(row.date,row.unavailableUntil)!==row.requiredDays||row.treatmentUntil<row.date||row.treatmentUntil>row.unavailableUntil||row.adaptationUntil<row.unavailableUntil||!Number.isFinite(row.fatigue)||row.fatigue<0||row.fatigue>100||!row.load||['training','pitching','batting','fielding','recent'].some(key=>!Number.isFinite(row.load[key as keyof typeof row.load])||row.load[key as keyof typeof row.load]<0)||!['training','game','event','legacy'].includes(row.cause)||!['treatment','rehab','adaptation','healthy','superseded','retired'].includes(row.state)||!modifiers(row.temporary)||!modifiers(row.permanent)||row.permanentApplied!==true||typeof row.recurrence!=='boolean'||typeof row.retired!=='boolean'||row.cause!=='legacy'&&row.retired!==(row.requiredDays>365)||row.previousId!==undefined&&!ids.has(row.previousId)||row.returnedOn!==undefined&&(!validDate(row.returnedOn)||row.returnedOn<row.unavailableUntil||row.missedDays!==days(row.date,row.returnedOn)))return false;
      if(row.medicalReportRead!==undefined&&typeof row.medicalReportRead!=='boolean')return false;
      ids.add(row.id);keys.add(row.key);
    }
    if(p.injury?.episodeId&&!ids.has(p.injury.episodeId))return false;
    if(p.injuryRetirement&&(!ids.has(p.injuryRetirement.episodeId)||!validDate(p.injuryRetirement.date)||typeof p.injuryRetirement.reason!=='string'||typeof p.injuryRetirement.handled!=='boolean'||!p.injuryHistory.some(row=>row.id===p.injuryRetirement!.episodeId&&row.requiredDays>365)))return false;
  }else if(p.injury?.episodeId||p.injuryRetirement)return false;
  if(p.injuryWorkload!==undefined&&(!Array.isArray(p.injuryWorkload)||p.injuryWorkload.length>rules.recentDays||p.injuryWorkload.some(row=>!validDate(row.date)||!Number.isFinite(row.load)||row.load<0||!Array.isArray(row.keys)||row.keys.some(key=>typeof key!=='string')||new Set(row.keys).size!==row.keys.length)))return false;
  return !p.injury?.effects||modifiers(p.injury.effects);
}
export function injuryTrainingPolicy(p:Player,policy:Policy,date:string):Policy{
  const view=injuryView(p,date);
  if(p.injuryRetirement||view.stage==='treatment'||view.stage==='retired')return {mode:'rest',tickets:Object.fromEntries(ticketKeys.map(key=>[key,0])) as Policy['tickets']};
  if(view.stage!=='rehab'||!view.episode)return policy;
  const blocked=new Set((p.injuryHistory??[]).filter(row=>date<row.unavailableUntil).flatMap(row=>injuryBodies[row.body].restricted));
  return {...policy,tickets:Object.fromEntries(ticketKeys.map(key=>[key,blocked.has(key)?0:Math.min(rules.rehabMaxTickets,policy.tickets[key])])) as Policy['tickets']};
}
export function recentInjuryLoad(p:Player,date:string){
  let load=0;
  for(const row of p.injuryWorkload??[])if(row.date<=date&&days(row.date,date)<rules.recentDays)load+=row.load;
  return load;
}
export function injuryRiskEstimate(p:Player,exposure:InjuryExposure){
  const load=Math.min(rules.maxExposure,total(exposure)),fatigue=clamp(exposure.fatigue/100);
  const recent=recentInjuryLoad(p,exposure.date),repeat=(p.injuryHistory??[]).filter(row=>days(row.date,exposure.date)<=rules.historyDays).length;
  const stage=injuryView(p,exposure.date).stage;
  const baseline=exposure.cause==='training'?rules.trainingBaseRisk:rules.gameBaseRisk;
  const recentMultiplier=Math.min(rules.maxRecentMultiplier,1+Math.max(0,recent/(rules.recentDays*rules.recentDailyReference)-1)*rules.recentRiskWeight);
  const probability=clamp((baseline+rules.fatigueRisk*fatigue**rules.fatigueExponent)*load*recentMultiplier*(1+Math.min(rules.maxRepeatRisk,repeat*rules.repeatRisk))*(stage==='adaptation'?rules.adaptationRisk:1),0,rules.maxRisk);
  return {probability,recent,load,level:probability>=rules.veryHighRisk?'매우 높음':probability>=rules.highRisk?'높음':probability>=rules.cautionRisk?'주의':'낮음'};
}
export function injurySeverityWeights(fatigue:number){
  return Object.entries(rules.grades).map(([grade,rule],index)=>({grade:grade as InjuryGrade,weight:rule.weight*(1+index*rules.severityFatigue*clamp(fatigue/100)**rules.severityFatigueExponent)}));
}
export function drawInjuryDuration(fatigue:number,draw:()=>number){
  const weights=injurySeverityWeights(fatigue),sum=weights.reduce((n,row)=>n+row.weight,0);let roll=draw()*sum,grade:InjuryGrade='careerEnding';
  for(const row of weights){roll-=row.weight;if(roll<0){grade=row.grade;break;}}
  const band=rules.grades[grade];return band.min+Math.min(band.max-band.min,Math.floor(draw()**rules.durationPower*(band.max-band.min+1)));
}
function drawBody(exposure:InjuryExposure,p:Player,draw:()=>number):InjuryBody{
  const rows=Object.entries(injuryBodies).map(([body,rule])=>({body:body as InjuryBody,weight:rules.bodyBaseWeight+rule.pitching*exposure.pitching+rule.batting*exposure.batting+rule.fielding*exposure.fielding+rule.restricted.reduce((n,key)=>n+(exposure.trainingTickets?.[key]??0)*rules.trainingBodyWeight,0)+
    ((p.injuryHistory??[]).some(row=>row.body===body&&days(row.date,exposure.date)<rules.historyDays)?rules.bodyHistoryWeight:0)}));
  let roll=draw()*rows.reduce((n,row)=>n+row.weight,0);for(const row of rows){roll-=row.weight;if(roll<0)return row.body;}return 'hand';
}
export function beginInjury(s:GameState,p:Player,exposure:InjuryExposure,requiredDays:number,body?:InjuryBody){
  if(p.injuryRetirement||p.injuryHistory?.some(row=>row.key===exposure.key))return;
  if(!Number.isInteger(requiredDays)||requiredDays<3)throw new Error('부상 회복 기간은 3일 이상의 정수여야 합니다.');
  if(p.injury&&!p.injury.episodeId)migrateInjuryHistory(p,exposure.date);
  const draw=()=>random(s,'injury'),part=body??drawBody(exposure,p,draw),severity=injuryGrade(requiredDays),rule=rules.grades[severity];
  const history=p.injuryHistory??=[],previous=history.findLast(row=>row.body===part&&days(row.date,exposure.date)<=rules.historyDays);
  const retired=requiredDays>365,until=add(exposure.date,requiredDays),temporary=Object.fromEntries(injuryBodies[part].stats.map(stat=>[stat,rule.penalty]));
  const row:InjuryEpisode={id:`${p.id}:injury:${history.length}:${exposure.key}`,key:exposure.key,date:exposure.date,season:s.calendar.seasonYear,body:part,severity,cause:exposure.cause,fatigue:exposure.fatigue,
    load:{training:exposure.training,pitching:exposure.pitching,batting:exposure.batting,fielding:exposure.fielding,recent:exposure.recentLoad??recentInjuryLoad(p,exposure.date)},requiredDays,treatmentUntil:add(exposure.date,Math.max(1,Math.floor(requiredDays*rules.treatmentFraction))),
    unavailableUntil:until,adaptationUntil:add(until,rule.adaptation),recurrence:!!previous,...(previous?{previousId:previous.id}:{}),temporary,permanent:{},permanentApplied:false,state:retired?'retired':'treatment',retired,updatedAt:exposure.date};
  if(!retired&&draw()<Math.min(rules.maxPermanentChance,rule.permanentChance+(previous?rules.repeatPermanentChance:0))){
    for(const stat of injuryBodies[part].stats){const loss=Math.min(p.stats[stat]-1,rules.permanentMin+draw()*(rules.permanentMax-rules.permanentMin));p.stats[stat]-=loss;row.permanent[stat]=loss;}
  }
  row.permanentApplied=true;row.medicalReportRead=false;history.push(row);
  const unavailableUntil=[p.injury?.unavailableUntil??until,until].sort().at(-1)!;
  p.injury={severity,startDate:exposure.date,unavailableUntil,originalPenalty:rule.penalty,penaltyRemaining:rule.penalty,penaltyRecoverDays:rule.adaptation,episodeId:row.id,effects:temporary};
  if(retired)p.injuryRetirement={episodeId:row.id,date:exposure.date,reason:`${injuryBodies[part].name} ${rule.name}: 한 번의 부상에 필요한 회복 ${requiredDays}일이 365일을 초과했습니다.`,handled:false};
  advanceInjuryRecovery(p,exposure.date);
  return row;
}
export function assessInjuryExposure(s:GameState,p:Player,exposure:InjuryExposure){
  if(p.injuryRetirement||p.professional?.employment==='retired'||total(exposure)<=0)return;
  const work=p.injuryWorkload??=[];let day=work.find(row=>row.date===exposure.date);
  if(day?.keys.includes(exposure.key))return;
  const risk=injuryRiskEstimate(p,exposure);
  if(!day){day={date:exposure.date,load:0,keys:[]};work.push(day);}day.keys.push(exposure.key);day.load+=total(exposure);
  p.injuryWorkload=work.filter(row=>days(row.date,exposure.date)<rules.recentDays);
  if(random(s,'injury')>=risk.probability)return;
  return beginInjury(s,p,{...exposure,recentLoad:risk.recent},drawInjuryDuration(exposure.fatigue,()=>random(s,'injury')));
}
export function injuryRiskAssessment(p:Player,date:string){
  let burden=0;const reasons:string[]=[];
  for(const row of p.injuryHistory??[]){
    if(row.date>date)continue;
    const age=days(row.returnedOn??row.unavailableUntil,date),decay=2**(-age/rules.riskHalfLifeDays);
    burden+=(Math.min(rules.riskPerEpisodeMax,row.requiredDays/rules.riskDaysPerPoint)+(row.recurrence?rules.riskRecurrencePoints:0))*decay;
  }
  const view=injuryView(p,date);
  if(view.remaining>0){burden+=Math.min(rules.riskCurrentMax,view.remaining/rules.riskCurrentDaysPerPoint);reasons.push(`현재 결장 ${view.remaining}일 예상`);}
  if(view.stage==='adaptation'){burden+=rules.riskAdaptationPoints;reasons.push('복귀 적응 중');}
  if(p.injuryHistory?.length)reasons.push(`부상 ${p.injuryHistory.length}건 · 같은 부위 재발 ${p.injuryHistory.filter(row=>row.recurrence).length}건 · 오래된 이력은 감쇠`);
  const risk=clamp(burden,0,rules.riskMax),ratio=risk/rules.riskMax;
  return {risk,availability:100-risk,salaryMultiplier:1-rules.salaryDiscountMax*ratio,interestPenalty:rules.interestPenaltyMax*ratio,yearsLost:risk>=rules.contractRiskThreshold?rules.contractYearsLost:0,reasons};
}
export function injurySeasonAdjustment(p:Player,year:number,through=`${year}-12-31`):InjurySeasonAdjustment{
  const start=`${year}-01-01`,end=through<`${year}-12-31`?through:`${year}-12-31`,intervals:(readonly [string,string])[]=[];
  for(const row of p.injuryHistory??[]){const from=row.date>start?row.date:start,to=[row.returnedOn??row.unavailableUntil,add(end,1)].sort()[0];if(from<to)intervals.push([from,to]);}
  intervals.sort((a,b)=>a[0].localeCompare(b[0]));let count=0,last='';
  for(const [from,to] of intervals){count+=days(from>last?from:last,to);if(to>last)last=to;}
  const penalty=Math.min(rules.seasonPenaltyMax,count*rules.seasonPenaltyPerDay);
  return {days:count,penalty,reason:count?`${year}년 실제 경과 결장 ${count}일 · WAR와 별도 가용성 보정 (최대 ${rules.seasonPenaltyMax}점)`:'해당 시즌 부상 결장 없음'};
}
export function migrateInjuryHistory(p:Player,date:string){
  p.injuryHistory??=[];
  const old=p.injury;if(!old||old.episodeId)return;
  const requiredDays=Math.max(3,days(old.startDate,old.unavailableUntil)),severity=injuryGrade(requiredDays),body:InjuryBody=['SP','RP','CP'].includes(p.position)?'arm':'leg';
  const id=`${p.id}:legacy-injury:${old.startDate}`;
  const row:InjuryEpisode={id,key:id,date:old.startDate,season:Number(old.startDate.slice(0,4)),body,severity,cause:'legacy',fatigue:p.fatigue,load:{...emptyInjuryLoad(),recent:0},requiredDays,
    treatmentUntil:old.unavailableUntil,unavailableUntil:old.unavailableUntil,adaptationUntil:add(old.unavailableUntil,old.penaltyRecoverDays),recurrence:false,temporary:Object.fromEntries(injuryBodies[body].stats.map(stat=>[stat,old.originalPenalty])),permanent:{},permanentApplied:true,state:'treatment',retired:requiredDays>365,updatedAt:date};
  if(row.retired)p.injuryRetirement={episodeId:id,date,reason:`이전 부상의 필요 회복 기간 ${requiredDays}일이 365일을 초과했습니다.`,handled:false};
  p.injuryHistory.push(row);old.episodeId=id;advanceInjuryRecovery(p,date);
}
