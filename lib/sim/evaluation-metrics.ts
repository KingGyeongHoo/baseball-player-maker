import {clamp,emptyRecord} from "./engine";
import type {RecordLine} from "./types";
import type {EvaluationField,EvaluationRates,PerformanceEvidence} from "./player-evaluation-types";

const divide=(a:number,b:number)=>b>0?a/b:null;
export function evaluationRates(r:RecordLine,field:EvaluationField):EvaluationRates {
  const b=r.batting,p=r.pitching,avg=divide(b.H,b.AB),obp=divide(b.H+b.BB,b.PA),slg=divide(b.H+b["2B"]+2*b["3B"]+3*b.HR,b.AB);
  return field==="batting"?{avg,obp,slg,ops:obp!==null&&slg!==null?obp+slg:null,iso:avg!==null&&slg!==null?slg-avg:null,bb:divide(b.BB,b.PA),k:divide(b.SO,b.PA),hr:divide(b.HR,b.PA),era:null,whip:null,kMinusBB:null}
    :{avg:null,obp:null,slg:null,ops:null,iso:null,bb:divide(p.BB,p.BF),k:divide(p.SO,p.BF),hr:divide(p.HR,p.BF),era:divide(p.ER*27,p.outs),whip:divide((p.H+p.BB)*3,p.outs),kMinusBB:divide(p.SO-p.BB,p.BF)};
}
export const evaluationPriors={school:{events:60,hits:90,extraBases:150},pro:{events:50,hits:90,extraBases:150}};
export function performanceEvidence(records:RecordLine,leagueRecords:RecordLine,field:EvaluationField,school=false,first=false,priorOverride?:PerformanceEvidence["prior"]):PerformanceEvidence {
  const raw=evaluationRates(records,field),league=evaluationRates(leagueRecords,field),prior=priorOverride??evaluationPriors[school?"school":"pro"],n=field==="batting"?records.batting.PA:records.pitching.BF;
  const confidence=n===0?(first?"1군 검증 전":"경기 근거 없음"):school?n<30?"제한된 표본":n<90?"검증 진행":"시즌 내 근거 축적":n<(field==="batting"?100:120)?"제한된 표본":n<(field==="batting"?300:360)?"검증 진행":"시즌 내 근거 축적";
  const adjusted={...raw};
  if(n===0)return {field,sample:0,outs:records.pitching.outs,raw,adjusted,league,score:null,confidence,reliability:0,prior};
  // Component events have their own denominators. These never replace official records.
  const smooth=(events:number,sample:number,mean:number|null,pseudo:number)=>mean===null?divide(events,sample):(events+pseudo*mean)/(sample+pseudo);
  if(field==="batting"){
    const b=records.batting,l=leagueRecords.batting;
    adjusted.bb=smooth(b.BB,b.PA,league.bb,prior.events);adjusted.k=smooth(b.SO,b.PA,league.k,prior.events);adjusted.hr=smooth(b.HR,b.PA,league.hr,prior.extraBases);
    adjusted.avg=smooth(b.H,b.AB,league.avg,prior.hits);
    const extra=smooth(b["2B"]+2*b["3B"]+3*b.HR,b.AB,divide(l["2B"]+2*l["3B"]+3*l.HR,l.AB),prior.extraBases);
    adjusted.obp=adjusted.avg!==null&&adjusted.bb!==null?adjusted.bb+(1-adjusted.bb)*adjusted.avg:null;
    adjusted.slg=adjusted.avg!==null&&extra!==null?adjusted.avg+extra:null;
    adjusted.ops=adjusted.obp!==null&&adjusted.slg!==null?adjusted.obp+adjusted.slg:null;adjusted.iso=extra;
  }else{
    const p=records.pitching;adjusted.bb=smooth(p.BB,p.BF,league.bb,prior.events);adjusted.k=smooth(p.SO,p.BF,league.k,prior.events);adjusted.hr=smooth(p.HR,p.BF,league.hr,prior.extraBases);
    adjusted.kMinusBB=adjusted.k!==null&&adjusted.bb!==null?adjusted.k-adjusted.bb:null;
  }
  const difference=field==="batting"?adjusted.ops!==null&&league.ops!==null?(adjusted.ops-league.ops)*65:null:adjusted.k!==null&&adjusted.bb!==null&&adjusted.hr!==null&&league.k!==null&&league.bb!==null&&league.hr!==null?((adjusted.k-1.5*adjusted.bb-2*adjusted.hr)-(league.k-1.5*league.bb-2*league.hr))*120:null;
  // Algebraically identical weighted rates can differ by floating-point dust.
  // Keep a neutral comparison exactly neutral without rounding real skills.
  return {field,sample:n,outs:records.pitching.outs,raw,adjusted,league,score:difference===null?null:clamp(50+(Math.abs(difference)<1e-10?0:difference)),confidence,reliability:n/(n+prior.events),prior};
}
export function weightedRecords(rows:{records:RecordLine;weight:number}[]) {
  const result=emptyRecord();
  for(const {records,weight} of rows)for(const group of ["batting","pitching"] as const)for(const key of Object.keys(records[group]))(result[group] as Record<string,number>)[key]+=(records[group] as Record<string,number>)[key]*weight;
  return result;
}
