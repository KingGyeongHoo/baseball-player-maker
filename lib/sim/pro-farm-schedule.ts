import type {Game,GameState} from './types';
import {threeGameSchedule} from './pro-schedule';
import {allstarBreak,nextSeriesDate,refreshProCalendarBounds} from './pro-allstar-calendar';
export const farmSeasonGames=117;
const add=(date:string,n:number)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
export function nextFarmDate(date:string,year=Number(date.slice(0,4))){while(new Date(date+'T00:00:00Z').getUTCDay()===4||allstarBreak(date,year))date=add(date,1);return date;}
export function farmSchedule(year:number,ids:number[],start='03-22'):Game[]{
  const games=threeGameSchedule(year,ids,12,start,'farm-base'),ring=[...ids];let date=nextSeriesDate(`${year}-${start}`);
  for(let block=0;block<36;block++){
    const dates=Array.from({length:3},()=>{date=nextFarmDate(date,year);const current=date;date=add(date,1);return current;});
    for(let pair=0;pair<5;pair++)for(let day=0;day<3;day++){
      const g=games[block*15+pair*3+day];g.date=dates[day];g.id=`${year}-pro-second-117-${block}-${pair}-${day}`;g.competitionId='pro-second';g.rulesetId='pro-farm-117-v1';
    }
  }
  for(let round=0;round<9;round++){
    date=nextFarmDate(date,year);
    for(let pair=0;pair<5;pair++){
      const a=ring[pair],b=ring[9-pair],i=ids.indexOf(a),j=ids.indexOf(b),distance=(j-i+10)%10;
      const home=distance<5||distance===5&&i<j?a:b,away=home===a?b:a;
      games.push({id:`${year}-pro-second-117-single-${round}-${pair}`,date,homeTeamId:home,awayTeamId:away,competitionId:'pro-second',round:37+round,rulesetId:'pro-farm-117-v1',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{}});
    }
    ring.splice(1,0,ring.pop()!);date=add(date,1);
  }
  return games;
}
// Preserve played games and their records. Only the unplayed farm schedule is rebuilt.
export function upgradeFarmSchedule(s:GameState){
  if(s.calendar.proFarmScheduleVersion===1)return false;
  const competition=s.calendar.competitions.find(c=>c.id==='pro-second');if(!competition)return false;
  const ids=competition.participantTeamIds,canonical=farmSchedule(s.calendar.seasonYear,ids),kept=s.calendar.events.filter(g=>g.competitionId==='pro-second'&&g.status!=='scheduled'&&!g.tiebreaker);
  const pairs=new Map<string,{a:number;b:number;n:number;homes:number}>();
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const a=ids[i],b=ids[j],done=kept.filter(g=>[g.homeTeamId,g.awayTeamId].includes(a)&&[g.homeTeamId,g.awayTeamId].includes(b));
    pairs.set(`${a}:${b}`,{a,b,n:Math.max(0,13-done.length),homes:Math.max(0,canonical.filter(g=>g.homeTeamId===a&&g.awayTeamId===b).length-done.filter(g=>g.homeTeamId===a).length)});
  }
  const retained=s.calendar.events.filter(g=>g.competitionId!=='pro-second'||g.status!=='scheduled'||g.tiebreaker),used=new Set(retained.map(g=>g.id));
  let date=[s.date,canonical[0].date].sort().at(-1)!,index=0;
  while([...pairs.values()].some(p=>p.n>0)){
    date=nextFarmDate(date,s.calendar.seasonYear);
    const available=new Set(ids.filter(id=>!kept.some(g=>g.date===date&&[g.homeTeamId,g.awayTeamId].includes(id))));
    while(available.size>=2){
      const degree=(id:number)=>[...pairs.values()].reduce((n,p)=>n+(p.a===id||p.b===id?p.n:0),0);
      const a=[...available].sort((a,b)=>degree(b)-degree(a)||a-b)[0];
      const pair=[...pairs.values()].filter(p=>p.n>0&&(p.a===a?available.has(p.b):p.b===a&&available.has(p.a))).sort((a,b)=>degree(b.a)+degree(b.b)-degree(a.a)-degree(a.b)||b.n-a.n||a.a-b.a||a.b-b.b)[0];
      if(!pair){available.delete(a);continue;}
      const home=pair.homes>0?pair.a:pair.b,away=home===pair.a?pair.b:pair.a;let id:string;do{id=`${s.calendar.seasonYear}-pro-second-117-upgrade-${s.date}-${index++}`;}while(used.has(id));used.add(id);
      retained.push({id,date,homeTeamId:home,awayTeamId:away,competitionId:'pro-second',round:index,rulesetId:'pro-farm-117-v1',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{}});
      pair.n--;if(home===pair.a)pair.homes--;available.delete(pair.a);available.delete(pair.b);
    }
    date=add(date,1);
  }
  s.calendar.events=retained.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));s.calendar.proFarmScheduleVersion=1;refreshProCalendarBounds(s.calendar);return true;
}
