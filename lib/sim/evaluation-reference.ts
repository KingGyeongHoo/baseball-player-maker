import {clamp,effective,isPitcher,params,probabilities,roleScore,roles} from "./engine";
import {statKeys,type GameState,type Player,type Stats} from "./types";
import type {EvaluationReference,ExpectedMatchup} from "./player-evaluation-types";
import balance from "../../baseball_balance_v0_4.json";
import {evaluationPriors} from "./evaluation-metrics";
import {PRO_BALANCE_VERSION,proMatchParameters} from './pro-balance';

export const EVALUATION_MODEL="scouting-v1";
export function normalStats(player:Player,configuration=params):Stats{return effective({...player,fatigue:0,injury:null,forcedRest:false},configuration);}
export function makeEvaluationReference(s:GameState):EvaluationReference {
  const players=s.careerMode==="pro"?s.players.filter(p=>p.teamId>=0&&p.teamId<10&&p.professional?.employment!=="retired"):[];
  const batting=players.filter(p=>!isPitcher(p.primaryRole)||p.twoWay),pitching=players.filter(p=>isPitcher(p.primaryRole)||p.twoWay),fallback=()=>({mean:params["pro.first_mean"],sd:8,size:0,fallback:true});
  const distribution=(values:number[])=>{if(values.length<20)return {...fallback(),size:values.length};const mean=values.reduce((a,b)=>a+b,0)/values.length,sd=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length);return sd<.5?{...fallback(),size:values.length}:{mean,sd,size:values.length,fallback:false};};
  const tools=Object.fromEntries(statKeys.map(key=>{const group=["velocity","control","movement"].includes(key)?pitching:["contact","power","speed","defense","arm"].includes(key)?batting:players;return [key,distribution(group.map(p=>p.stats[key]))];})) as EvaluationReference["tools"];
  const roleDistributions=Object.fromEntries(roles.map(role=>{let group=players.filter(p=>p.primaryRole===role);if(group.length<20)group=isPitcher(role)?pitching:batting;return [role,distribution(group.map(p=>roleScore(p,role)))];})) as EvaluationReference["roles"];
  const baseline=Object.fromEntries(statKeys.map(key=>[key,params["pro.first_mean"]])) as Stats;
  const sample=(pool:Player[])=>{const sorted=[...pool].sort((a,b)=>a.id.localeCompare(b.id)),size=Math.min(64,sorted.length);return size>=20?Array.from({length:size},(_,i)=>normalStats({...sorted[Math.floor(i*sorted.length/size)],stance:{batting:"level",pitching:"command"}})):[{...baseline}];};
  const source=players.length>=20?s.date.slice(5)==="03-01"?"season-start":"introduced":"default";
  const parameters={...(s.careerMode==='pro'?proMatchParameters(params):params),...Object.fromEntries(Object.entries(evaluationPriors).flatMap(([stage,prior])=>Object.entries(prior).map(([key,n])=>[`evaluation.${stage}.${key}`,n])))};
  return {id:`${EVALUATION_MODEL}:${s.careerMode==="pro"?`pro-balance-v${PRO_BALANCE_VERSION}`:"school"}:${s.calendar.seasonYear}:${source}`,version:1,year:s.calendar.seasonYear,mode:s.careerMode==="pro"?"pro":"school",createdAt:s.date,source,population:{batting:batting.length,pitching:pitching.length},tools,roles:roleDistributions,opponents:{batting:sample(batting),pitching:sample(pitching)},defense:tools.defense.mean,arm:tools.arm.mean,parameters,roleWeights:structuredClone(balance.roleWeights)};
}
export function evaluationReference(s:GameState) {return s.evaluationSystem?.references.find(r=>r.year===s.calendar.seasonYear&&r.mode===(s.careerMode==="pro"?"pro":"school")&&(s.careerMode!=='pro'||r.parameters['pro.balance.version']===PRO_BALANCE_VERSION))??makeEvaluationReference(s);}
export function gradeTool(value:number,reference:{mean:number;sd:number}){const continuous=50+10*(value-reference.mean)/reference.sd;return {continuous,grade:clamp(5*Math.round(continuous/5),20,80)};}
export function standardMatchup(player:Player,reference:EvaluationReference,pitching=false):ExpectedMatchup {
  const own=normalStats(player,reference.parameters),opponents=pitching?reference.opponents.batting:reference.opponents.pitching;
  const total={bb:0,hit:0,k:0,single:0,double:0,triple:0,hr:0};
  for(const other of opponents){const p=probabilities(pitching?other:own,pitching?own:other,reference.defense,reference.arm,reference.parameters),hit=(1-p.bb)*p.hit;
    total.bb+=p.bb;total.hit+=hit;total.k+=(1-p.bb)*(1-p.hit)*p.k;total.hr+=hit*p.hr;total.double+=hit*p.double;total.triple+=hit*p.triple;total.single+=hit*(1-p.hr-p.double-p.triple);
  }
  const n=opponents.length;for(const key of Object.keys(total) as (keyof typeof total)[])total[key]/=n;
  const obp=total.bb+total.hit,slg=(total.single+2*total.double+3*total.triple+4*total.hr)/(1-total.bb);
  return {...total,obp,slg,ops:obp+slg,opponents:n};
}
