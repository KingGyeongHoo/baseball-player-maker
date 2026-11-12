export function talentMultiplier(value:number,min=1,max=2){return min+value/10*(max-min);}
export function talentBand(value:number){
  if(value===0)return {label:'없음',tone:'none',min:0,max:0};
  if(value<=3)return {label:'낮음',tone:'low',min:1,max:3};
  if(value<=6)return {label:'보통',tone:'normal',min:4,max:6};
  if(value<=9)return {label:'높음',tone:'high',min:7,max:9};
  return {label:'천재',tone:'genius',min:10,max:10};
}
