import type {ProSeries} from "./sim/pro-types";

export const postseasonRounds=[
  {stage:"wildcard",id:"wildcard",label:"와일드카드",target:2,games:2,seed:3,from:null,home:[0,0]},
  {stage:"semi",id:"semi",label:"준플레이오프",target:3,games:5,seed:2,from:"wildcard",home:[0,0,1,1,0]},
  {stage:"playoff",id:"playoff",label:"플레이오프",target:3,games:5,seed:1,from:"semi",home:[0,0,1,1,0]},
  {stage:"final",id:"final",label:"한국시리즈",target:4,games:7,seed:0,from:"playoff",home:[0,0,1,1,1,0,0]},
] as const;
export const postseasonRound=(stage:ProSeries["stage"])=>postseasonRounds.find(round=>round.stage===stage)!;
