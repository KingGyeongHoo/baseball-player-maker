import {addDays,getPlayer} from './engine';
import {careerLeagueTable} from './pro-calendar';
import {nextFarmDate} from './pro-farm-schedule';
import {farmGameRoster,proGameTeam} from './pro-farm-roster';
import {proNews,proNotice} from './pro-world';
import type {GameState,Game} from './types';
import type {ProSeries} from './pro-types';
export const isFarmPostseason=(id:string)=>id.startsWith('pro-farm-playoffs-');
function schedule(s:GameState,series:ProSeries,date:string){
  date=nextFarmDate(date,s.calendar.seasonYear);const number=series.game++,pattern=series.stage==='final'?[0,0,1,1,0]:[0,1,0],home=series.clubs[pattern[number]],away=series.clubs[1-series.clubs.indexOf(home)];
  const game:Game={id:`${s.calendar.seasonYear}:farm:${series.id}:${number}`,date,competitionId:`pro-farm-playoffs-${series.id}`,homeTeamId:home,awayTeamId:away,round:number+1,rulesetId:'pro-farm-postseason-v1',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{}};
  s.calendar.events.push(game);s.calendar.events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));series.lastDate=date;
  const name=series.stage==='final'?'2군 챔피언결정전':'2군 준결승';let c=s.calendar.competitions.find(c=>c.id===game.competitionId);
  if(!c){c={id:game.competitionId,name,kind:'league',startDate:date,endDate:date,entryRule:'2군·3군·신고선수 엔트리 · 2군→3군→신고 우선 · 동률은 정규 순위 우선',participantTeamIds:[...series.clubs],initialized:true,round:0,roundDates:[],byes:[],championTeamId:null};s.calendar.competitions.push(c);}c.endDate=date;
  if(date>s.calendar.seasonEnd)s.calendar.seasonEnd=date;
}
function series(s:GameState,id:string,stage:'semi'|'final',clubs:[number,number],date:string){
  const row:ProSeries={id,stage,clubs,wins:[0,0],target:stage==='final'?3:2,game:0,lastDate:date,rosters:Object.fromEntries(clubs.map(club=>[club,farmGameRoster(s,club).map(p=>p.id)])),excluded:[]};
  s.proWorld!.farmPostseason!.series.push(row);schedule(s,row,date);
}
export function reviewFarmPostseason(s:GameState){
  const w=s.proWorld,c=s.calendar.competitions.find(c=>c.id==='pro-second');if(!w||!c||w.seasonClosed||!['camp','regular'].includes(w.stage))return;
  if(!w.farmPostseason){
    const games=s.calendar.events.filter(g=>g.competitionId==='pro-second');
    if(!games.length||s.date<c.endDate||games.some(g=>!['completed','forfeit'].includes(g.status)))return;
    const seeds=careerLeagueTable(s.calendar,'pro-second').slice(0,4).map(row=>row.teamId);if(seeds.length<4)return;
    c.championTeamId=seeds[0];w.farmPostseason={seeds,series:[]};
    series(s,'semi-a','semi',[seeds[0],seeds[3]],addDays(s.date,1));series(s,'semi-b','semi',[seeds[1],seeds[2]],addDays(s.date,1));
    proNews(s,'2군 정규시즌 종료 · 상위 4팀 포스트시즌 시작 · 준결승 3전 2선승 / 결승 5전 3선승');
  }
  const post=w.farmPostseason;
  for(const row of post.series){
    if(row.winner!==undefined||row.lastDate>s.date||row.processedGame===row.game-1)continue;
    const g=s.calendar.events.find(g=>g.id===`${w.year}:farm:${row.id}:${row.game-1}`);if(!g||!['completed','forfeit'].includes(g.status))continue;row.processedGame=row.game-1;
    const winner=g.status==='forfeit'?(g.forfeitTeamId===g.homeTeamId?g.awayTeamId:g.homeTeamId):g.score[0]===g.score[1]?undefined:g.score[0]>g.score[1]?g.homeTeamId:g.awayTeamId;
    if(winner!==undefined)row.wins[row.clubs.indexOf(winner)]++;
    if(row.wins.some(n=>n>=row.target)||row.game>=(row.stage==='final'?5:3))row.winner=row.clubs[row.wins[0]>=row.wins[1]?0:1];
    if(row.winner!==undefined)s.calendar.competitions.find(c=>c.id===g.competitionId)!.championTeamId=row.winner;
    else schedule(s,row,addDays(s.date,1));
  }
  const semis=post.series.filter(r=>r.stage==='semi');
  if(semis.length===2&&semis.every(r=>r.winner!==undefined)&&!post.series.some(r=>r.stage==='final')){
    const clubs=semis.map(r=>r.winner!).sort((a,b)=>post.seeds.indexOf(a)-post.seeds.indexOf(b)) as [number,number];series(s,'final','final',clubs,addDays(s.date,1));
  }
  const final=post.series.find(r=>r.stage==='final');if(final?.winner!==undefined&&post.champion===undefined){
    post.champion=final.winner;proNews(s,`${s.teams[final.winner]?.name??'2군'} · 2군 포스트시즌 우승`);
    if(post.seeds.includes(proGameTeam(getPlayer(s))))proNotice(s,`farm-finish:${w.year}`,'2군 포스트시즌 종료',`${s.teams[final.winner]?.name??'2군'}이 우승했습니다. 2군 포스트시즌 기록은 정규시즌과 별도로 보관합니다.`);
  }
}
export function farmPlayoffRoster(s:GameState,game:Game){
  const row=s.proWorld?.farmPostseason?.series.find(r=>game.competitionId===`pro-farm-playoffs-${r.id}`);
  return [game.homeTeamId,game.awayTeamId].map(team=>farmGameRoster(s,team).filter(p=>!row||row.rosters[String(team)]?.includes(p.id)));
}
