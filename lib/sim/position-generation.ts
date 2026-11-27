import type {Position} from './types';

// 40 equal shares: SP 7, bullpen 13, C 4, IF 8, OF 8.
// School intake slots preserve the pitcher/batter mix. Actual school pitching
// roles are assigned from abilities by school-pitching-roles after generation.
const groups:{weight:number;positions:Position[]}[]=[
  {weight:7,positions:['SP']},{weight:11,positions:['RP']},{weight:2,positions:['CP']},
  {weight:4,positions:['C']},{weight:8,positions:['1B','2B','3B','SS']},{weight:8,positions:['LF','CF','RF']},
];
function shuffle<T>(items:T[],random:()=>number){
  for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
  return items;
}
function allocate(count:number,weights:number[],random:()=>number){
  const total=weights.reduce((sum,n)=>sum+n,0),exact=weights.map(weight=>count*weight/total),counts=exact.map(Math.floor);
  const order=exact.map((n,i)=>({i,fraction:n-counts[i],tie:random()})).sort((a,b)=>b.fraction-a.fraction||a.tie-b.tie||a.i-b.i);
  for(let left=count-counts.reduce((sum,n)=>sum+n,0),i=0;left>0;left--,i++)counts[order[i].i]++;
  return counts;
}
export function positionCohort(count:number,random:()=>number):Position[]{
  const counts=allocate(count,groups.map(group=>group.weight),random),positions:Position[]=[];
  groups.forEach((group,i)=>{
    const amounts=allocate(counts[i],group.positions.map(()=>1),random);
    group.positions.forEach((position,j)=>{for(let n=0;n<amounts[j];n++)positions.push(position);});
  });
  return shuffle(positions,random);
}
export function schoolPositionIntake(teamIds:number[],entryYear:number,random:()=>number,gradeSize=10){
  const teams=shuffle([...teamIds],random),result=new Map<number,Position[]>();
  if(gradeSize!==10){
    const all=positionCohort(teams.length*gradeSize,random);
    teams.forEach((team,i)=>result.set(team,all.slice(i*gradeSize,(i+1)*gradeSize)));return result;
  }
  const infields:Position[][]=[['1B','SS'],['2B','3B']],outfields:Position[][]=[['LF','CF'],['CF','RF'],['RF','LF']];
  teams.forEach((team,i)=>{
    const phase=i+entryYear,starters=phase%4===0?1:2,closers=phase%2===0?1:0;
    const positions:Position[]=['C',...infields[phase%2],...outfields[phase%3],...Array<Position>(starters).fill('SP'),...Array<Position>(5-starters-closers).fill('RP'),...Array<Position>(closers).fill('CP')];
    result.set(team,shuffle(positions,random));
  });
  return result;
}
