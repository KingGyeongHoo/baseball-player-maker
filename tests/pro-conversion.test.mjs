import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),life=require('../.test-build/lib/sim/pro-season.js'),assessment=require('../.test-build/lib/sim/pro-assessment.js'),squads=require('../.test-build/lib/sim/pro-squads.js');
const market=require('../.test-build/lib/sim/pro-market.js');
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('conversion-regression','정식전환','SS'));
function fixture(){const s=structuredClone(template),p=e.getPlayer(s),year=s.calendar.seasonYear;s.date=year+'-07-01';s.careerNotice=null;s.noticeQueue=[];s.proWorld.stage='summary';s.proWorld.seasonClosed=true;p.teamId=p.professional.contract.club+30;p.proContract={status:'developmental',joinedDate:year+'-02-01'};s.postSchool.pro.level='developmental';s.proWorld.goal='정식 선수 전환';p.professional.employment='active';p.professional.contract.salary=30_000_000;p.professional.contract.segments=[{from:year+'-02-01',salary:30_000_000}];for(const key of Object.keys(p.stats))p.stats[key]=50;p.professional.assessments=[];p.professional.assessmentUsage={year,activeDays:80,lowerDays:80,upperDays:0};p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};Object.assign(p.seasonByLevel.second.batting,{PA:80,AB:70,H:30,BB:10});return s;}
function history(s){const p=e.getPlayer(s),year=s.calendar.seasonYear;for(let y=year-2;y<=year;y++)p.professional.assessments.push({year:y,date:y+'-10-31',salary:50_000_000,score:70,grade:'C',ability:70,role:p.primaryRole,squad:'developmental',developmental:y!==year,reserveSeason:true,firstTeam:false,secondOnly:false,firstGames:0,cumulative:70,cumulativeGrade:'C',source:'season-end'});}
test('conversion synchronizes registration, salary, goal and assessment without granting a first-team place',()=>{const s=fixture(),p=e.getPlayer(s),club=p.teamId%10,before=structuredClone(p.seasonByLevel),salary=p.professional.contract.segments.length;assert.equal(pc.reviewDevelopmentContract(s),true);assert.equal(p.proContract.status,'regular');assert.equal(p.proContract.convertedDate,s.date);assert.equal(p.teamId,club+20);assert.equal(s.postSchool.pro.level,'third');assert.equal(s.proWorld.goal,'1군 승격');assert.equal(p.professional.contract.salary,50_000_000);assert.equal(p.professional.contract.segments.length,salary+1);assert.deepEqual(p.seasonByLevel,before);assert.equal(assessment.recordSeasonAssessment(s,p).reserveSeason,false);assert.equal(pc.reviewDevelopmentContract(s),false);assert.equal(p.professional.contract.segments.length,salary+1);});
test('a second-team conversion keeps its second-team registration and includes NPC conversions',()=>{const s=fixture(),p=e.getPlayer(s);p.teamId=p.teamId%10+10;const npc=structuredClone(p);npc.id='conversion-npc';npc.teamId=npc.teamId%10+30;s.players.push(npc);pc.reviewDevelopmentContract(s);assert.equal(s.postSchool.pro.level,'second');assert.equal(p.teamId<20,true);assert.equal(npc.proContract.status,'regular');assert.equal(npc.teamId>=20&&npc.teamId<30,true);});
test('conversion breaks the old reserve streak for initial developmental entrants as well as retries',()=>{const s=fixture(),p=e.getPlayer(s);pc.reviewDevelopmentContract(s);history(s);assert.equal(assessment.seasonExit(p,s.calendar.seasonYear),null);assessment.hydrateAssessments(s,p);const row=p.professional.assessments.at(-1);assert.equal(row.reserveSeason,false);assert.equal(row.developmental,false);assert.equal(row.squad,'third');});
test('loading a converted player left in the developmental squad repairs only its registration',()=>{const s=fixture(),p=e.getPlayer(s);p.proContract.status='regular';p.proContract.convertedDate=s.date;history(s);assert.equal(squads.needsProSquadUpgrade(s),true);const next=life.upgradeProfessionalState(s),q=e.getPlayer(next);assert.equal(p.teamId>=30,true,'input is immutable');assert.equal(q.teamId>=0&&q.teamId<30,true);assert.equal(q.professional.assessments.at(-1).reserveSeason,false);assert.equal(next.postSchool.pro.level!=='developmental',true);});
test('a provably false same-year reserve release is restored as regular without guaranteeing next-year pay',()=>{const s=fixture(),p=e.getPlayer(s),year=s.calendar.seasonYear,club=p.teamId%10;p.proContract.status='regular';p.proContract.convertedDate=s.date;history(s);const reason='잔류군·신고선수 상태가 3시즌 연속 이어졌습니다.';p.professional.nonRenewal={year,club,kind:'reserve',reason};p.professional.movements.push({date:year+'-10-31',from:club,to:null,kind:'방출',reason});p.professional.contract=null;p.professional.employment='freeAgent';p.teamId=-1;s.proWorld.seasonClosed=true;s.proWorld.stage='summary';s.phase='ended';s.date=year+'-10-31';const next=life.upgradeProfessionalState(s),q=e.getPlayer(next);assert.equal(q.professional.employment,'active');assert.equal(q.proContract.status,'regular');assert.equal(q.teamId,club+20);assert.equal(q.professional.contract.endYear,year);assert.equal(q.professional.nonRenewal,undefined);assert.equal(q.professional.movements.at(-1).kind,'복구');assert.equal(next.proWorld.market.kind,'renewal');});
test('conversion repair never restores an unrelated release or converts unsigned players',()=>{const s=fixture(),p=e.getPlayer(s);p.professional.contract=null;p.professional.employment='freeAgent';p.teamId=-1;pc.reviewDevelopmentContract(s);assert.equal(p.proContract.status,'developmental');p.proContract.status='regular';p.proContract.convertedDate=s.date;assert.equal(squads.needsProSquadUpgrade(s),false);assert.equal(life.upgradeProfessionalState(s),s);});
test('regular contracts cannot re-register into a stale developmental slot on renewal',()=>{const s=fixture(),p=e.getPlayer(s),club=p.teamId%10;p.proContract.status='regular';p.teamId=club+20;assert.equal(squads.setProSquad(s,p,'developmental'),false);assert.equal(p.teamId,club+20);p.teamId=-1;p.professional.lastSquad='developmental';const placement=market.contractPlacement(s,p,club,false,[],'developmental');assert.ok(placement);assert.equal(placement.team,club+20);});
for(const [position,key,required,outs,er] of [['SP','wins',2,63,14],['RP','holds',5,27,6],['CP','saves',3,27,6]])test(position+' conversion requires its role milestone and ERA <= 6 but no strikeout ratio',()=>{
  const s=fixture(),p=e.getPlayer(s);e.assignRole(p,e.roleFor(position));p.seasonByLevel.second=e.emptyRecord();const r=p.seasonByLevel.second;Object.assign(r.pitching,{outs,BF:100,ER:er,SO:0});r.games={[key]:required};
  assert.equal(pc.developmentProgress(p).pitching,true);r.games[key]--;assert.equal(pc.developmentProgress(p).pitching,false);r.games[key]++;r.pitching.ER++;assert.equal(pc.developmentProgress(p).pitching,false);r.pitching.ER=0;r.pitching.outs=position==='SP'?59:23;assert.equal(pc.developmentProgress(p).pitching,false);
  r.pitching.outs=outs;delete r.games;assert.equal(pc.developmentProgress(p).pitching,false,'missing legacy counters do not manufacture a win, hold or save');
});


