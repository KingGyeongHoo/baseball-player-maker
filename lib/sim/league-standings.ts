import type {Calendar,Competition,Game,LeagueTiebreak} from "./types";

export type LeagueStanding={teamId:number;wins:number;losses:number;draws:number;difference:number;played:number;percentage:number;gamesBehind:number;rank:number;tiePending:boolean};
type RecordStanding=Pick<LeagueStanding,"teamId"|"wins"|"losses"|"draws">;
export function compareLeagueRecords(a:RecordStanding,b:RecordStanding){
  const ad=a.wins+a.losses,bd=b.wins+b.losses;
  return b.wins*(ad||1)-a.wins*(bd||1)||b.wins-a.wins;
}
export function leagueStandings(calendar:Calendar,id:string,group?:number):LeagueStanding[]{
  const competition=calendar.competitions.find(c=>c.id===id);
  const rows=new Map((competition?.participantTeamIds??[]).filter(t=>group===undefined||Math.floor(t/10)===group).map(teamId=>[teamId,{teamId,wins:0,losses:0,draws:0,difference:0,played:0,percentage:0,gamesBehind:0,rank:0,tiePending:false}]));
  for(const game of calendar.events){
    if(game.competitionId!==id||game.tiebreaker||!["completed","forfeit"].includes(game.status))continue;
    for(const teamId of [game.homeTeamId,game.awayTeamId]){const row=rows.get(teamId);if(!row)continue;
      const side=teamId===game.homeTeamId?0:1,diff=game.status==="forfeit"?game.forfeitTeamId===teamId?-1:1:game.score[side]-game.score[1-side];
      row.played++;row.difference+=diff;if(diff>0)row.wins++;else if(diff<0)row.losses++;else row.draws++;
    }
  }
  const resolved=(a:number,b:number)=>{const tie=competition?.tiebreaks?.find(t=>t.done&&t.teams.includes(a)&&t.teams.includes(b));return tie?tie.ordered.indexOf(a)-tie.ordered.indexOf(b):0;};
  const table=[...rows.values()].sort((a,b)=>compareLeagueRecords(a,b)||resolved(a.teamId,b.teamId)||a.teamId-b.teamId),leader=table[0];
  table.forEach((row,i)=>{
    row.percentage=row.wins+row.losses?row.wins/(row.wins+row.losses):0;
    row.gamesBehind=i?((leader.wins-row.wins)+(row.losses-leader.losses))/2:0;
    row.tiePending=table.some(other=>other!==row&&compareLeagueRecords(row,other)===0&&resolved(row.teamId,other.teamId)===0);
    row.rank=i&&compareLeagueRecords(table[i-1],row)===0&&!resolved(table[i-1].teamId,row.teamId)?table[i-1].rank:i+1;
  });return table;
}
const add=(date:string,n:number)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
function schedule(calendar:Calendar,competition:Competition,tie:LeagueTiebreak,date:string){
  if(competition.id.startsWith("pro-")&&new Date(date+"T00:00:00Z").getUTCDay()===1)date=add(date,1);
  const opponent=tie.ordered[(tie.low+tie.high)>>1],challenger=tie.teams[tie.next],number=tie.gameCount++;
  while(calendar.events.some(g=>g.date===date&&[g.homeTeamId,g.awayTeamId].some(id=>id===opponent||id===challenger))){date=add(date,1);if(competition.id.startsWith("pro-")&&new Date(date+"T00:00:00Z").getUTCDay()===1)date=add(date,1);}
  const game:Game={id:`${calendar.seasonYear}:${competition.id}:tiebreak:${tie.key}:${number}`,date,homeTeamId:opponent,awayTeamId:challenger,competitionId:competition.id,tiebreaker:true,round:number+1,rulesetId:"league-tiebreak-v1",status:"scheduled",score:[0,0],innings:[[],[]],lineup:[],boxScore:{}};
  tie.gameId=game.id;calendar.events.push(game);calendar.events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  if(date>competition.endDate)competition.endDate=date;if(date>calendar.seasonEnd)calendar.seasonEnd=date;
}
// Resolve equal winning percentages and wins through actual games, never run
// differential or team ID. Multi-team ties use match-based binary insertion.
export function advanceLeagueTiebreakers(calendar:Calendar,id:string,date:string){
  const competition=calendar.competitions.find(c=>c.id===id);if(!competition||competition.kind!=="league"||id.startsWith("pro-playoffs-"))return false;
  const regular=calendar.events.filter(g=>g.competitionId===id&&!g.tiebreaker);
  if(!regular.length)return false;
  if(competition.participantTeamIds.some(id=>!regular.some(g=>g.homeTeamId===id||g.awayTeamId===id)))return false;
  if(!competition.tiebreaks){
    if(date<competition.endDate||regular.some(g=>!["completed","forfeit"].includes(g.status)))return false;
    competition.tiebreaks=[];
    for(const group of new Set(competition.participantTeamIds.map(id=>Math.floor(id/10)))){
      const table=leagueStandings(calendar,id,group);
      for(let i=0;i<table.length;){let end=i+1;while(end<table.length&&compareLeagueRecords(table[i],table[end])===0)end++;
        if(end-i>1){const teams=table.slice(i,end).map(row=>row.teamId),tie:LeagueTiebreak={key:`${group}-${i}`,group,teams,ordered:[teams[0]],next:1,low:0,high:0,gameCount:0,done:false};competition.tiebreaks.push(tie);schedule(calendar,competition,tie,add(date,1));}i=end;
      }
    }
  }
  for(const tie of competition.tiebreaks){if(tie.done||!tie.gameId)continue;
    const game=calendar.events.find(g=>g.id===tie.gameId);if(!game||game.date>date||!["completed","forfeit"].includes(game.status))continue;
    const winner=game.status==="forfeit"?game.forfeitTeamId===game.homeTeamId?game.awayTeamId:game.homeTeamId:game.score[0]===game.score[1]?undefined:game.score[0]>game.score[1]?game.homeTeamId:game.awayTeamId;
    if(winner===undefined){schedule(calendar,competition,tie,add(date,1));continue;}
    const mid=(tie.low+tie.high)>>1;if(winner===tie.teams[tie.next])tie.high=mid-1;else tie.low=mid+1;
    if(tie.low>tie.high){tie.ordered.splice(tie.low,0,tie.teams[tie.next++]);if(tie.next===tie.teams.length){tie.done=true;continue;}tie.low=0;tie.high=tie.ordered.length-1;}
    schedule(calendar,competition,tie,add(date,1));
  }
  return competition.tiebreaks.some(t=>!t.done);
}
