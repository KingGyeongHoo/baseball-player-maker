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
const {firstTeamRetention}=require('../.test-build/lib/sim/pro-assessment.js');
const save=require('../.test-build/lib/career-save.js');
const {careerContractSummary}=require('../.test-build/lib/career-summary.js');
const Summary=require('../.test-build/app/components/pro-assessments.js').default;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('career-evaluation','누적검증','SP'));
function row(year,rank=1,level='first'){
  const assessment=war.proWarAssessment({...e.getPlayer(template),seasonByLevel:{first:e.emptyRecord(),second:e.emptyRecord()}});
  const grade=ranks.seasonRankGrade(rank,10);
  return {year,date:`${year}-10-31`,score:71,grade,cumulative:null,cumulativeGrade:'—',ability:70,role:'선발',squad:level,developmental:false,reserveSeason:false,firstTeam:level==='first',secondOnly:level==='second',firstGames:100,honorRegistration:{seasonDays:100,firstDaysByClub:level==='first'?{0:90}:{}},source:'season-end',war:assessment,seasonRank:{version:1,year,role:'starter',level,war:0,rank,total:10,grade}};
}
test('career totals include the same deduplicated MVP, gold glove, title and national bonuses as retired-number criteria',()=>{
 const s=structuredClone(template),p=e.getPlayer(s),club=p.teamId%10;s.calendar.seasonYear=2030;s.date='2030-10-31';
 p.professional.assessments=[row(2030)];p.professional.assessments[0].war.first.batting=29.5;
 const award=(kind,category)=>({year:2030,playerId:p.id,playerName:p.name,club,kind,category,value:1});
 const mvp=award('시즌 MVP','mvp');s.proWorld.seasons=[{year:2030,standings:[],farmStandings:[],champion:null,draft:[],rookieRulesVersion:2,awards:[mvp,{...mvp},award('골든글러브','goldGlove'),award('홈런왕')],individualAwards:[{level:'first',field:'batting',metric:'HR',label:'홈런왕',value:30,winners:[{playerId:p.id,playerName:p.name,club}]}]}];
 s.nationalTeams=[{year:2030,kind:'wbc',roster:[{id:p.id,club,team:s.teams[club].name}]},{year:2030,kind:'wbc',roster:[{id:p.id,club,team:s.teams[club].name}]},{year:2030,kind:'youth',roster:[{id:p.id,club,team:s.teams[club].name}]}];
 assert.equal(c.syncCareerHonorBonuses(s),true);assert.equal(c.syncCareerHonorBonuses(s),false);
 const evaluation=c.playerCareerEvaluation(p,2030).first;assert.equal(evaluation.awardBonus,2.2);assert.equal(evaluation.cumulativeWar,31.7);assert.equal(evaluation.grade,'C');
 const helper=require('../.test-build/lib/sim/career-honor-bonus.js');assert.equal(helper.careerHonorBonusYears(helper.buildCareerHonorBonusIndex(s),p.id,club).get(2030),2.2);
 assert.equal(careerContractSummary(s).career.first.cumulativeWar,31.7);
 s.nationalTeams=s.nationalTeams.filter((_,i)=>i!==1).map(entry=>({...entry,start:'2030-03-01',end:'2030-03-20',roster:entry.roster.map(member=>({...member,name:p.name,field:'pitching',roleScore:80}))}));
 const loaded=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;assert.equal(c.playerCareerEvaluation(e.getPlayer(loaded),2030).first.cumulativeWar,31.7);
 const national=award('도루왕');s.proWorld.seasons[0].awards.push(national,award('타점왕'),award('안타왕'));c.syncCareerHonorBonuses(s);
 assert.equal(c.playerCareerEvaluation(p,2030).first.awardBonus,3);assert.equal(c.playerCareerEvaluation(p,2029).first.awardBonus,0);
});
test('a senior national selection immediately adds career points and retains its original club after a move',()=>{
 const s=structuredClone(template),p=e.getPlayer(s),club=p.teamId%10,year=s.calendar.seasonYear;
 require('../.test-build/lib/sim/national-teams.js').rememberNational(s,'wbc',[{id:p.id,position:p.position,selectionScore:80,roleScore:80}]);
 assert.equal(c.playerCareerEvaluation(p,year).first.awardBonus,.2);
 p.teamId=(club+1)%10;const helper=require('../.test-build/lib/sim/career-honor-bonus.js'),index=helper.buildCareerHonorBonusIndex(s);
 assert.equal(helper.careerHonorBonusYears(index,p.id,club).get(year),.2);assert.equal(helper.careerHonorBonusYears(index,p.id,p.teamId).size,0);
});
test('bullpen career WAR uses original WAR with unchanged bonuses and historical starter seasons',()=>{
 for(const role of ['불펜','중간계투','마무리']){
  const bullpen=row(2030),starter=row(2031);bullpen.role=role;bullpen.seasonRank.role='bullpen';
  bullpen.war.first.pitching=1;starter.war.first.pitching=2;bullpen.clubAwardCounts={first:1};
  const before=structuredClone([bullpen,starter]),evaluation=c.evaluateCareer([bullpen,starter],'first');
  assert.equal(evaluation.war,5);assert.equal(evaluation.cumulativeWar,5.1);assert.deepEqual([bullpen,starter],before);
  assert.equal(c.evaluateCareer([bullpen,starter],'first').cumulativeWar,5.1);
 }
});
test('career evaluation combines all-season mean 70% with best five mean 30%, using percentile rather than raw scores',()=>{
  const rows=Array.from({length:10},(_,i)=>row(2030+i,i+1)),evaluation=c.evaluateCareer(rows,'first');
  assert.equal(evaluation.average,55);assert.equal(evaluation.peak,80);assert.equal(evaluation.score,62.5);assert.equal(evaluation.grade,'F');
  rows.forEach(r=>r.score=99);assert.equal(c.evaluateCareer(rows,'first').score,62.5);
});
test('cumulative WAR grades include the lower bound of every band and distinguish missing scores',()=>{
  for(const [score,grade]of [[100,'S'],[60,'S'],[59.99,'A'],[50,'A'],[49.99,'B'],[40,'B'],[39.99,'C'],[30,'C'],[29.99,'D'],[20,'D'],[19.99,'E'],[10,'E'],[9.99,'F'],[-1,'F'],[null,'—']])assert.equal(c.careerWarGrade(score),grade);
  assert.equal(c.evaluateCareer([row(2030,2)],'first').score,90);
  assert.equal(c.evaluateCareer([],'first').score,null);
});
test('club awards add once per club and year to the matching career level across save and reload',()=>{
 const s=structuredClone(template),p=e.getPlayer(s);
 p.professional.assessments=[row(2030,2),row(2031,3,'second')];
 s.calendar.seasonYear=2031;s.date='2031-10-31';
 const award=(year,kind,club=0)=>({year,kind,playerId:p.id,playerName:p.name,club,value:1});
 const firstAward=award(2030,'1군 최우수 선수');
 const archive={standings:[],farmStandings:[],champion:null,draft:[],rookieRulesVersion:1};
 s.proWorld.seasons=[{...archive,year:2030,awards:[firstAward,{...firstAward}]},{...archive,year:2031,awards:[award(2031,'구단 육성 우수 선수')]}];
 assert.equal(c.syncClubAwardCounts(s),true);
 assert.equal(c.syncClubAwardCounts(s),false);
 const career=c.playerCareerEvaluation(p);
 assert.equal(career.first.score,90.1);
 assert.equal(career.second.score,80.05);
 assert.equal(p.professional.assessments[0].cumulative,90.1);
 assert.equal(p.professional.assessments[0].score,71);
 for(const assessment of p.professional.assessments)delete assessment.clubAwardCounts;
 const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
 assert.deepEqual(c.playerCareerEvaluation(e.getPlayer(loaded)),career);
});
test('levels remain separate, injury/unrated seasons are excluded, and real F seasons are included',()=>{
  const rows=[row(2030),row(2031,10),row(2032,1,'second'),{...row(2033),score:null},{...row(2034),clubGamesShortage:true},{...row(2035),seasonRank:undefined}];
  const first=c.evaluateCareer(rows,'first'),second=c.evaluateCareer(rows,'second');
  assert.equal(first.seasons,2);assert.equal(first.score,55);assert.equal(second.seasons,1);assert.equal(second.grade,'F');assert.equal(first.unranked,1);
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
test('retirement ceremonies still use first-team career grade independently of retired-number WAR',()=>{
  const s=structuredClone(template),p=e.getPlayer(s),pro=p.professional,club=pro.contract.club;
  pro.rookieYear=2030;pro.firstClub=club;pro.service=[{club,from:2030,to:2050}];pro.movements=[];pro.contract.endYear=2050;p.teamId=club;s.calendar.seasonYear=2050;s.proWorld.seasonClosed=true;
  pro.assessments=Array.from({length:21},(_,i)=>({...row(2030+i,2),honorRegistration:{seasonDays:100,firstDaysByClub:{[club]:90}}}));
  pro.assessments[0].war.first.batting=50;
  pro.assessments[0].firstWarByClub={[club]:20,[(club+1)%10]:30};
  let eligibility=honors.retirementEligibility(s,p);assert.equal(eligibility.grade,'A');assert.equal(eligibility.ceremony,true);assert.equal(eligibility.retiredNumber,false);
  assert.equal(firstTeamRetention(p,2050).grade,'A');
  pro.assessments.forEach(r=>r.seasonRank.level='second');eligibility=honors.retirementEligibility(s,p);assert.equal(eligibility.grade,'—');assert.equal(eligibility.ceremony,false);assert.equal(eligibility.retiredNumber,false);
});
test('derived cumulative grades survive save/load and the compact summary displays points',()=>{
  const s=structuredClone(template),p=e.getPlayer(s);s.calendar.seasonYear=2032;p.professional.rookieYear=2027;p.professional.assessments=[row(2030,2),row(2031,4),row(2032,1,'second')];
  p.professional.assessments[0].war.first.batting=20;
  p.professional.assessments[1].war.first.batting=30;
  c.refreshCareerEvaluation(p);assert.equal(p.professional.assessments[1].cumulative,80);assert.equal(p.professional.assessments[1].cumulativeGrade,'A');
  const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
  assert.deepEqual(e.getPlayer(restored).professional.assessments,p.professional.assessments);
  const html=renderToStaticMarkup(createElement(Summary,{state:restored}));assert.ok(html.includes('<span>누적 평가</span>'));assert.match(html,/<b>50\.00<\/b>/);assert.match(html,/누적 평가 등급 A/);assert.doesNotMatch(html,/누적 평가 · 2군/);
});
test('season and career numbers share the role-percentile scale across the live summary and historical table',()=>{
  const s=structuredClone(template),p=e.getPlayer(s);s.calendar.seasonYear=2032;
  p.professional.rookieYear=2027;p.professional.assessments=[row(2030,1),row(2031,6),row(2032,10)];
  p.career=[{year:2030,careerMode:'pro',schoolId:11},{year:2031,careerMode:'pro',schoolId:7}];
  const before=structuredClone(p.professional.assessments),summary=careerContractSummary(s);
  assert.equal(summary.seasonScore,10);assert.equal(summary.seasonGrade,'F');
  assert.ok(Math.abs(summary.cumulative-(100+50+10)/3)<1e-9);
  const html=renderToStaticMarkup(createElement(Summary,{state:s}));
  assert.match(html,/2030<\/th><td>서울 트윈스<\/td>/);
  assert.match(html,/2031<\/th><td>대구 라이온즈<\/td>/);
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