test('current official farm All-Star selections qualify after the hitter minimum without another performance milestone',()=>{
 for(const method of ['vote','manager','replacement'])for(const position of ['SS','SP','RP','CP']){
  const s=fixture(),p=e.getPlayer(s);e.assignRole(p,e.roleFor(position));p.position=position;p.teamId=p.teamId%10+10;p.seasonByLevel.second=e.emptyRecord();if(position==='SS')Object.assign(p.seasonByLevel.second.batting,{PA:40,AB:40});
  p.professional.allstarHistory=[{year:s.calendar.seasonYear,level:'second',side:'blue',slot:position,method}];
  assert.equal(pc.developmentProgress(p,s.calendar.seasonYear).allstar,true);assert.equal(pc.developmentProgress(p).qualified,false);
  const before=structuredClone(p.seasonByLevel),segments=p.professional.contract.segments.length;
  assert.equal(pc.reviewDevelopmentContract(s),true);assert.equal(p.proContract.status,'regular');assert.equal(p.teamId%10+10,p.teamId);assert.equal(s.careerNotice.kind,'registered');assert.equal(p.professional.contract.salary,50_000_000);assert.deepEqual(p.seasonByLevel,before);
  assert.equal(pc.reviewDevelopmentContract(s),false);assert.equal(p.professional.contract.segments.length,segments+1);
 }
});
test('old selections and nominations cannot convert this year, while withdrawing after official selection does not revoke qualification',()=>{
 const s=fixture(),p=e.getPlayer(s);p.seasonByLevel.second=e.emptyRecord();
 Object.assign(p.seasonByLevel.second.batting,{PA:40,AB:40});
 p.professional.allstarHistory=[{year:s.calendar.seasonYear-1,level:'second',side:'blue',slot:'SS',method:'vote'}];
 assert.equal(pc.reviewDevelopmentContract(s),false);
 p.professional.allstarHistory=[];assert.equal(pc.reviewDevelopmentContract(s),false);
 p.professional.allstarHistory.push({year:s.calendar.seasonYear,level:'second',side:'blue',slot:'SS',method:'manager',withdrawn:true});
 assert.equal(pc.reviewDevelopmentContract(s),true);assert.equal(p.proContract.status,'regular');
});
test('an existing saved farm All-Star converts at season-end review and retains its conversion after saving again',()=>{
 const save=require('../.test-build/lib/career-save.js'),s=fixture(),p=e.getPlayer(s);p.seasonByLevel.second=e.emptyRecord();Object.assign(p.seasonByLevel.second.batting,{PA:40,AB:40});p.teamId=p.teamId%10+10;
 p.professional.allstarHistory=[{year:s.calendar.seasonYear,level:'second',side:'blue',slot:'SS',method:'vote'}];
 const original=structuredClone(s),restored=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;
 assert.deepEqual(s,original);assert.equal(pc.reviewDevelopmentContract(restored),true);
 const twice=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(restored))).state;
 assert.equal(e.getPlayer(twice).proContract.status,'regular');assert.equal(pc.reviewDevelopmentContract(twice),false);
});


