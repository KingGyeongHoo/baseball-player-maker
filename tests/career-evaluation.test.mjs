import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const war=require('../.test-build/lib/sim/pro-war.js');
const ranks=require('../.test-build/lib/sim/pro-season-ranking.js');
const c=require('../.test-build/lib/sim/pro-career-evaluation.js');
const honors=require('../.test-build/lib/sim/retirement-honors.js');
const save=require('../.test-build/lib/career-save.js');
const {careerContractSummary}=require('../.test-build/lib/career-summary.js');
const Summary=require('../.test-build/app/components/pro-assessments.js').default;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('career-evaluation','누적검증','SP'));
function row(year,rank=1,level='first'){
  const assessment=war.proWarAssessment({...e.getPlayer(template),seasonByLevel:{first:e.emptyRecord(),second:e.emptyRecord()}});
  const grade=ranks.seasonRankGrade(rank,10);
  return {year,date:`${year}-10-31`,score:71,grade,cumulative:null,cumulativeGrade:'—',ability:70,role:'선발',squad:level,developmental:false,reserveSeason:false,firstTeam:level==='first',secondOnly:level==='second',firstGames:100,honorRegistration:{seasonDays:100,firstDaysByClub:level==='first'?{0:90}:{}},source:'season-end',war:assessment,seasonRank:{version:1,year,role:'starter',level,war:0,rank,total:10,grade}};
}
test('career evaluation combines all-season mean 70% with best five mean 30%, using percentile rather than raw scores',()=>{
  const rows=Array.from({length:10},(_,i)=>row(2030+i,i+1)),evaluation=c.evaluateCareer(rows,'first');
  assert.equal(evaluation.average,55);assert.equal(evaluation.peak,80);assert.equal(evaluation.score,62.5);assert.equal(evaluation.grade,'B');
  rows.forEach(r=>r.score=99);assert.equal(c.evaluateCareer(rows,'first').score,62.5);
});
test('rank boundary grades match season cuts; fewer than five seasons use available seasons without zero padding',()=>{
  for(const [score,grade]of [[100,'S'],[90,'A'],[70,'B'],[50,'C'],[20,'D'],[10,'F'],[null,'—']])assert.equal(c.careerPercentileGrade(score),grade);
  assert.equal(c.evaluateCareer([row(2030,2)],'first').score,90);
  assert.equal(c.evaluateCareer([],'first').score,null);
});
test('levels remain separate, injury/unrated seasons are excluded, and real F seasons are included',()=>{
  const rows=[row(2030),row(2031,10),row(2032,1,'second'),{...row(2033),score:null},{...row(2034),clubGamesShortage:true},{...row(2035),seasonRank:undefined}];
  const first=c.evaluateCareer(rows,'first'),second=c.evaluateCareer(rows,'second');
  assert.equal(first.seasons,2);assert.equal(first.score,55);assert.equal(second.seasons,1);assert.equal(second.grade,'S');assert.equal(first.unranked,1);
  assert.equal(c.evaluateCareer(rows,'first',2030).score,100);
});
test('first-team career scores require 90% registration across clubs after injury leave',()=>{
  const short={...row(2030),honorRegistration:{seasonDays:100,firstDaysByClub:{0:3}}};
  const eligible={...row(2031,5),honorRegistration:{seasonDays:100,firstDaysByClub:{0:42,1:30},injuryDaysByClub:{1:20}}};
  const legacy={...row(2032),honorRegistration:undefined};
  assert.equal(c.evaluateCareer([short,legacy],'first').score,null);
  const result=c.evaluateCareer([short,eligible,legacy,row(2033,1,'second')],'first');
  assert.equal(result.seasons,1);assert.equal(result.score,60);
});
test('historical role changes use each saved rank; level WAR sums include fielding and relief scaling',()=>{
  const p=structuredClone(e.getPlayer(template)),first=row(2030,2),second=row(2031,3);second.role='마무리';second.seasonRank.role='closer';
  first.war.first.batting=2;first.war.first.fielding=.5;first.war.first.positional=-.2;second.war.first.pitching=1;second.war.second.pitching=.5;
  p.professional.rookieYear=2027;p.professional.assessments=[first,second];p.position='SS';
  const result=c.playerCareerEvaluation(p);assert.equal(result.first.score,85);assert.equal(result.first.war,5.3);assert.equal(result.second.war,1.5);
});
test('retirement honors use first-team career rank grade, preserving existing service requirements',()=>{
  const s=structuredClone(template),p=e.getPlayer(s),pro=p.professional,club=pro.contract.club;
  pro.rookieYear=2030;pro.firstClub=club;pro.service=[{club,from:2030,to:2050}];pro.movements=[];pro.contract.endYear=2050;p.teamId=club;s.calendar.seasonYear=2050;s.proWorld.seasonClosed=true;
  pro.assessments=Array.from({length:21},(_,i)=>({...row(2030+i,2),honorRegistration:{seasonDays:100,firstDaysByClub:{[club]:90}}}));
  let eligibility=honors.retirementEligibility(s,p);assert.equal(eligibility.grade,'A');assert.equal(eligibility.retiredNumber,true);
  pro.assessments.forEach(r=>r.seasonRank.level='second');eligibility=honors.retirementEligibility(s,p);assert.equal(eligibility.grade,'—');assert.equal(eligibility.retiredNumber,false);
});
test('derived cumulative grades survive save/load and the compact summary omits career WAR',()=>{
  const s=structuredClone(template),p=e.getPlayer(s);s.calendar.seasonYear=2032;p.professional.rookieYear=2027;p.professional.assessments=[row(2030,2),row(2031,4),row(2032,1,'second')];
  c.refreshCareerEvaluation(p);assert.equal(p.professional.assessments[1].cumulative,80);assert.equal(p.professional.assessments[1].cumulativeGrade,'A');
  const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
  assert.deepEqual(e.getPlayer(restored).professional.assessments,p.professional.assessments);
  const html=renderToStaticMarkup(createElement(Summary,{state:restored}));assert.ok(html.includes('<span>누적 평가</span>'));assert.doesNotMatch(html,/누적 평가 · 2군|통산 WAR/);
});
test('season and career numbers share the role-percentile scale across the live summary and historical table',()=>{
  const s=structuredClone(template),p=e.getPlayer(s);s.calendar.seasonYear=2032;
  p.professional.rookieYear=2027;p.professional.assessments=[row(2030,1),row(2031,6),row(2032,10)];
  const before=structuredClone(p.professional.assessments),summary=careerContractSummary(s);
  assert.equal(summary.seasonScore,10);assert.equal(summary.seasonGrade,'F');
  assert.ok(Math.abs(summary.cumulative-(100+50+10)/3)<1e-9);
  const html=renderToStaticMarkup(createElement(Summary,{state:s}));
  for(const value of ['100.0','50.0','10.0'])assert.ok(html.includes(`<td>${value}</td>`));
  assert.ok(!html.includes('<td>71.0</td>'));
  assert.deepEqual(p.professional.assessments,before);
  assert.equal(c.seasonPercentile(undefined),null);
});
test('career evaluation begins in the rookie year and retirement service begins in year four',()=>{
  const s=structuredClone(template),p=e.getPlayer(s),pro=p.professional,club=pro.contract.club;
  pro.rookieYear=2028;
  pro.assessments=[2028,2029,2030,2031].map(year=>({
    ...row(year,year===2031?5:1),honorRegistration:{seasonDays:100,firstDaysByClub:{[club]:90}}
  }));
  s.calendar.seasonYear=2028;
  assert.equal(careerContractSummary(s).career.first.seasons,1);
  assert.equal(careerContractSummary(s).cumulative,100);
  assert.equal(honors.retirementEligibility(s,p).seasons,0);
  s.calendar.seasonYear=2031;
  c.refreshCareerEvaluation(p);
  assert.equal(careerContractSummary(s).career.first.seasons,4);
  assert.equal(pro.assessments.at(-1).cumulative,90);
  assert.equal(honors.retirementEligibility(s,p).seasons,1);
});
