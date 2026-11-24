import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const a=require('../.test-build/lib/sim/pro-assessment.js');
const farm=require('../.test-build/lib/sim/pro-farm.js');
const squads=require('../.test-build/lib/sim/pro-squads.js');
const evaluation=require('../.test-build/lib/sim/pro-season-evaluation.js');
const ranking=require('../.test-build/lib/sim/pro-season-ranking.js');
const save=require('../.test-build/lib/career-save.js');
const {careerContractSummary}=require('../.test-build/lib/career-summary.js');
const ProAssessments=require('../.test-build/app/components/pro-assessments.js').default;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('zero-appearance','공백검증','SS'));
function fixture(){
 const s=structuredClone(template),p=e.getPlayer(s);s.date=`${s.calendar.seasonYear}-07-20`;s.proWorld.stage='regular';s.proWorld.seasonClosed=false;
 s.careerEvent=null;s.careerNotice=null;s.noticeQueue=[];delete s.weekProgress;delete s.matchProgress;
 p.professional.assessments=[];p.professional.employment='active';p.teamId=20;p.proContract.status='regular';
 p.seasonStats=e.emptyRecord();p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.seasonPostseason=e.emptyRecord();p.seasonFarmPostseason=e.emptyRecord();
 return s;
}
test('zero appearances is a final F with zero WAR and no fabricated rank',()=>{
 const s=fixture(),p=e.getPlayer(s);s.proWorld.seasonClosed=true;
 const records=structuredClone(p.seasonByLevel),row=a.recordSeasonAssessment(s,p);
 assert.equal(row.grade,'F');assert.equal(row.score,71);assert.equal(row.noAppearances,true);assert.equal(row.war.equivalentWins,0);assert.equal(row.seasonRank,undefined);
 evaluation.refreshSeasonEvaluations(s);ranking.freezeSeasonRankings(s);
 assert.equal(row.grade,'F');assert.equal(row.score,71);assert.deepEqual(p.seasonByLevel,records);
 const summary=careerContractSummary(s);assert.equal(summary.seasonGrade,'F');assert.equal(summary.seasonScore,0);
 const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s,false))).state;
 assert.equal(e.getPlayer(loaded).professional.assessments.at(-1).noAppearances,true);assert.equal(careerContractSummary(loaded).seasonGrade,'F');
 assert.strictEqual(a.recordSeasonAssessment(s,p),row);assert.equal(p.professional.assessments.length,1);
});
test('live unplayed season displays 0.0 and F without creating a frozen assessment',()=>{
 const s=fixture(),p=e.getPlayer(s),summary=careerContractSummary(s);
 assert.equal(summary.war.equivalentWins,0);assert.equal(summary.seasonGrade,'F');assert.equal(summary.seasonScore,0);assert.equal(p.professional.assessments.length,0);
 const html=renderToStaticMarkup(createElement(ProAssessments,{state:s}));
 const current=html.slice(html.indexOf('<span>시즌 평가</span>'),html.indexOf('<span>누적 평가</span>'));
 assert.match(current,/<b>0\.0<\/b>/);assert.match(current,/시즌 평가 등급 F/);assert.doesNotMatch(current,/미평가/);
 p.seasonByLevel.second.batting.PA=1;
 assert.equal(careerContractSummary(s).noAppearances,false);assert.equal(p.professional.assessments.length,0);
});
test('old F-without-WAR and current unrated saves migrate to zero WAR and F exactly once',()=>{
 for(const kind of ['old-f','unrated']){
  const s=fixture(),p=e.getPlayer(s),row=a.recordSeasonAssessment(s,p);
  delete row.war;delete row.seasonEvaluation;row.score=kind==='old-f'?0:null;
  if(kind==='unrated'){delete row.noAppearances;row.grade='—';}
  const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s,false))).state;
  const q=e.getPlayer(loaded),fixed=q.professional.assessments[0];
  assert.equal(fixed.war.equivalentWins,0);assert.equal(fixed.grade,'F');assert.equal(fixed.noAppearances,true);assert.equal(fixed.score,71);
  const again=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(loaded,false))).state;
  assert.deepEqual(e.getPlayer(again).professional.assessments,q.professional.assessments);
 }
});
test('old unmarked unrated years are not assumed to have zero appearances',()=>{
 const s=fixture(),p=e.getPlayer(s),row=a.recordSeasonAssessment(s,p);
 row.year--;delete row.war;delete row.seasonEvaluation;delete row.noAppearances;row.score=null;row.grade='—';
 const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s,false))).state;
 assert.equal(e.getPlayer(loaded).professional.assessments[0].score,null);
});
test('zero appearances still becomes F for an all-year injury or a forfeited farm schedule',()=>{
 for(const reason of ['injury','forfeit']){
  const s=fixture(),p=e.getPlayer(s),year=s.calendar.seasonYear;
  if(reason==='injury')p.evaluationAvailability={year,days:200,availableDays:0,injuredDays:200};
  else s.calendar.events=Array.from({length:60},(_,i)=>({id:`forfeit-${i}`,date:`${year}-07-01`,competitionId:'pro-second',status:'forfeit',homeTeamId:10,awayTeamId:11,boxScore:{}}));
  const row=a.recordSeasonAssessment(s,p);assert.equal(row.grade,'F');assert.equal(row.war.equivalentWins,0);assert.equal(row.clubGamesShortage,undefined);
 }
});
test('one official batting, pitching, defensive or running appearance avoids forced F; spring does not count',()=>{
 const variants=[r=>r.batting.PA=1,r=>r.pitching.BF=1,r=>r.games={batting:1},r=>r.games={pitching:1},r=>r.fielding={outs:{SS:1}},r=>r.batting.SB=1,r=>r.batting.CS=1];
 for(const apply of variants){const s=fixture(),p=e.getPlayer(s);apply(p.seasonByLevel.second);assert(a.hasSeasonAppearance(p));assert.equal(a.recordSeasonAssessment(s,p).noAppearances,undefined);}
 const post=fixture(),p=e.getPlayer(post);p.seasonFarmPostseason.games={batting:1};assert(a.hasSeasonAppearance(p));
 const spring=fixture(),q=e.getPlayer(spring);q.seasonSpring=e.emptyRecord();q.seasonSpring.batting.PA=20;assert.equal(a.recordSeasonAssessment(spring,q).grade,'F');
});
test('zero-appearance rookie seasons trigger release at the end of the third season',()=>{
 const s=fixture(),p=e.getPlayer(s);p.age=28;p.professional.rookieYear=2027;
 for(let year=2027;year<=2029;year++){
  s.calendar.seasonYear=year;s.proWorld.year=year;s.date=`${year}-10-31`;a.recordSeasonAssessment(s,p);
  assert.equal(a.seasonExit(p,year)?.kind??null,year===2029?'post-rookie-evaluation':null);
 }
});
function depth(){
 const s=fixture(),base=structuredClone(e.getPlayer(s));s.players=[];s.playerId='unrelated-user';
 function add(id,team,position,skill,developmental=false){
  const p=structuredClone(base);p.id=id;p.name=id;p.teamId=team;p.position=position;p.primaryRole=e.roleFor(position);p.eligiblePositions=[position];delete p.twoWay;
  for(const k of Object.keys(p.stats))p.stats[k]=skill;
  p.professional.eventSelectionBonus=0;p.professional.lastRegistration=s.date;p.professional.movements=[];p.professional.contract.club=team%10;
  delete p.professional.contract.faTerms;delete p.professional.farmVacancyPosition;p.professional.managedUntil=undefined;p.recentAppearances=[];p.proContract.status=developmental?'developmental':'regular';
  p.fatigue=0;p.injury=null;p.forcedRest=false;s.players.push(p);return p;
 }
 return {s,add};
}
test('three first-team players force the lowest selection score down even with a stronger reserve and recent registration',()=>{
 const {s,add}=depth();const weak=add('weak',0,'SS',30),mid=add('mid',0,'SS',50),best=add('best',0,'SS',70),reserve=add('reserve',20,'SS',90);
 const before=structuredClone(weak.stats);assert(farm.fillSecondTeamVacancies(s,[0]));assert.equal(weak.teamId,10);assert.equal(mid.teamId,0);assert.equal(best.teamId,0);assert.equal(reserve.teamId,20);assert.deepEqual(weak.stats,before);
 assert.equal(weak.professional.lastRegistration,s.date);assert.equal(farm.fillSecondTeamVacancies(s,[0]),false);
});
test('zero, one or two first-team players promote the best same-position third/developmental player',()=>{
 for(const count of [0,1,2]){
  const {s,add}=depth();for(let i=0;i<count;i++)add(`first${i}`,0,'C',30+i);
  const third=add('third',20,'C',65),dev=add('dev',30,'C',80,true);add('other-position',20,'SS',99);add('other-club',21,'C',99);
  farm.fillSecondTeamVacancies(s,[0]);assert.equal(dev.teamId,10);assert.equal(dev.proContract.status,'developmental');assert.equal(third.teamId,20);
  assert.equal(s.players.filter(p=>p.teamId===0&&p.position==='C').length,count);
 }
});
test('actual second-team registration blocks emergency moves, and a candidate shortage never steals the last first-team player',()=>{
 const {s,add}=depth();add('first',0,'SS',90);add('reserve',20,'SS',80);add('second',10,'SS',20);
 assert.equal(farm.fillSecondTeamVacancies(s,[0]),false);
 const other=depth();const only=other.add('only',0,'CP',80);assert.equal(farm.fillSecondTeamVacancies(other.s,[0]),false);assert.equal(only.teamId,0);
});
test('forced farm coverage survives guarantee restoration and normalization without deleting the contract promise',()=>{
 const {s,add}=depth();const weak=add('weak',0,'SS',30);add('mid',0,'SS',50);add('best',0,'SS',70);
 weak.professional.contract.faTerms={plan:'starter',title:'주전',description:'보장',position:'SS',startingLevel:'first',starterGuaranteed:true};
 weak.professional.contract.endYear=s.calendar.seasonYear+3;
 farm.fillSecondTeamVacancies(s,[0]);assert.equal(weak.teamId,10);s.date=e.addDays(s.date,15);
 squads.restoreGuaranteedSquads(s);squads.normalizeFirstTeamRoster(s,0);assert.equal(weak.teamId,10);assert(weak.professional.contract.faTerms.starterGuaranteed);
 add('backup',10,'SS',40);farm.fillSecondTeamVacancies(s,[0]);assert.equal(weak.professional.farmVacancyPosition,undefined);
});
test('a full farm roster swaps out a duplicate without creating another vacancy or exceeding 30',()=>{
 const {s,add}=depth();for(let i=0;i<30;i++)add(`catcher${i}`,10,'C',20+i);
 const promoted=add('reserve',30,'SS',80,true);farm.fillSecondTeamVacancies(s,[0]);assert.equal(promoted.teamId,10);assert.equal(s.players.filter(p=>p.teamId===10).length,30);assert.equal(s.players.find(p=>p.id==='catcher0').teamId,20);
});
test('repairs do not run in the middle of a game or after season settlement',()=>{
 const {s,add}=depth(),p=add('reserve',20,'SS',80);s.matchProgress={gameId:'active'};assert.equal(farm.fillSecondTeamVacancies(s,[0]),false);assert.equal(p.teamId,20);
 delete s.matchProgress;s.proWorld.stage='summary';assert.equal(farm.fillSecondTeamVacancies(s,[0]),false);
});