test('batting conversion requires forty at-bats before any performance threshold',()=>{
 const s=fixture(),p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=50;
 const cases=[
  [{PA:79,AB:79,H:19,HR:4},false],
  [{PA:80,AB:80,H:0,HR:0},false],
  [{PA:30,AB:30,H:5,HR:5},false],
  [{PA:39,AB:39,H:20,HR:5},false],
  [{PA:40,AB:40,H:5,HR:5},true],
  [{PA:81,AB:81,H:20,HR:0},true],
  [{PA:80,AB:39,H:0,HR:0},false],
  [{PA:41,AB:41,H:15,HR:2},true],
  [{PA:10,AB:10,H:100,HR:100},false],
  [{PA:79,AB:79,H:20,HR:0},true],
  [{PA:40,AB:40,H:10,HR:0},true],
  [{PA:40,AB:40,H:9,HR:0},false],
  [{PA:1,AB:1,H:1,HR:0},false],
  [{PA:0,AB:0,H:0,HR:0},false],
 ];
 for(const [batting,expected] of cases){
  p.seasonByLevel.second=e.emptyRecord();Object.assign(p.seasonByLevel.second.batting,batting);
  assert.equal(pc.developmentProgress(p).batting,expected,JSON.stringify(batting));assert.equal(pc.developmentProgress(p).qualified,expected);
 }
 p.seasonByLevel.second=e.emptyRecord();p.seasonByLevel.first.batting.PA=100;p.seasonStats.batting.PA=100;
 assert.equal(pc.developmentProgress(p).qualified,false,'first-team and school totals cannot satisfy farm-record thresholds');
});
test('hitter minimum cannot be bypassed by All-Star selection, rating or WAR',()=>{
 for(const route of ['allstar','rating','war']){
  const s=fixture(),p=e.getPlayer(s);p.seasonByLevel.second=e.emptyRecord();Object.assign(p.seasonByLevel.second.batting,{PA:39,AB:39});
  if(route==='allstar')p.professional.allstarHistory=[{year:s.calendar.seasonYear,level:'second',side:'blue',slot:'SS',method:'vote'}];
  if(route==='rating')for(const key of Object.keys(p.stats))p.stats[key]=99;
  if(route==='war')Object.assign(p.seasonByLevel.first.batting,{PA:600,AB:600,H:300,HR:100});
  let progress=pc.developmentProgress(p,s.calendar.seasonYear);assert.equal(progress[route],true,route);assert.equal(progress.minimumSample,false);assert.equal(progress.qualified,false);
  assert.equal(pc.reviewDevelopmentContract(s),false);assert.equal(p.proContract.status,'developmental');
  p.seasonByLevel.second.batting.PA=p.seasonByLevel.second.batting.AB=40;
  progress=pc.developmentProgress(p,s.calendar.seasonYear);assert.equal(progress.minimumSample,true);assert.equal(progress.qualified,true,route);
 }
});

