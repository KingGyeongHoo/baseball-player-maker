import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const {lifetimeRecords,careerContractSummary,careerHonors}=require('../.test-build/lib/career-summary.js');
const {recordRates}=require('../.test-build/lib/player-records.js'),{dashboardRecordValues}=require('../.test-build/app/components/dashboard-records.js');
const {CareerLifetimeRecords,CareerHonors}=require('../.test-build/app/components/pro-career-summary.js'),Assessments=require('../.test-build/app/components/pro-assessments.js').default;
const assessment=require('../.test-build/lib/sim/pro-assessment.js'),save=require('../.test-build/lib/career-save.js');
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('career-summary','통산선수','SS'));
const fixture=()=>structuredClone(template);
const row=(year,score,squad='first')=>({year,date:`${year}-10-31`,score,grade:score===null?'—':score>=79?'A':'C',cumulative:score,cumulativeGrade:'C',ability:76,role:'센터라인',squad,developmental:false,reserveSeason:false,firstTeam:squad==='first',secondOnly:squad==='second',firstGames:30,source:'season-end'});
function record(ab,h,outs=0){const r=e.emptyRecord();Object.assign(r.batting,{PA:ab+3,AB:ab,H:h,BB:3});Object.assign(r.pitching,{outs,BF:outs+5,H:2,BB:3,ER:1});r.games={batting:2,pitching:outs?1:0,wins:0,losses:0,holds:0,saves:0};return r;}

test('lifetime totals merge school, college, both pro levels and postseason once across clubs and current-year archives',()=>{
 const s=fixture(),p=e.getPlayer(s),first=record(30,12,17),second=record(40,4,4),post=record(5,1,2);s.calendar.seasonYear=2029;
 p.career=[{year:2026,grade:3,records:record(10,4,1),stats:p.stats},{year:2027,grade:4,careerMode:'college',records:record(20,4,2),stats:p.stats},{year:2028,grade:0,careerMode:'pro',records:record(999,999),stats:p.stats,byLevel:{first,second},postseason:post,byClub:{0:{first,second,postseason:post},1:{first,second,postseason:post}}},{year:2029,grade:0,careerMode:'pro',records:record(9999,9999),stats:p.stats}];
 p.seasonByLevel={first:record(100,30,3),second:record(50,20,4)};p.seasonPostseason=record(10,3,5);p.seasonStats=record(150,50);const before=structuredClone(p);
 const total=lifetimeRecords(p,2029);assert.equal(total.batting.AB,265);assert.equal(total.batting.H,78);assert.equal(total.pitching.outs,38);assert.equal(recordRates(total).average,78/265);assert.deepEqual(p,before);
 const html=renderToStaticMarkup(createElement(CareerLifetimeRecords,{state:s}));assert.equal((html.match(/<tfoot><tr>/g)||[]).length,1);assert.ok(!html.includes('<tbody>'));assert.ok(html.includes('통산'));assert.ok(!html.includes('2028</'));
 delete p.career[0].records.games;assert.equal(dashboardRecordValues(lifetimeRecords(p,2029),false)[0][1],'—');
});

