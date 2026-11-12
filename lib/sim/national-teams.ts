import {available,getPlayer,isPitcher,ovr,proSelectionScore,roleFor,roleScore,selectionScore} from './engine';
import {createProEvent} from './pro-event-catalog';
import {ensureProEvents,proDayFree,proEventsEnabled,recordProChoice} from './pro-event-ledger';
import type {CareerEvent,GameState,Player,Position,RecordLine} from './types';
import type {NationalRosterMember} from './pro-event-types';

export type NationalKind='premier12'|'apbc'|'olympics'|'wbc'|'youth';
export const nationalRules={
  premier12:{name:'프리미어12 국가대표',first:2027,month:'11',bonus:8,weeks:6,advanced:8},
  apbc:{name:'APBC 국가대표',first:2029,month:'11',bonus:3,weeks:1,advanced:3},
  olympics:{name:'올림픽 대표',first:2028,month:'07',bonus:6,weeks:3,advanced:6},
  wbc:{name:'WBC 국가대표',first:2030,month:'03',bonus:10,weeks:8,advanced:12},
  youth:{name:'청소년대표',first:2027,month:'09',bonus:0,weeks:4,advanced:8},
} as const;
export type NationalSelection={kind:NationalKind;year:number;date:string;start:string;end:string;roster:(NationalRosterMember&{name:string;team:string;field:'pitching'|'batting'})[];offered?:boolean;settled?:boolean;participated?:boolean;result?:string;simulationVersion?:1;tournament?:import('./national-tournament').NationalTournament};
export const nationalInYear=(kind:NationalKind,year:number)=>year>=nationalRules[kind].first&&(kind==='youth'||(year-nationalRules[kind].first)%4===0);
export const nationalWindow=(kind:NationalKind,year:number)=>({start:`${year}-${nationalRules[kind].month}-01`,end:`${year}-${nationalRules[kind].month}-${kind==='wbc'?'20':kind==='olympics'?'31':'30'}`});
export function nationalRole(p:Player){
  const pitching=p.twoWay?ovr(p,true)>ovr(p,false):isPitcher(p.primaryRole);
  const position=p.twoWay?(pitching?p.twoWay.pitchingPosition:p.twoWay.battingPosition):p.position;
  return {pitching,position,role:roleFor(position)};
}
export function nationalRoster(s:GameState,records:(p:Player)=>RecordLine|undefined,kind:NationalKind='premier12'):NationalRosterMember[]{
  const youth=kind==='youth',eligible=s.players.filter(p=>available(p,s.date)&&p.fatigue<80&&(youth?!p.careerMode:p.careerMode==='pro'&&p.professional?.employment==='active'&&p.teamId>=0&&p.proContract?.status!=='developmental')&&(!['apbc','olympics'].includes(kind)||(p.age??19)<=25));
  const ranked=eligible.map(p=>{const n=nationalRole(p),r=records(p);return {p,...n,score:youth?p.reputation??selectionScore(p,n.role):proSelectionScore(p,n.role,{first:r},false),ability:ovr(p,n.pitching),qualified:youth||(n.pitching?(r?.pitching.outs??0)>=90:(r?.batting.PA??0)>=100)};}).filter(row=>row.qualified).sort((a,b)=>b.score-a.score||b.ability-a.ability||a.p.id.localeCompare(b.p.id));
  const selected:typeof ranked=[],used=new Set<string>();
  const take=(positions:Position[],n:number)=>{for(const row of ranked.filter(row=>positions.includes(row.position)&&!used.has(row.p.id)).slice(0,n)){selected.push(row);used.add(row.p.id);}};
  if(youth){for(const pitching of [true,false])for(const row of ranked.filter(row=>row.pitching===pitching).slice(0,15)){selected.push(row);used.add(row.p.id);}}
  else{
    take(['SP'],5);take(['RP'],8);take(['CP'],2);take(['C'],2);
    // A playable national roster needs each defensive position, not seven
    // highly rated first basemen or five centre fielders.
    for(const position of ['1B','2B','3B','SS'] as Position[])take([position],1);
    take(['1B','2B','3B','SS'],3);
    for(const position of ['LF','CF','RF'] as Position[])take([position],1);
    take(['LF','CF','RF'],2);take(['DH'],1);
    // A small candidate pool can lack a positional quota. Preserve 15 per field
    // without duplicating a two-way player or manufacturing candidates.
    for(const pitching of [true,false])for(const row of ranked.filter(row=>row.pitching===pitching&&!used.has(row.p.id))){if(selected.filter(row=>row.pitching===pitching).length>=15)break;selected.push(row);used.add(row.p.id);}
  }
  return selected.map(row=>({id:row.p.id,position:row.position,selectionScore:row.score,roleScore:roleScore(row.p,row.role)}));
}
export function rememberNational(s:GameState,kind:NationalKind,roster:NationalRosterMember[],year=s.calendar.seasonYear){
  const rows=s.nationalTeams??=[],old=rows.find(row=>row.kind===kind&&row.year===year);if(old)return old;
  const entry:NationalSelection={kind,year,simulationVersion:1,date:s.date,...nationalWindow(kind,year),roster:roster.map(row=>{const p=s.players.find(p=>p.id===row.id)!;return {...row,name:p.name,team:s.teams[p.teamId]?.name??'무소속',field:isPitcher(roleFor(row.position))?'pitching':'batting'};})};rows.push(entry);
  if(kind!=='youth')for(const row of roster){const p=s.players.find(p=>p.id===row.id);if(p?.professional)p.professional.nationalBonus=Math.max(p.professional.nationalBonus??0,nationalRules[kind].bonus);}
  return entry;
}
// Every called-up player is unavailable to their club until the national team returns.
export function nationalAway(s:GameState,p:Player,date=s.date){return s.nationalTeams?.some(row=>date>=row.start&&date<=(row.tournament?.returned??row.tournament?.finished??row.end)&&(row.tournament?row.tournament.countries[0].players.some(member=>member.id===p.id):row.roster.some(member=>member.id===p.id))&&(p.id!==s.playerId||row.participated!==false))??false;}
export function nationalInvitation(s:GameState,entry:NationalSelection):CareerEvent{
  const p=getPlayer(s),member=entry.roster.find(row=>row.id===p.id)!,rule=nationalRules[entry.kind];
  const event=createProEvent(s,'PE27',{version:1,catalogId:'PE27',channel:'major',year:entry.year,playerId:p.id,teamId:p.teamId,level:p.teamId<10?'first':p.teamId<20?'second':p.teamId<30?'third':'developmental',field:member.field,openedAt:s.date,nationalYear:entry.year,nationalKind:entry.kind});
  event.title=`${entry.year} ${rule.name} 발탁`;event.description=`출전 평가와 기량을 인정받아 ${rule.name} 명단에 선발됐다. ${entry.kind==='olympics'?'시즌 중 차출을 거부하고 소속팀에 남을 수도 있다.':'국제무대에서 경험을 쌓을 기회다.'}`;
  event.choices[0].label=`${rule.name}로 참가한다`;event.choices[1].label=entry.kind==='olympics'?'올림픽 차출을 거부하고 소속팀에 남는다':`${rule.name} 참가를 사양하고 소속팀에 남는다`;
  for(const branch of event.choices[0].outcomes)if(branch.weeks)for(const key of Object.keys(branch.weeks) as (keyof NonNullable<typeof branch.weeks>)[])branch.weeks[key]=branch.weeks[key]!>=6?rule.advanced:rule.weeks;
  event.choices[0].outcomes=[{weight:100,message:`${rule.name}에 합류한다. 경기 결과에 따라 대회 경험과 수상이 결정된다.`}];
  return event;
}
export function tryScheduledNational(s:GameState){
  if(!proEventsEnabled(s)||s.careerNotice||s.careerEvent)return false;
  for(const kind of ['olympics','premier12','apbc'] as const){
    const year=s.calendar.seasonYear,{start,end}=nationalWindow(kind,year);if(!nationalInYear(kind,year)||s.date<start||s.date>end)continue;
    let entry=s.nationalTeams?.find(row=>row.kind===kind&&row.year===year);
    if(!entry)entry=rememberNational(s,kind,nationalRoster(s,p=>p.seasonByLevel?.first,kind));
    if(kind!=='olympics'){
      const ledger=ensureProEvents(s);ledger.national[String(year)]??={evaluatedAt:entry.date,invitationDate:s.date,roster:entry.roster,offered:false,settled:false};
    }
    if(entry.offered||entry.settled)continue;
    if(!entry.roster.some(row=>row.id===s.playerId)){entry.settled=true;continue;}
    if(!proDayFree(s))continue;
    entry.offered=true;s.careerEvent=nationalInvitation(s,entry);if(kind!=='olympics')ensureProEvents(s).national[String(year)].offered=true;recordProChoice(s,s.careerEvent);return true;
  }
  return false;
}
