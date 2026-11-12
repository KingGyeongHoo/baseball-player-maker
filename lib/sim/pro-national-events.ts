import {getPlayer} from './engine';
import {ensureProEvents,proDayFree,proEventsEnabled,recordProChoice} from './pro-event-ledger';
import {nationalInYear,nationalRoster,nationalInvitation,nationalWindow,rememberNational,tryScheduledNational} from './national-teams';
import type {GameState,Player,RecordLine} from './types';
export const selectProNationalRoster=(s:GameState,records:(p:Player)=>RecordLine|undefined)=>nationalRoster(s,records);
export function freezeProNational(s:GameState){
  if(!proEventsEnabled(s)||!s.proWorld?.seasonClosed)return;
  const year=s.calendar.seasonYear,kind=nationalInYear('premier12',year)?'premier12':nationalInYear('apbc',year)?'apbc':undefined;if(!kind)return;
  const ledger=ensureProEvents(s);if(ledger.national[String(year)])return;
  const entry=rememberNational(s,kind,nationalRoster(s,p=>p.seasonByLevel?.first,kind));
  ledger.national[String(year)]={evaluatedAt:s.date,invitationDate:[s.date,nationalWindow(kind,year).start].sort().at(-1)!,roster:entry.roster,offered:false,settled:false};
}
export function tryProNationalInvitation(s:GameState){
  if(!proEventsEnabled(s)||s.careerNotice||s.careerEvent)return false;
  const year=s.calendar.seasonYear,p=getPlayer(s),legacy=s.proEvents?.national[String(year)];
  const entry=s.nationalTeams?.find(row=>row.year===year&&['premier12','apbc'].includes(row.kind));
  if(entry&&legacy&&!legacy.offered&&!legacy.settled&&['summary','offseason'].includes(s.proWorld?.stage??'')){
    if(!entry.roster.some(row=>row.id===p.id)||p.professional?.employment!=='active'||p.teamId<0){entry.settled=legacy.settled=true;return false;}
    const date=[s.date,legacy.invitationDate].sort().at(-1)!;if(date>entry.end||!proDayFree(s,date))return false;
    s.date=date;entry.offered=legacy.offered=true;s.careerEvent=nationalInvitation(s,entry);recordProChoice(s,s.careerEvent);return true;
  }
  return tryScheduledNational(s);
}