test('honors group only this player, deduplicate legacy and new titles, distinguish selection from participation and hide unannounced trophies',()=>{
 const s=fixture(),p=e.getPlayer(s),id=p.id;s.proEvents={version:1,introducedAt:s.date,history:[],attemptedGames:[],cancellations:[],national:{},wbc:{2030:{sourceYear:2029,evaluatedAt:'2030-03-01',roster:[{id,position:'SS',reputation:90,roleScore:90}],offered:true,settled:true,participated:true,result:'WBC01:mvp'},2034:{sourceYear:2033,evaluatedAt:'2034-03-01',roster:[{id,position:'SS',reputation:90,roleScore:90}],offered:true,settled:true,participated:false}}};
 s.careerEventHistory=[{definitionId:'P08',date:'2027-08-01',choiceId:'choice-1',message:'청소년 국가대표 MVP',choice:'국가대표 소집에 응한다'},{definitionId:'WBC01',date:'2030-03-01',choiceId:'participate',proEvent:{branchId:'WBC01:mvp'}}];
 p.professional.allstarHistory=[{year:2030,level:'first',side:'blue',slot:'SS',method:'vote',participated:true,mvp:true}];
 const award=(kind,category,playerId=id)=>({year:2030,kind,category,playerId,playerName:p.name,club:0,value:1});
 const team=()=>({roster:[],withdrawn:[],ballots:{}}),allstar={version:1,year:2030,levels:{first:{blue:team(),white:team()},second:{blue:team(),white:team()}}};allstar.levels.first.blue.roster.push({playerId:id});allstar.levels.first.mvp={playerId:id};
 s.proWorld.seasons=[{year:2030,allstar,awardsCeremony:{version:1,scheduledAt:'2030-12-06',presentedAt:'2030-12-06'},awards:[award('골든글러브 · 유격수','goldGlove'),award('시즌 MVP','mvp'),award('홈런'),award('타율',undefined,'other')],individualAwards:[{level:'first',field:'batting',label:'홈런',metric:'HR',value:40,winners:[{playerId:id},{playerId:'tied'}]}]},{year:2031,awardsCeremony:{version:1,scheduledAt:'2031-12-06'},awards:[award('골든글러브 · 유격수','goldGlove'),award('시즌 MVP','mvp')]}];
 const before=structuredClone(s),honors=careerHonors(s);assert.equal(honors.national.filter(row=>row.year===2030).length,2);assert.equal(honors.national.find(row=>row.year===2034).detail,'선발 · 불참');assert.ok(honors.national.some(row=>row.title==='청소년 대표 MVP'));assert.equal(honors.allstar.length,2);assert.equal(honors.gold.length,1);assert.equal(honors.individual.filter(row=>row.title==='1군 홈런 1위').length,1);assert.equal(honors.individual.find(row=>row.title==='1군 홈런 1위').detail,'공동 1위');assert.ok(!honors.individual.some(row=>row.title.includes('타율')));assert.deepEqual(s,before);
 const html=renderToStaticMarkup(createElement(CareerHonors,{state:s}));for(const title of ['국가대표','골든글러브','올스타','개인 수상'])assert.ok(html.includes(title));
});

test('compact contract estimates include the current season once, ignore unrated/future seasons and count remaining contract years correctly',()=>{
 const s=fixture(),p=e.getPlayer(s);s.calendar.seasonYear=2031;p.professional.assessments=[row(2028,70),row(2029,80),row(2030,null),row(2040,100)];p.professional.employment='active';p.teamId=0;p.proContract.status='regular';p.fatigue=0;p.recentZ=0;for(const key of Object.keys(p.stats))p.stats[key]=76;p.professional.contract={...p.professional.contract,startYear:2031,endYear:2033,salary:100_000_000};
 const summary=careerContractSummary(s);assert.equal(summary.cumulative,75);assert.equal(summary.projected,(70+80+e.selectionScore(p))/3);assert.equal(summary.seasons,3);assert.equal(summary.salary,100_000_000);
 p.professional.assessments.push({...row(2031,82,'second'),salary:100_000_000});s.proWorld.seasonClosed=true;const frozen=careerContractSummary(s);assert.equal(frozen.cumulative,(70+80+82)/3);assert.equal(frozen.projected,frozen.cumulative);assert.equal(frozen.seasons,2);
 const html=renderToStaticMarkup(createElement(Assessments,{state:s}));assert.equal((html.match(/<thead><tr>/g)||[]).length,1);assert.match(html,/<th>시즌<\/th><th>출전평가<\/th><th>점수<\/th><th>연봉<\/th><th>최종 등록<\/th>/);assert.ok(html.includes('2군'));assert.ok(!html.includes('1군 출전경기'));assert.ok(!html.includes('기준 연봉'));
 p.professional.employment='freeAgent';assert.equal(careerContractSummary(s).seasons,0);assert.equal(careerContractSummary(s).salary,null);
});

test('new season assessments freeze the annual salary and final registration while old rows can use their saved payroll',()=>{
 const s=fixture(),p=e.getPlayer(s);p.professional.assessments=[];p.professional.contract.salary=90_000_000;p.teamId=10;const assessed=assessment.recordSeasonAssessment(s,p);assert.equal(assessed.salary,90_000_000);assert.equal(assessed.squad,'second');p.professional.contract.salary=180_000_000;assert.equal(assessment.recordSeasonAssessment(s,p).salary,90_000_000);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.equal(e.getPlayer(restored).professional.assessments[0].salary,90_000_000);
 delete p.professional.assessments[0].salary;p.professional.salaries=[{year:s.calendar.seasonYear,club:0,amount:10_000_000,salary:60_000_000}];const html=renderToStaticMarkup(createElement(Assessments,{state:s}));assert.ok(html.includes('6,000만 원'));
});