test('the displayed C grade qualifies after the hitter minimum, including the rounding boundary and developmental deduction',()=>{
 for(const position of ['SS','SP','RP','CP']){
  const s=fixture(),p=e.getPlayer(s);e.assignRole(p,e.roleFor(position));p.position=position;p.throws='R';p.recentZ=0;p.fatigue=0;
  p.professional.awardBonuses=[];p.professional.nationalBonus=0;delete p.professional.managedUntil;p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.seasonSpring=e.emptyRecord();
  for(const key of Object.keys(p.stats))p.stats[key]=80.94;
  let progress=pc.developmentProgress(p,s.calendar.seasonYear);assert.equal(progress.selectionGrade,'D');assert.equal(progress.rating,false);assert.equal(progress.qualified,false);
  for(const key of Object.keys(p.stats))p.stats[key]=80.96;
  progress=pc.developmentProgress(p,s.calendar.seasonYear);assert.equal(progress.selectionGrade,'C');assert.equal(progress.rating,true);assert.equal(progress.qualified,position!=='SS');assert.equal(progress.batting,false);assert.equal(progress.pitching,false);
  if(position==='SS'){
   for(const key of Object.keys(p.stats))p.stats[key]=99;
   Object.assign(p.seasonByLevel.second.batting,{PA:40,AB:40});
   assert.equal(pc.developmentProgress(p,s.calendar.seasonYear).qualified,true);
  }
  const before=structuredClone(p.stats),team=p.teamId;assert.equal(pc.reviewDevelopmentContract(s),true);assert.equal(p.proContract.status,'regular');assert.ok(p.teamId>=10);assert.equal(p.teamId%10,team%10);assert.deepEqual(p.stats,before);
 }
});

test('WAR independently qualifies at 1.5 wins using the same farm and relief adjustments',()=>{
 const war=require('../.test-build/lib/sim/pro-war.js'),s=fixture(),p=e.getPlayer(s);e.assignRole(p,'중간계투');p.position='RP';p.seasonByLevel.second=e.emptyRecord();
 const baseline=war.createProWarContext({...s,players:[]}),r=p.seasonByLevel.second.pitching;
 Object.assign(r,{outs:54,BF:90,SO:54});let progress=pc.developmentProgress(p,s.calendar.seasonYear,baseline);assert.ok(progress.warWins<1.5);assert.equal(progress.qualified,false);
 r.outs=r.SO=55;progress=pc.developmentProgress(p,s.calendar.seasonYear,baseline);assert.ok(progress.warWins>=1.5);assert.equal(progress.war,true);assert.equal(progress.batting,false);assert.equal(progress.pitching,false);assert.equal(progress.rating,false);
 Object.assign(r,{outs:100,BF:140,SO:100});assert.ok(pc.developmentProgress(p,s.calendar.seasonYear,war.createProWarContext(s)).war);
 s.proWorld.seasonClosed=false;const before=structuredClone(p.seasonByLevel);assert.equal(pc.reviewDevelopmentContract(s),false);s.proWorld.seasonClosed=true;assert.equal(pc.reviewDevelopmentContract(s),true);assert.deepEqual(p.seasonByLevel,before);
});

