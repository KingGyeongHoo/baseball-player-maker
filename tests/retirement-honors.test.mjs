import test from 'node:test';
import {attachTestRanks} from './helpers/career-ranks.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const honors=require('../.test-build/lib/sim/retirement-honors.js'),retirement=require('../.test-build/lib/sim/pro-retirement.js'),assess=require('../.test-build/lib/sim/pro-assessment.js');
const jersey=require('../.test-build/lib/jersey-numbers.js'),save=require('../.test-build/lib/career-save.js'),locks=require('../.test-build/lib/retired-number-reservations.js');
const {createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Retirement=require('../.test-build/app/components/pro-retirement-dashboard.js').default;
const squads=require('../.test-build/lib/sim/pro-squads.js');
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('retirement-honors','구단의전설','SP'));
function fixture(count=21,score=80){
 const s=structuredClone(template),p=e.getPlayer(s),pro=p.professional,club=pro.contract.club,rookie=2028,year=rookie+count-1;
 s.date=`${year}-10-31`;s.calendar.seasonYear=year;s.proWorld.year=year;s.proWorld.seasonClosed=true;s.proWorld.stage='summary';s.careerNotice=null;s.noticeQueue=[];
 pro.rookieYear=rookie;pro.firstClub=club;pro.service=[{club,from:rookie,to:year}];pro.movements=[];pro.employment='active';p.teamId=club;p.jerseyNumber=77;pro.contract.endYear=year;
 pro.assessments=Array.from({length:count},(_,i)=>({year:rookie+i,date:`${rookie+i}-10-31`,score,grade:'A',cumulative:score,cumulativeGrade:'A',ability:80,role:p.primaryRole,squad:'first',developmental:false,reserveSeason:false,firstTeam:true,secondOnly:false,firstGames:0,source:'season-end',firstWarByClub:{[club]:i===0?50:0},honorRegistration:{seasonDays:100,firstDaysByClub:{[club]:90}}}));
 attachTestRanks(p);return {s,p,pro,club};
}
test('ceremony accepts C and tour accepts B with thirteen total credited seasons',()=>{
 const {s,p,pro}=fixture(16);
 for(const row of pro.assessments){row.war.first.batting=30/16;row.war.first.pitching=0;}
 let eligible=honors.retirementEligibility(s,p);assert.equal(eligible.grade,'C');assert.equal(eligible.ceremony,true);assert.equal(eligible.tour,false);
 for(const row of pro.assessments)row.war.first.batting=40/16;
 // Break the ten-year streak while retaining thirteen total credited seasons.
 pro.service=[{club:pro.firstClub,from:s.calendar.seasonYear-4,to:s.calendar.seasonYear}];
 eligible=honors.retirementEligibility(s,p);assert.equal(eligible.grade,'B');assert.equal(eligible.seasons,13);assert.equal(eligible.consecutive,5);assert.equal(eligible.tour,true);
 pro.assessments[3].honorRegistration.firstDaysByClub={};assert.equal(honors.retirementEligibility(s,p).tour,false);
});
test('old retired bullpen saves recalculate honors and retired numbers once without changing original WAR, records or RNG',()=>{
 const {s,p,pro,club}=fixture(16);
 for(const row of pro.assessments){row.role='불펜';row.seasonRank.role='bullpen';row.war.first.batting=0;row.war.first.pitching=1;row.firstWarByClub={[club]:row===pro.assessments[0]?40:0};}
 for(const row of pro.assessments.slice(0,4))s.proWorld.seasons.push({year:row.year,awards:[{year:row.year,playerId:p.id,playerName:p.name,club,kind:'시즌 MVP',category:'mvp',value:1},{year:row.year,playerId:p.id,playerName:p.name,club,kind:'골든글러브',category:'goldGlove',value:1},...['홈런왕','타점왕','도루왕'].map(kind=>({year:row.year,playerId:p.id,playerName:p.name,club,kind,value:1}))],draft:[],standings:[],farmStandings:[],champion:null});
 retirement.retireProfessional(s);delete s.proWorld.careerHonorRulesVersion;delete s.proWorld.retirementHonors;delete s.proWorld.retiredNumbers;
 const records=structuredClone(p.seasonByLevel),war=structuredClone(pro.assessments.map(r=>r.war)),rng=structuredClone(s.rngStates),news=structuredClone(s.proWorld.news);
 const restored=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state,q=e.getPlayer(restored);
 assert.equal(restored.proWorld.stage,'retired');assert.equal(q.teamId,-1);assert.equal(q.professional.employment,'retired');
 assert.equal(restored.proWorld.retirementHonors[0].ceremony,true);assert.equal(restored.proWorld.retirementHonors[0].tour,true);
 assert.equal(restored.proWorld.retiredNumbers[0].criteria.clubWar,40);assert.equal(restored.proWorld.retiredNumbers[0].criteria.awardBonus,12);
 assert.deepEqual(q.professional.assessments.map(r=>r.war),war);assert.deepEqual(q.seasonByLevel,records);assert.deepEqual(restored.rngStates,rng);assert.deepEqual(restored.proWorld.news,news);
 const again=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(restored))).state;
 assert.deepEqual(again.proWorld.retirementHonors,restored.proWorld.retirementHonors);assert.deepEqual(again.proWorld.retiredNumbers,restored.proWorld.retiredNumbers);
});
test('a live legacy career upgrades cached grades once and preserves the input state',()=>{
 const {s,p,pro}=fixture(13);delete s.proWorld.careerHonorRulesVersion;
 for(const row of pro.assessments){row.role='불펜';row.seasonRank.role='bullpen';row.war.first.batting=0;row.war.first.pitching=1;row.cumulativeGrade='F';}
 const original=structuredClone(s),life=require('../.test-build/lib/sim/pro-season.js'),next=life.upgradeProfessionalState(s);
 assert.deepEqual(s,original);assert.equal(e.getPlayer(next).professional.assessments.at(-1).cumulativeGrade,'C');assert.equal(next.proWorld.careerHonorRulesVersion,3);
 assert.deepEqual(e.getPlayer(next).seasonByLevel,p.seasonByLevel);assert.equal(life.upgradeProfessionalState(next),next);
});
test('a legacy retired number with missing career evidence retains its recorded grade and reservation',()=>{
 const {s,pro}=fixture();retirement.retireProfessional(s);const original=structuredClone(s.proWorld.retiredNumbers[0]);pro.assessments=[];delete s.proWorld.careerHonorRulesVersion;
 require('../.test-build/lib/sim/career-honor-upgrade.js').upgradeCareerHonors(s);
 assert.deepEqual(s.proWorld.retiredNumbers[0],original);assert.doesNotThrow(()=>save.encodeCareerSave(s));
});
test('loading a doubled-WAR save restores raw grades and removes only a provably bonus-only retired number',()=>{
 const {s,p,pro,club}=fixture(16);
 for(const row of pro.assessments){row.role='불펜';row.seasonRank.role='bullpen';row.war.first.batting=0;row.war.first.pitching=1;row.firstWarByClub={[club]:row===pro.assessments[0]?20:0};row.cumulativeGrade='S';}
 retirement.retireProfessional(s);s.proWorld.careerHonorRulesVersion=1;
 s.proWorld.retiredNumbers=[{club,number:77,playerId:p.id,playerName:p.name,date:s.date,grade:'S',score:90,criteria:{clubWar:40,awardBonus:12,seasons:13}}];
 const raw=structuredClone(pro.assessments.map(r=>r.war));
 const restored=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;
 assert.equal(e.getPlayer(restored).professional.assessments.at(-1).cumulativeGrade,'B');assert.equal(restored.proWorld.careerHonorRulesVersion,3);
 assert.deepEqual(restored.proWorld.retiredNumbers,[]);assert.equal(restored.proWorld.retirementHonors[0].tour,true);
 assert.deepEqual(e.getPlayer(restored).professional.assessments.map(r=>r.war),raw);
 const next=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(restored))).state;assert.deepEqual(next.proWorld.retiredNumbers,[]);
});
test('retired numbers require ten consecutive credited seasons, excluding the initial three years',()=>{
 for(const [score,count,eligible] of [[82,12,false],[78,13,true]]){
  const {s,p}=fixture(count,score),result=honors.retirementEligibility(s,p);assert.equal(result.seasons,count-3);assert.equal(result.retiredNumber,eligible,`${score}:${count}`);
 }
});
test('a completed ten-season streak remains valid through a shorter final season',()=>{
 const {s,p,pro,club}=fixture(14);
 pro.assessments.at(-1).honorRegistration.firstDaysByClub[club]=89;
 assert.equal(honors.retirementEligibility(s,p).retiredNumber,true);
});
test('thirteen split seasons qualify only when a club-initiated trade interrupted the stint',()=>{
 const {s,p,pro,club}=fixture(17);
 const other=(club+1)%10;
 pro.service=[{club,from:2028,to:2036},{club:other,from:2037,to:2037},{club,from:2038,to:s.calendar.seasonYear}];
 pro.assessments.find(row=>row.year===2037).honorRegistration.firstDaysByClub={[other]:90};
 pro.movements=[
  {date:'2036-12-01',from:club,to:other,kind:'트레이드',reason:'구단 간 교환'},
  {date:'2037-12-01',from:other,to:club,kind:'FA 이적',reason:'원소속 구단 복귀'}
 ];
 const eligible=()=>honors.retirementEligibility(s,p).retiredNumber;
 assert.equal(honors.retirementEligibility(s,p).seasons,13);
 assert.equal(eligible(),true);
 const final=pro.assessments.at(-1).honorRegistration.firstDaysByClub;
 final[club]=89;assert.equal(eligible(),false);
 final[club]=90;
 pro.movements[0].requestedTrade=true;assert.equal(eligible(),false);
 delete pro.movements[0].requestedTrade;
 pro.movements[0].kind='FA 이적';assert.equal(eligible(),false);
 pro.movements=[];assert.equal(eligible(),false);
});
test('retired numbers require 40 club WAR and 50 combined points, with at most three points per award season',()=>{
 const {s,p,pro,club}=fixture(13);
 const other=(club+1)%10;
 pro.assessments[0].firstWarByClub={[club]:40,[other]:60};
 for(const row of pro.assessments.slice(0,4)){
  const {year}=row,award={year,playerId:p.id,playerName:p.name,club,value:1};
  const awards=[{...award,kind:'시즌 MVP',category:'mvp'},{...award,kind:'골든글러브',category:'goldGlove'}];
  if(year!==pro.rookieYear+3)for(const kind of ['타점왕','득점왕','도루왕','홈런왕'])awards.push({...award,kind});
  else awards.splice(1,1,{...award,kind:'골든글러브',category:'goldGlove',club:other});
  s.proWorld.seasons.push({year,awards,individualAwards:[],draft:[]});
 }
 const last=s.proWorld.seasons.at(-1);
 last.awards.push({playerId:p.id,club,kind:'도루왕'});
 last.individualAwards=[{level:'first',field:'batting',metric:'SB',winners:[{playerId:p.id,club}]}];
 s.nationalTeams=[{year:last.year,kind:'wbc',roster:[{id:p.id,club,team:s.teams[club].name}]},{year:last.year,kind:'youth',roster:[{id:p.id,club}]}];
 assert.deepEqual(honors.retirementEligibility(s,p).criteria,{clubWar:40,awardBonus:10.7,seasons:10});
 assert.equal(honors.retirementEligibility(s,p).retiredNumber,true);
 s.proWorld.seasons.at(-1).awards[0].level='second';
 assert.equal(honors.retirementEligibility(s,p).retiredNumber,false);
 pro.assessments[0].firstWarByClub[club]=39.99;
 s.proWorld.seasons.at(-1).awards.push({playerId:p.id,club,kind:'타점왕'},{playerId:p.id,club,kind:'득점왕'},{playerId:p.id,club,kind:'도루왕'});
 assert.equal(honors.retirementEligibility(s,p).retiredNumber,false);
});
test('veteran retirement counts consecutive low grades or short registration with age-specific thresholds',()=>{
 const {s,p,pro,club}=fixture(),year=s.calendar.seasonYear;
 const [third,previous,current]=pro.assessments.slice(-3);
 previous.seasonRank.grade='C';
 current.honorRegistration.firstDaysByClub[club]=89;
 for(const age of [35,36,39]){p.age=age;assert.equal(retirement.veteranRetirementReason(p,year),undefined);}
 p.age=40;assert.match(retirement.veteranRetirementReason(p,year),/2시즌/);
 p.age=41;assert.match(retirement.veteranRetirementReason(p,year),/2시즌/);
 previous.seasonRank.grade='B';assert.equal(retirement.veteranRetirementReason(p,year),undefined);
 p.age=36;third.seasonRank.grade='F';previous.seasonRank.grade='C';
 assert.equal(retirement.veteranRetirementReason(p,year),undefined);
 previous.seasonRank.grade='D';assert.match(retirement.veteranRetirementReason(p,year),/3시즌/);
 p.age=42;assert.ok(retirement.veteranRetirementReason(p,year));
 current.honorRegistration.firstDaysByClub[club]=90;
 current.seasonRank.grade='B';assert.ok(retirement.veteranRetirementReason(p,year));
 current.seasonRank.grade='A';assert.equal(retirement.veteranRetirementReason(p,year),undefined);
 current.seasonRank.level='second';assert.ok(retirement.veteranRetirementReason(p,year));
});
test('90 percent registration applies equally to pitchers, uses exact days and never invents missing historical days',()=>{
 const {s,p,pro,club}=fixture(13);assert.equal(honors.retirementEligibility(s,p).retiredNumber,true);
 pro.assessments.at(-1).honorRegistration.firstDaysByClub[club]=89;assert.equal(honors.retirementEligibility(s,p).retiredNumber,false);
 delete pro.assessments.at(-1).honorRegistration;assert.equal(honors.retirementEligibility(s,p).seasons,9);
 for(const row of pro.assessments)row.honorRegistration={seasonDays:100,firstDaysByClub:{}};
 assert.equal(honors.retirementEligibility(s,p).seasons,0);
});
test('a ceremony can use ten nonconsecutive C seasons, while seven consecutive seasons also qualify',()=>{
 const {s,p,pro}=fixture(18,79),selected=new Set([3,4,5,7,8,9,11,12,14,17]);
 pro.assessments.forEach((row,i)=>{if(!selected.has(i))row.honorRegistration.firstDaysByClub={};});
 let result=honors.retirementEligibility(s,p);assert.equal(result.seasons,10);assert.equal(result.consecutive,1);assert.equal(result.ceremony,true);assert.equal(result.tour,false);
 const consecutive=fixture(10,79);assert.equal(honors.retirementEligibility(consecutive.s,consecutive.p).ceremony,true);
 consecutive.pro.assessments[5].honorRegistration.firstDaysByClub={};assert.equal(honors.retirementEligibility(consecutive.s,consecutive.p).ceremony,false);
});

