import type {ProSeries} from "./sim/pro-types";
import type {GameState} from "./sim/types";

export const postseasonRounds=[
  {stage:"wildcard",id:"wildcard",label:"와일드카드",target:2,games:2,seed:3,from:null,home:[0,0]},
  {stage:"semi",id:"semi",label:"준플레이오프",target:3,games:5,seed:2,from:"wildcard",home:[0,0,1,1,0]},
  {stage:"playoff",id:"playoff",label:"플레이오프",target:3,games:5,seed:1,from:"semi",home:[0,0,1,1,0]},
  {stage:"final",id:"final",label:"한국시리즈",target:4,games:7,seed:0,from:"playoff",home:[0,0,1,1,1,0,0]},
] as const;
export const postseasonRound=(stage:ProSeries["stage"])=>postseasonRounds.find(round=>round.stage===stage)!;

export function regularSeasonFinishText(team:string,rank:number,firstTeam:boolean){
  const qualified=rank>=1&&rank<=5;
  const last=team.charCodeAt(team.length-1),subject=last>=0xac00&&last<=0xd7a3&&(last-0xac00)%28!==0?"은":"는";
  const title=rank===1?`${team} 정규시즌 우승!`:qualified?`${team} 포스트시즌 진출 성공 !`:`${team}${subject} 포스트 시즌 진출에 실패했습니다.`;
  const entry=rank===1?"1위로 한국시리즈에 진출합니다":rank===2?"2위로 플레이오프에 진출합니다.":rank===3?"3위로 준플레이오프에 직행합니다":rank===4||rank===5?`${rank}위로 와일드카드 결정전에 진출합니다`:"포스트시즌 종료 후 시즌이 종료됩니다.";
  const message=[entry,...(firstTeam?[]:["아쉽게도 포스트시즌 엔트리에는 등록되지 못했습니다"])].filter(Boolean).join("\n\n");
  return {title,message};
}

export function regularSeasonFinishNotice(state:GameState){
  const p=state.players.find(player=>player.id===state.playerId)!;
  const club=p.teamId>=0?p.teamId%10:p.professional?.contract?.club??state.postSchool?.pro?.club??null;
  const rank=(state.proWorld?.postseason?.seeds.indexOf(club??-1)??-1)+1;
  const team=club===null?"무소속":state.teams[club]?.name.replace(/ [12]군$/,"")??"무소속";
  return regularSeasonFinishText(team,rank,p.teamId>=0&&p.teamId<10);
}

export function professionalSeasonFinishNotice(state:GameState,year=state.proWorld?.year??state.calendar.seasonYear){
  const world=state.proWorld,archived=world?.seasons.find(season=>season.year===year);
  const champion=archived?archived.champion:world?.year===year?world.postseason?.champion:undefined;
  const team=champion==null?"미정":state.teams[champion]?.name.replace(/ [12]군$/,"")??"미정";
  return {title:`${team} 한국시리즈 우승!`,message:`${year} 시즌이 종료되었습니다. 이제 다음 시즌을 준비할 시간입니다.`};
}
