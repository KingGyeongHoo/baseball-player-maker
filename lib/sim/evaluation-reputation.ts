import {clamp,isPitcher,params,roleFor,roleScore,twoWayReputation} from "./engine";
import {evaluationLeague,unpackEvaluationRecord} from "./player-evaluation";
import {performanceEvidence,weightedRecords} from "./evaluation-metrics";
import type {EvaluationField,ReputationAssessment,ReputationBreakdown,ReputationPerformance} from "./player-evaluation-types";
import type {GameState,Player,RecordLine,Role} from "./types";
import {clearProfessionalReputation} from "./pro-selection";

export const REPUTATION_MODEL="evaluation-reputation-v1";
type Level="school"|"first"|"second";
const fields:EvaluationField[]=["batting","pitching"];

// Reuse the report's component priors and 6:3:1 weighted event counts, without
// running its fixed-opponent simulations for every player after each game.
export function updateEvaluationReputations(s:GameState) {
  if(s.careerMode==="pro"){
    for(const p of s.players)clearProfessionalReputation(p);
    return;
  }
  const history=new Map<string,RecordLine>(),stage="school";
  const levels:Level[]=["school"];
  for(const year of [s.calendar.seasonYear,s.calendar.seasonYear-1,s.calendar.seasonYear-2]){
    const archive=year<s.calendar.seasonYear?s.evaluationSystem?.contexts.filter(c=>c.year===year&&c.mode===stage&&c.date<=s.date).at(-1):undefined;
    for(const level of levels){const key=`${year}:${level}`,packed=archive?.history[key];history.set(key,packed?unpackEvaluationRecord(packed):evaluationLeague(s,year,level));}
  }
  const leagues=new Map<string,RecordLine>();
  for(const p of s.players){
    const evidence=(level:Level,field:EvaluationField):ReputationPerformance|null=>{
      const rows=[0,1,2].flatMap(ago=>{
        const year=s.calendar.seasonYear-ago,past=ago?p.career.find(row=>row.year===year):undefined;
        const records=ago?(level==="school"?!past?.careerMode?past?.records:undefined:past?.careerMode==="pro"?past.byLevel?.[level]:undefined):level==="school"?!p.careerMode?p.seasonStats:undefined:p.seasonByLevel?.[level];
        return records&&(field==="batting"?records.batting.PA:records.pitching.BF)>0?[{year,records,weight:[.6,.3,.1][ago]}]:[];
      });
      if(!rows.length)return null;
      const total=rows.reduce((n,row)=>n+row.weight,0),key=`${level}:${rows.map(row=>row.year).join(":")}`;
      let league=leagues.get(key);if(!league){league=weightedRecords(rows.map(row=>({records:history.get(`${row.year}:${level}`)!,weight:row.weight/total})));leagues.set(key,league);}
      const q=performanceEvidence(weightedRecords(rows.map(row=>({records:row.records,weight:row.weight/total}))),league,field,level==="school",level==="first");
      return q.score===null?null:{score:q.score,sample:q.sample,reliability:q.reliability};
    };
    const assessment:ReputationAssessment={version:1,modelVersion:REPUTATION_MODEL,date:s.date,season:s.calendar.seasonYear,mode:stage,
      fields:{batting:{school:null,first:null,second:null},pitching:{school:null,first:null,second:null}}};
    for(const field of fields)for(const level of levels)assessment.fields[field][level]=evidence(level,field);
    p.reputationEvaluation=assessment;
    if(p.twoWay)p.twoWay.reputationBonus=twoWayReputation(p);
    const breakdown=reputationBreakdown(p);
    p.performanceReputation=breakdown.performance;
    p.reputation=breakdown.total;
  }
}

export function reputationBreakdown(p:Player):ReputationBreakdown {
  const assessment=p.reputationEvaluation?.mode==="school"?p.reputationEvaluation:undefined;
  const roles:Role[]=p.twoWay?[roleFor(p.twoWay.pitchingPosition),roleFor(p.twoWay.battingPosition)]:[p.primaryRole];
  const maximum=params["reputation.performance_weight"]/(params["reputation.ability_weight"]+params["reputation.performance_weight"]);
  const parts=roles.map(role=>{
    const field:EvaluationField=isPitcher(role)?"pitching":"batting",data=assessment?.fields[field],ability=roleScore(p,role);
    let performance:number|null=null,reliability=0;
    if(data?.school){performance=data.school.score;reliability=data.school.reliability;}
    const performanceWeight=maximum*clamp(reliability,0,1),score=ability*(1-performanceWeight)+(performance??0)*performanceWeight;
    return {field,role,ability,performance,reliability,performanceWeight,score};
  });
  const performanceWeight=parts.reduce((n,p)=>n+p.performanceWeight,0)/parts.length;
  const performance=parts.length===1?parts[0].performance:performanceWeight?parts.reduce((n,p)=>n+(p.performance??0)*p.performanceWeight,0)/(parts.length*performanceWeight):null;
  const ability=parts.reduce((n,p)=>n+p.ability,0)/parts.length,base=parts.reduce((n,p)=>n+p.score,0)/parts.length;
  const bonus=(p.reputationBonus??0)+twoWayReputation(p);
  return {modelVersion:REPUTATION_MODEL,assessedAt:assessment?.date??null,ability,performance,performanceWeight,base,bonus,total:clamp(base+bonus),fields:parts};
}