test('injury demotion days are removed from the denominator, with zero eligible days never earning credit',()=>{
 const {s,p,pro,club}=fixture(13);const row=pro.assessments.at(-1);
 row.honorRegistration={seasonDays:100,firstDaysByClub:{[club]:72},injuryDaysByClub:{[club]:20}};
 assert.equal(honors.retirementEligibility(s,p).retiredNumber,true,'72 / (100 - 20) is exactly 90 percent');
 row.honorRegistration.firstDaysByClub[club]=71;assert.equal(honors.retirementEligibility(s,p).retiredNumber,false);
 row.honorRegistration={seasonDays:100,firstDaysByClub:{},injuryDaysByClub:{[club]:100}};assert.equal(honors.retirementEligibility(s,p).seasons,9);
 row.honorRegistration={seasonDays:100,firstDaysByClub:{[club]:90},injuryDaysByClub:{[club]:20}};assert.throws(()=>save.encodeCareerSave(s),/은퇴 예우/);
});

test('daily evidence excludes actual injury demotions and stops excluding days on recovery',()=>{
 const {s,p,pro,club}=fixture(4);pro.assessments=[];delete pro.honorUsage;
 const season=s.calendar.competitions.find(row=>row.id==='pro-first');season.startDate='2031-03-01';season.endDate=e.addDays(season.startDate,99);s.calendar.seasonYear=2031;
 for(let day=0;day<100;day++){
  s.date=e.addDays(season.startDate,day);
  if(day===72){p.injury={severity:'mild',startDate:s.date,unavailableUntil:e.addDays(season.startDate,92),originalPenalty:0,penaltyRemaining:0,penaltyRecoverDays:0};assert.equal(squads.setProSquad(s,p,'second'),true);}
  assess.recordAssessmentDay(s,p);assess.recordAssessmentDay(s,p);
 }
 assert.equal(pro.honorUsage.firstDaysByClub[club],72);assert.equal(pro.honorUsage.injuryDaysByClub[club],20);assert.equal(pro.honorInjuryLeave,undefined);
 const recorded=assess.recordSeasonAssessment(s,p);assert.equal(recorded.honorRegistration.injuryDaysByClub[club],20);
});

