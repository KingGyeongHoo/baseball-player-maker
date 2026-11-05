import {statKeys,type Player,type Stats} from "./types";

export function ageEfficiency(player:Player) {
  if(player.careerMode!=="pro")return 1;
  const age=player.age??19;
  return age<=22?1.2:age<=26?1.1:age<=29?1:age<=32?.8:age<=35?.6:age<=38?.4:.25;
}
export function professionalGrowth(player:Player) {
  return ageEfficiency(player)*(player.professional?.employment==="freeAgent"?.6:1);
}
export function applyAging(player:Player,year:number):Partial<Stats> {
  const pro=player.professional;if(!pro||pro.agedYear>=year)return {};
  const age=(player.age??19)+pro.agingOffset,band=age<30?0:age<=32?1:age<=35?2:age<=38?3:4;
  const changes:Partial<Stats>={};
  for(const key of statKeys){
    const rates=key==="speed"||key==="velocity"?[0,.3,.7,1.2,1.8]:["power","arm","stamina","recovery"].includes(key)?[0,.15,.45,.9,1.4]:key==="bq"?[0,0,0,0,.1]:[0,0,.1,.35,.7];
    const before=player.stats[key];player.stats[key]=Math.max(1,before-rates[band]);changes[key]=player.stats[key]-before;
  }
  pro.agedYear=year;pro.ageChanges=changes;return changes;
}