test('every qualification route waits for season-end review',()=>{
 for(const route of ['batting','rating','allstar']){
  const s=fixture(),p=e.getPlayer(s);s.proWorld.seasonClosed=false;s.proWorld.stage='regular';p.seasonByLevel.second=e.emptyRecord();
  Object.assign(p.seasonByLevel.second.batting,{PA:40,AB:40});
  if(route==='batting')Object.assign(p.seasonByLevel.second.batting,{PA:40,AB:40,H:10});
  if(route==='rating')for(const key of Object.keys(p.stats))p.stats[key]=99;
  if(route==='allstar')p.professional.allstarHistory=[{year:s.calendar.seasonYear,level:'second',side:'blue',slot:'SS',method:'vote'}];
  assert.equal(pc.developmentProgress(p,s.calendar.seasonYear)[route],true);
  const before=structuredClone(p);assert.equal(pc.reviewDevelopmentContract(s),false);assert.deepEqual(p,before);
  s.proWorld.seasonClosed=true;assert.equal(pc.reviewDevelopmentContract(s),true);
 }
});

function premature(){
 const s=fixture(),p=e.getPlayer(s);p.name='남중근';p.position='C';p.primaryRole='포수';p.teamId=p.teamId%10+10;s.postSchool.pro.level='second';s.proWorld.seasonClosed=false;s.proWorld.stage='regular';s.proWorld.goal='1군 승격';
 p.proContract.status='regular';p.proContract.convertedDate=s.date;p.professional.contract.salary=50_000_000;p.professional.contract.segments.push({from:s.date,salary:50_000_000});
 s.careerNotice={id:'premature-conversion',date:s.date,kind:'registered',title:'정식 선수 전환!',message:'전환'};
 return s;
}
test('loading a provably premature Nam conversion restores developmental status and salary while preserving catcher farm records',()=>{
 const s=premature(),original=structuredClone(s),p=e.getPlayer(s);const next=life.upgradeProfessionalState(s),q=e.getPlayer(next);
 assert.deepEqual(s,original);assert.equal(q.proContract.status,'developmental');assert.equal(q.proContract.convertedDate,undefined);assert.equal(q.professional.contract.salary,30_000_000);assert.equal(q.professional.contract.segments.length,1);
 assert.equal(q.teamId,p.teamId);assert.equal(next.postSchool.pro.level,'second');assert.equal(next.proWorld.goal,'정식 선수 전환');assert.equal(next.careerNotice,undefined);
 assert.deepEqual(q.stats,p.stats);assert.deepEqual(q.seasonByLevel,p.seasonByLevel);assert.deepEqual(q.career,p.career);assert.deepEqual(next.rngStates,s.rngStates);
 assert.equal(squads.needsProSquadUpgrade(next),false);assert.equal(life.upgradeProfessionalState(next),next);
 life.closeProfessionalSeason(next);assert.equal(q.proContract.status,'regular');assert.equal(next.careerNotice.kind,'registered');assert.ok(next.noticeQueue.some(n=>n.kind==='seasonComplete'));
});
test('premature repair leaves completed conversions, previous years, new contracts and active simulation intact',()=>{
 const repair=require('../.test-build/lib/sim/pro-conversion.js');
 for(const guard of ['closed','previousYear','newContract','week','match','event']){
  const s=premature(),p=e.getPlayer(s);
  if(guard==='closed')s.proWorld.seasonClosed=true;
  if(guard==='previousYear')p.proContract.convertedDate=(s.calendar.seasonYear-1)+'-07-01';
  if(guard==='newContract')p.professional.contract.segments=[p.professional.contract.segments.at(-1)];
  if(guard==='week')s.weekProgress={};if(guard==='match')s.matchProgress={};if(guard==='event')s.careerEvent={id:'pending'};
  const before=structuredClone(s);assert.equal(repair.repairConversionRegistrations(s),false,guard);assert.deepEqual(s,before,guard);
 }
});