test('injury while already in the farm team does not masquerade as an injury demotion',()=>{
 const {s,p,pro,club}=fixture(4);delete pro.honorUsage;p.teamId=club+10;s.date='2031-04-01';
 const season=s.calendar.competitions.find(row=>row.id==='pro-first');season.startDate=s.date;season.endDate='2031-05-01';
 p.injury={severity:'mild',startDate:s.date,unavailableUntil:'2031-04-10',originalPenalty:0,penaltyRemaining:0,penaltyRecoverDays:0};
 honors.markHonorInjuryLeave(s,p,club+10);assess.recordAssessmentDay(s,p);assert.equal(pro.honorUsage.injuryDaysByClub,undefined);
 p.teamId=club;s.date='2031-04-02';assess.recordAssessmentDay(s,p);assert.equal(pro.honorUsage.firstDaysByClub[club],1);assert.equal(pro.honorUsage.injuryDaysByClub,undefined);
});
test('a tour requires B and thirteen total or ten consecutive credited seasons',()=>{
 const {s,p,pro}=fixture(25,80),selected=new Set([3,4,5,7,8,9,11,12,13,15,16,17,19,21,24]);
 pro.assessments.forEach((row,i)=>{if(!selected.has(i))row.honorRegistration.firstDaysByClub={};});
 assert.equal(honors.retirementEligibility(s,p).tour,true);
 const consecutive=fixture(13,80);assert.equal(honors.retirementEligibility(consecutive.s,consecutive.p).tour,true);
 for(const row of consecutive.pro.assessments)row.score=76;attachTestRanks(consecutive.p);assert.equal(honors.retirementEligibility(consecutive.s,consecutive.p).tour,false);
});
test('same-club release and reentry preserve one-club status and totals but restart the consecutive period',()=>{
 const {s,p,pro,club}=fixture();pro.movements=[{date:'2038-01-01',from:club,to:null,kind:'방출',reason:'계약 불가'},{date:'2039-02-01',from:null,to:club,kind:'계약',reason:'신고 재입단'}];
 pro.service=[{club,from:2028,to:2037},{club,from:2039,to:s.calendar.seasonYear}];
 let result=honors.retirementEligibility(s,p);assert.equal(result.oneClub,true);assert.equal(result.seasons,18);assert.equal(result.consecutive,10);assert.equal(result.retiredNumber,true);
 pro.service.push({club:(club+1)%10,from:2038,to:2038});assert.equal(honors.retirementEligibility(s,p).retiredNumber,true);
});
test('a player must retire attached to the honoring club',()=>{
 const {s,p,pro}=fixture();pro.employment='freeAgent';pro.contract=null;p.teamId=-1;
 const result=honors.retirementEligibility(s,p);assert.equal(result.ceremony,false);assert.equal(result.tour,false);assert.equal(result.retiredNumber,false);
});
test('regular registration is counted once per day, excludes spring/postseason and freezes per-club evidence',()=>{
 const {s,p,pro,club}=fixture(4);pro.assessments=[];delete pro.honorUsage;
 const competition=s.calendar.competitions.find(row=>row.id==='pro-first');competition.startDate='2031-03-01';competition.endDate=e.addDays(competition.startDate,99);s.calendar.seasonYear=2031;
 s.date='2031-02-28';assess.recordAssessmentDay(s,p);assert.equal(pro.honorUsage,undefined);
 for(let day=0;day<100;day++){s.date=e.addDays(competition.startDate,day);p.teamId=day<90?club:club+10;assess.recordAssessmentDay(s,p);assess.recordAssessmentDay(s,p);}
 s.date=e.addDays(competition.endDate,1);assess.recordAssessmentDay(s,p);assert.equal(pro.honorUsage.firstDaysByClub[club],90);
 const row=assess.recordSeasonAssessment(s,p);assert.deepEqual(row.honorRegistration,{seasonDays:100,firstDaysByClub:{[club]:90}});
 pro.honorUsage.firstDaysByClub[club]=0;assert.equal(row.honorRegistration.firstDaysByClub[club],90);
});
test('the existing retirement action decides ceremony, tour and number together without a separate declaration',()=>{
 const {s,p,pro}=fixture(13,80);delete pro.assessments[0].firstWarByClub;retirement.retireProfessional(s);assert.equal(s.proWorld.stage,'retired');assert.equal(s.proWorld.retirementHonors[0].ceremony,true);assert.equal(s.proWorld.retirementHonors[0].tour,true);assert.equal(s.proWorld.retiredNumbers,undefined);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.equal(restored.proWorld.retirementHonors[0].tour,true);
 const html=renderToStaticMarkup(createElement(Retirement,{state:restored,onRecords(){},onNew(){}}));assert.match(html,/은퇴식/);assert.match(html,/은퇴 투어/);assert.doesNotMatch(html,/은퇴 선언/);
});
test('retirement criteria render, and saved careers reserve a number across games until removed',()=>{
 const {s,p,club}=fixture();retirement.retireProfessional(s);assert.equal(s.proWorld.retirementHonors[0].ceremony,true);assert.equal(s.proWorld.retiredNumbers[0].number,77);
 const html=renderToStaticMarkup(createElement(Retirement,{state:s,onRecords(){},onNew(){}}));assert.match(html,/은퇴식/);assert.match(html,/구단 WAR 50.0/);
 const claims=locks.retiredNumberClaims(s);assert.equal(claims.length,1);const other=fixture().s;other.seed='another-career';
 const locked=locks.applyRetiredNumberClaims(other,claims);assert.throws(()=>jersey.choosePlayerJersey(locked,77),/영구결번/);assert.equal(e.getPlayer(locked).jerseyNumber===77,false);
 const released=locks.applyRetiredNumberClaims(locked,[]);jersey.choosePlayerJersey(released,77);assert.equal(e.getPlayer(released).jerseyNumber,77);
 assert.equal(save.encodeCareerSave(locked).state.savedRetiredNumbers,undefined,'foreign save locks must be refreshed from storage, not copied into exported files');
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.deepEqual(restored.proWorld.retirementHonors,s.proWorld.retirementHonors);
});
test('invalid registration and farewell evidence is rejected before saving',()=>{
 const {s,pro}=fixture();pro.assessments[3].honorRegistration.firstDaysByClub={'0':101};assert.throws(()=>save.encodeCareerSave(s),/은퇴 예우/);
 pro.assessments[3].honorRegistration.firstDaysByClub={};s.proWorld.retirementHonors=[{club:0,playerId:s.playerId,playerName:'검증',date:s.date,score:80,grade:'A',seasons:10,consecutive:11,ceremony:true,tour:true}];assert.throws(()=>save.encodeCareerSave(s),/은퇴 예우/);
});
