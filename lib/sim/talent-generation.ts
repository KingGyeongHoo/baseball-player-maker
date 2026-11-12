import type {Player} from "./types";

// Primary and secondary talents each use this national intake of 1,000.
export const talentIntake=[250,200,160,130,100,70,35,25,15,10,5] as const;
const total=talentIntake.reduce((sum,n)=>sum+n,0);
export function talentFromRoll(roll:number){
  const value=Math.max(0,Math.min(1,roll))*total;let cumulative=0;
  for(let i=0;i<talentIntake.length;i++){cumulative+=talentIntake[i];if(value<cumulative)return i;}
  return 10;
}

export function createTalentCohort(candidates:{id:string;pitching:boolean;bias:number}[],roll:()=>number){
  const counts=talentIntake.map(n=>Math.floor(n*candidates.length/total));
  const remainder=talentIntake.map((n,i)=>({i,fraction:n*candidates.length/total-counts[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
  const extra=candidates.length-counts.reduce((sum,n)=>sum+n,0);
  for(let i=0;i<extra;i++)counts[remainder[i].i]++;
  const result=new Map<string,Player["talent"]>();
  for(const secondary of [false,true]){
    // School reputation changes who receives scarce talent, never how many
    // high-talent players exist nationally. Every school can still draw a star.
    const ranked=candidates.map(candidate=>{const u=roll();return {...candidate,priority:u+candidate.bias*u*(1-u)};})
      .sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
    let index=0;
    for(let talent=0;talent<counts.length;talent++)for(let n=0;n<counts[talent];n++){
      const p=ranked[index++],value=result.get(p.id)??{batting:0,pitching:0};
      value[p.pitching!==secondary?"pitching":"batting"]=talent;result.set(p.id,value);
    }
  }
  return result;
}
