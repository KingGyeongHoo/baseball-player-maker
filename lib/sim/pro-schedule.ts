import type {Game,GameState} from "./types";
const add=(date:string,n:number)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
const weekday=(date:string)=>new Date(date+"T00:00:00Z").getUTCDay();
function seriesDate(date:string){while(![2,5].includes(weekday(date)))date=add(date,1);return date;}
export function threeGameSchedule(year:number,ids:number[],cycles:number,start:string,id:string){
  const games:Game[]=[],ring=[...ids],blocks=cycles*(ids.length-1)/3;let date=seriesDate(`${year}-${start}`);
  for(let block=0;block<blocks;block++){
    const cycle=Math.floor(block/(ids.length-1)),round=block%(ids.length-1);
    for(let pair=0;pair<ids.length/2;pair++){const clubs=[ring[pair],ring[ids.length-1-pair]];if((cycle+round)%2)clubs.reverse();
      for(let day=0;day<3;day++)games.push({id:`${year}-${id}-series-${block}-${pair}-${day}`,date:add(date,day),homeTeamId:clubs[0],awayTeamId:clubs[1],competitionId:id,round:block+1,rulesetId:"pro-three-game-series-v1",status:"scheduled",score:[0,0],innings:[[],[]],lineup:[],boxScore:{}});
    }
    ring.splice(1,0,ring.pop()!);date=seriesDate(add(date,3));
  }
  // Orient the even-degree series graph so every club has exactly half its
  // three-game blocks at home, while retaining the Tuesday/Friday pairings.
  const edges=games.filter((_,i)=>i%3===0),adj=new Map(ids.map(id=>[id,[] as number[]]));
  edges.forEach((g,i)=>{adj.get(g.homeTeamId)!.push(i);adj.get(g.awayTeamId)!.push(i);});
  const used=new Set<number>();for(const start of ids){const stack=[start];while(stack.length){const home=stack.at(-1)!,list=adj.get(home)!;while(list.length&&used.has(list.at(-1)!))list.pop();if(!list.length){stack.pop();continue;}const edge=list.pop()!,g=edges[edge],away=g.homeTeamId===home?g.awayTeamId:g.homeTeamId;used.add(edge);for(let day=0;day<3;day++){games[edge*3+day].homeTeamId=home;games[edge*3+day].awayTeamId=away;}stack.push(away);}}
  return games;
}
export function needsProScheduleUpgrade(s:GameState){return s.careerMode==="pro"&&!!s.proWorld&&["camp","regular"].includes(s.proWorld.stage)&&s.calendar.proSeriesVersion!==1&&!s.weekProgress&&!s.matchProgress;}
export function upgradeProSchedule(s:GameState){
  if(!needsProScheduleUpgrade(s))return false;
  const removed=new Set<string>();
  for(const competition of s.calendar.competitions.filter(c=>["pro-first","pro-second"].includes(c.id))){
    const pending=s.calendar.events.filter(g=>g.competitionId===competition.id&&!g.tiebreaker&&g.status==="scheduled"),remaining=new Map(competition.participantTeamIds.map(id=>[id,0]));
    for(const game of pending){removed.add(game.id);remaining.set(game.homeTeamId,(remaining.get(game.homeTeamId)??0)+1);remaining.set(game.awayTeamId,(remaining.get(game.awayTeamId)??0)+1);}
    let date=seriesDate(pending.length?[s.date,pending[0].date].sort().at(-1)!:s.date),block=0;
    const last=new Map<number,number>(),homeCounts=new Map(competition.participantTeamIds.map(id=>[id,s.calendar.events.filter(g=>g.competitionId===competition.id&&g.status!=="scheduled"&&g.homeTeamId===id).length]));
    while([...remaining.values()].some(n=>n>0)){
      if(block>200)throw new Error("남은 3연전 일정을 편성할 수 없습니다.");
      const available=new Set([...remaining].filter(([,n])=>n>0).map(([id])=>id));let made=false;
      while(available.size>=2){
        const a=[...available].sort((x,y)=>remaining.get(y)!-remaining.get(x)!||x-y)[0];
        const candidates=[...available].filter(id=>id!==a).sort((x,y)=>Number(last.get(a)===x)-Number(last.get(a)===y)||remaining.get(y)!-remaining.get(x)!||x-y);
        let pair:{b:number;count:number}|undefined;
        for(const b of candidates){for(let count=Math.min(3,remaining.get(a)!,remaining.get(b)!);count>0;count--){const rest=[...remaining].map(([id,n])=>n-(id===a||id===b?count:0)),sum=rest.reduce((x,y)=>x+y,0);if(Math.max(...rest)<=sum/2){pair={b,count};break;}}if(pair)break;}
        if(!pair){available.delete(a);continue;}
        const {b,count}=pair,home=(homeCounts.get(a)??0)<=(homeCounts.get(b)??0)?a:b,away=home===a?b:a;
        for(let day=0;day<count;day++)s.calendar.events.push({id:`${s.calendar.seasonYear}-${competition.id}-series-upgrade-${block}-${a}-${b}-${day}`,date:add(date,day),homeTeamId:home,awayTeamId:away,competitionId:competition.id,round:block+1,rulesetId:"pro-three-game-series-v1",status:"scheduled",score:[0,0],innings:[[],[]],lineup:[],boxScore:{}});
        remaining.set(a,remaining.get(a)!-count);remaining.set(b,remaining.get(b)!-count);homeCounts.set(home,(homeCounts.get(home)??0)+count);last.set(a,b);last.set(b,a);available.delete(a);available.delete(b);made=true;
      }
      if(!made)throw new Error("남은 경기 수가 3연전 편성 조건과 맞지 않습니다.");block++;date=seriesDate(add(date,3));
    }
  }
  s.calendar.events=s.calendar.events.filter(g=>!removed.has(g.id)).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  for(const c of s.calendar.competitions.filter(c=>["pro-first","pro-second"].includes(c.id))){const dates=s.calendar.events.filter(g=>g.competitionId===c.id).map(g=>g.date).sort();if(dates.length){c.startDate=dates[0];c.endDate=dates.at(-1)!;}}
  s.calendar.seasonEnd=s.calendar.events.at(-1)?.date??s.calendar.seasonEnd;s.proWorld!.regularEnd=s.calendar.competitions.find(c=>c.id==="pro-first")!.endDate;
  s.calendar.trainingDays=[];for(let date=`${s.calendar.seasonYear}-03-01`;date<=s.calendar.seasonEnd;date=add(date,1))if(weekday(date)!==1)s.calendar.trainingDays.push(date);
  s.calendar.proSeriesVersion=1;return true;
}
