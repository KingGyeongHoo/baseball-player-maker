import {recordRates} from "./player-records";
import {careerLeagueTable} from "./sim/pro-calendar";
import type {GameState,Player,RecordLine} from "./sim/types";

export type LeaderField="batting"|"pitching";
export type LeaderMetric={id:string;label:string;value:(r:RecordLine)=>number|null;ascending?:boolean;format?:"rate"|"decimal"|"innings"|"percent";qualified?:boolean};
const batting:LeaderMetric[]=[
  {id:"avg",label:"타율",value:r=>recordRates(r).average,format:"rate",qualified:true},
  {id:"obp",label:"출루율",value:r=>recordRates(r).obp,format:"rate",qualified:true},
  {id:"slg",label:"장타율",value:r=>recordRates(r).slugging,format:"rate",qualified:true},
  {id:"ops",label:"OPS",value:r=>recordRates(r).ops,format:"rate",qualified:true},
  ...([['HR','홈런'],['H','안타'],['RBI','타점'],['R','득점'],['2B','2루타'],['3B','3루타'],['BB','볼넷'],['PA','타석'],['AB','타수'],['SO','삼진'],['GB','땅볼'],['FB','뜬공']] as const).map(([id,label])=>({id,label,value:(r:RecordLine)=>r.batting[id],ascending:id==="SO"})),
];
const pitching:LeaderMetric[]=[
  {id:"era",label:"평균자책점",value:r=>recordRates(r).era,format:"decimal",ascending:true,qualified:true},
  {id:"whip",label:"WHIP",value:r=>recordRates(r).whip,format:"decimal",ascending:true,qualified:true},
  {id:"kRate",label:"탈삼진율",value:r=>r.pitching.BF?r.pitching.SO/r.pitching.BF:null,format:"percent",qualified:true},
  {id:"outs",label:"이닝",value:r=>r.pitching.outs,format:"innings"},
  ...([['SO','탈삼진'],['BF','상대한 타자'],['H','피안타'],['BB','볼넷 허용'],['HR','피홈런'],['R','실점'],['ER','자책점']] as const).map(([id,label])=>({id,label,value:(r:RecordLine)=>r.pitching[id],ascending:!['SO','BF'].includes(id)})),
];
export const leaderMetrics:Record<LeaderField,LeaderMetric[]>={batting,pitching};
export type LeaderRow={player:Player;value:number;sample:number};

export function leagueLeaders(state:GameState,competition:string,field:LeaderField){
  const pro=state.careerMode==="pro",level=competition==="pro-first"?"first":"second";
  const games=new Map(careerLeagueTable(state.calendar,competition).map(row=>[row.teamId,row.wins+row.losses+row.draws]));
  const participants=new Set(state.calendar.competitions.find(c=>c.id===competition)?.participantTeamIds??[]);
  const candidates=state.players.filter(p=>p.professional?.employment!=="retired").map(player=>{
    const records=pro?player.seasonByLevel?.[level]:participants.has(player.teamId)?player.seasonStats:undefined;
    const teamId=pro?((player.teamId%10+10)%10)+(level==="second"?10:0):player.teamId;
    return {player,records,games:(player.teamId>=0?games.get(teamId):undefined)??Math.max(0,...games.values())};
  });
  return leaderMetrics[field].map(metric=>({metric,rows:candidates.flatMap(({player,records,games})=>{
    if(!records)return [];
    const sample=field==="batting"?records.batting.PA:records.pitching.outs;
    if(sample<=0||metric.qualified&&sample<(field==="batting"?Math.max(1,Math.ceil(games*3.1)):Math.max(1,games*3)))return [];
    const value=metric.value(records);
    return value===null||!Number.isFinite(value)?[]:[{player,value,sample}];
  }).sort((a,b)=>(metric.ascending?a.value-b.value:b.value-a.value)||b.sample-a.sample||a.player.id.localeCompare(b.player.id)).slice(0,10)}));
}
