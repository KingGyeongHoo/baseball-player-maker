import type {Calendar,GameState} from "./types";
const add=(date:string,n:number)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
export function allstarDates(year:number){
  const first=`${year}-07-01`,day=new Date(first+"T00:00:00Z").getUTCDay();
  const second=add(first,(5-day+7)%7+7),firstTeam=add(second,1);
  return {second,first:firstTeam,restStart:add(second,2),restEnd:add(second,6),resume:add(second,7)};
}
export function allstarBreak(date:string,year:number){const dates=allstarDates(year);return date>=dates.second&&date<=dates.restEnd;}
export function nextSeriesDate(date:string){while(![2,5].includes(new Date(date+"T00:00:00Z").getUTCDay()))date=add(date,1);return date;}
export function allstarSeriesDate(date:string,year:number){date=nextSeriesDate(date);const dates=allstarDates(year);return date<=dates.restEnd&&add(date,2)>=dates.second?dates.resume:date;}
export function refreshProCalendarBounds(calendar:Calendar){
  for(const competition of calendar.competitions.filter(c=>c.id==="pro-first"||c.id==="pro-second")){
    const dates=calendar.events.filter(g=>g.competitionId===competition.id).map(g=>g.date).sort();if(dates.length){competition.startDate=dates[0];competition.endDate=dates.at(-1)!;}
  }
  const end=calendar.events.map(g=>g.date).sort().at(-1);if(end){calendar.seasonEnd=end;calendar.draftDate=end;}
}
export function needsAllstarScheduleUpgrade(s:GameState){return s.careerMode==="pro"&&!!s.proWorld&&["camp","regular"].includes(s.proWorld.stage)&&s.calendar.proAllstarScheduleVersion!==1&&!s.weekProgress&&!s.matchProgress;}
export function upgradeAllstarSchedule(s:GameState){
  if(!needsAllstarScheduleUpgrade(s))return false;
  const year=s.calendar.seasonYear;
  for(const id of ["pro-first","pro-second"]){
    const pending=s.calendar.events.filter(g=>g.competitionId===id&&!g.tiebreaker&&g.status==="scheduled"&&g.date>=s.date);
    const rounds=new Map<number,typeof pending>();
    for(const game of pending){const round=game.round??0,list=rounds.get(round)??[];list.push(game);rounds.set(round,list);}
    let date=allstarSeriesDate([s.date,pending.map(g=>g.date).sort()[0]??s.date].sort().at(-1)!,year);
    for(const [,games] of [...rounds].sort((a,b)=>a[0]-b[0])){
      date=allstarSeriesDate(date,year);const start=games.map(g=>g.date).sort()[0];
      for(const game of games)game.date=add(date,Math.min(2,Math.max(0,Math.round((Date.parse(game.date)-Date.parse(start))/86400000))));
      date=id==="pro-second"?add(date,7):nextSeriesDate(add(date,3));
    }
  }
  s.calendar.events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  refreshProCalendarBounds(s.calendar);
  const dates=allstarDates(year);s.calendar.trainingDays=s.calendar.trainingDays.filter(day=>day<dates.restStart||day>dates.restEnd);
  for(let date=add(s.calendar.trainingDays.at(-1)??`${year}-03-01`,1);date<=s.calendar.seasonEnd;date=add(date,1))if(new Date(date+"T00:00:00Z").getUTCDay()!==1&&(date<dates.restStart||date>dates.restEnd))s.calendar.trainingDays.push(date);
  s.calendar.proAllstarScheduleVersion=1;
  s.proWorld!.regularEnd=s.calendar.competitions.filter(c=>c.id==="pro-first"||c.id==="pro-second").map(c=>c.endDate).sort().at(-1)??s.proWorld!.regularEnd;
  return true;
}
