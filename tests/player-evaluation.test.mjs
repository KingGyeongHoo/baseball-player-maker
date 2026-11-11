import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const m=require('../.test-build/lib/sim/evaluation-metrics.js'),r=require('../.test-build/lib/sim/evaluation-reference.js'),a=require('../.test-build/lib/sim/player-evaluation.js'),l=require('../.test-build/lib/sim/evaluation-lifecycle.js');
const {evaluationProjections}=require('../.test-build/lib/sim/evaluation-projection.js'),creation=require('../.test-build/lib/player-creation.js'),save=require('../.test-build/lib/career-save.js');
const {PlayerEvaluationContent}=require('../.test-build/app/components/player-evaluation.js');
e.params['pro_events.enabled']=0;
const schoolBase=e.createGame('evaluation-test-school','평가선수','SS');
const proBase=creation.createRandomProCareer('프로평가','SS',21,{randomUUID:()=> 'evaluation-test-pro',getRandomValues:a=>{a[0]=0;return a;}});
function fixture(pro=false){const s=structuredClone(pro?proBase:schoolBase),mine=e.getPlayer(s);s.players=[mine,...s.players.filter(p=>p.id!==mine.id).slice(0,55)];s.calendar.events=[];s.calendar.competitions=[];delete mine.evaluationHistory;return s;}
const close=(x,y,tolerance=1e-9)=>assert.ok(Math.abs(x-y)<tolerance,`${x} != ${y}`);
function batting(PA,H,HR=0,BB=0){const r=e.emptyRecord();Object.assign(r.batting,{PA,AB:PA-BB,H,HR,BB,SO:Math.floor(PA*.2)});return r;}
function pitching(BF,outs,SO,BB,HR,ER=0){const r=e.emptyRecord();Object.assign(r.pitching,{BF,outs,SO,BB,HR,ER,H:Math.floor(BF*.2)});return r;}
function report(s){return a.createPlayerEvaluation(s,e.getPlayer(s));}

test('rates use PA/BF and integer outs, including 20⅓ innings without a decimal-inning error',()=>{
  const line=pitching(90,61,21,9,2,5),q=m.evaluationRates(line,'pitching');close(q.era,135/61);close(q.k,21/90);close(q.bb,9/90);close(q.kMinusBB,12/90);close(q.whip,(18+9)*3/61);
});
test('unmeasured evidence stays null rather than receiving a fake zero or fifty-point season',()=>{
  const q=m.performanceEvidence(e.emptyRecord(),batting(100,25),'batting',false,true);assert.equal(q.score,null);assert.equal(q.raw.ops,null);assert.equal(q.confidence,'1군 검증 전');
});
test('component smoothing uses event-specific priors and leaves raw records untouched',()=>{
  const line=batting(20,5,1,4),league=batting(1000,240,20,80),before=structuredClone(line),q=m.performanceEvidence(line,league,'batting',true);
  close(q.raw.bb,.2);close(q.adjusted.bb,.11);close(q.adjusted.avg,(5+90*240/920)/(16+90));assert.deepEqual(line,before);assert.notEqual(q.prior.hits,q.prior.events);assert.notEqual(q.prior.extraBases,q.prior.hits);
});
test('ten great plate appearances do not automatically displace a well-evidenced hitter',()=>{
  const league=batting(10000,2400,180,800),tiny=m.performanceEvidence(batting(10,5,1),league,'batting'),large=m.performanceEvidence(batting(500,150,25,50),league,'batting');
  assert.ok(tiny.raw.ops>large.raw.ops);assert.ok(tiny.score<large.score);assert.ok(tiny.reliability<large.reliability);
});
test('multiyear aggregation weights counts, does not mix levels, and skips an empty current year',()=>{
  const s=fixture(true),p=e.getPlayer(s),year=s.calendar.seasonYear;
  p.career=[{year:year-1,grade:0,careerMode:'pro',records:batting(500,150,20,50),stats:{...p.stats},byLevel:{first:batting(500,150,20,50),second:e.emptyRecord()}}];
  const q=a.multiyearEvidence(s,p,'first','batting');assert.equal(q.sample,500);close(q.raw.ops,e.ops(p.career[0].records));assert.equal(a.multiyearEvidence(s,p,'second','batting').score,null);
  p.seasonByLevel.first=batting(10,8,4);const combined=a.multiyearEvidence(s,p,'first','batting');close(combined.sample,(10*.6+500*.3)/.9);assert.ok(combined.raw.ops<e.ops(p.seasonByLevel.first));
});
test('first- and second-team performances retain their own league environments',()=>{
  const s=fixture(true),p=e.getPlayer(s);p.seasonByLevel.first=batting(200,40,4,20);p.seasonByLevel.second=batting(200,70,14,20);
  const q=report(s);assert.notEqual(q.performance.first.batting.raw.ops,q.performance.second.batting.raw.ops);assert.equal(q.records.first.batting.PA,200);assert.equal(q.records.second.batting.PA,200);
});
test('normal-condition tools and expected matchups ignore transient injury and fatigue but retain availability',()=>{
  const s=fixture(true),p=e.getPlayer(s),base=report(s);p.fatigue=99;p.injury={severity:'severe',startDate:s.date,unavailableUntil:e.addDays(s.date,30),originalPenalty:12,penaltyRemaining:12,penaltyRecoverDays:14};
  const hurt=report(s);assert.deepEqual(hurt.tools,base.tools);assert.deepEqual(hurt.model,base.model);assert.equal(hurt.health.available,false);assert.deepEqual(hurt.stats,base.stats);
});
test('promotion changes neither the fixed first-team baseline nor current tool grades',()=>{
  const s=fixture(true),p=e.getPlayer(s),base=report(s);p.teamId%=10;s.postSchool.pro.level='first';
  const promoted=report(s);assert.equal(promoted.referenceId,base.referenceId);assert.deepEqual(promoted.tools,base.tools);assert.deepEqual(promoted.model,base.model);
});
test('the reference survives in-season roster changes and small or flat groups use an explicit fallback',()=>{
  const s=fixture(true),fixed=structuredClone(r.evaluationReference(s));for(const p of s.players)for(const k of Object.keys(p.stats))p.stats[k]=100;assert.deepEqual(r.evaluationReference(s),fixed);
  delete s.evaluationSystem;const small=r.makeEvaluationReference(s);assert.ok(Object.values(small.tools).every(t=>Number.isFinite(t.sd)&&t.sd>0));assert.ok(Object.values(small.tools).some(t=>t.fallback));
});
test('20–80 display uses five-point steps while keeping an unrounded internal comparison value',()=>{
  const ref={mean:65,sd:8};assert.equal(r.gradeTool(73,ref).grade,60);assert.equal(r.gradeTool(57,ref).grade,40);assert.equal(r.gradeTool(100,ref).grade,80);assert.equal(r.gradeTool(1,ref).grade,20);assert.notEqual(r.gradeTool(65.1,ref).continuous,50);
});
test('100 PA and 30 IP boundaries never discard second-team information or cause a score jump',()=>{
  const league=batting(10000,2500,200,800),left=m.performanceEvidence(batting(99,28,4,10),league,'batting'),right=m.performanceEvidence(batting(100,28,4,10),league,'batting');assert.ok(Math.abs(left.score-right.score)<1);
  const s=fixture(true),p=e.getPlayer(s);p.seasonByLevel.first=batting(99,28,4,10);p.seasonByLevel.second=batting(200,70,10,20);const before=report(s);p.seasonByLevel.first.batting.PA++;p.seasonByLevel.first.batting.AB++;assert.deepEqual(report(s).performance.second,before.performance.second);
});
test('hidden talent and private aging offsets do not leak into current reports or projections',()=>{
  for(const pro of [false,true]){const s=fixture(pro),p=e.getPlayer(s);p.talentExposure={batting:0,pitching:0};p.talent={batting:1,pitching:1};if(p.professional)p.professional.agingOffset=-2;
    const before=report(s),projection=evaluationProjections(before,r.evaluationReference(s).parameters);p.talent={batting:10,pitching:10};if(p.professional)p.professional.agingOffset=2;
    assert.deepEqual(report(s),before);assert.deepEqual(evaluationProjections(report(s),r.evaluationReference(s).parameters),projection);
  }
});
test('growth horizons use graduation/pro-third-year and next-season/three-year targets with ordered scenarios',()=>{
  for(const pro of [false,true]){const s=fixture(pro),q=report(s),out=evaluationProjections(q,r.evaluationReference(s).parameters);assert.equal(out.length,2);assert.ok(out[0].label.includes(pro?'다음 시즌':'졸업'));
    for(const row of out)for(const field of ['batting','pitching'])assert.ok(row.fields[field].low<=row.fields[field].base&&row.fields[field].base<=row.fields[field].high);
  }
});
test('veterans may decline and developmental status affects growth rather than current tools',()=>{
  const s=fixture(true),p=e.getPlayer(s);p.age=40;for(const k of Object.keys(p.stats))p.stats[k]=85;const veteran=report(s),future=evaluationProjections(veteran,r.evaluationReference(s).parameters);assert.ok(future[1].fields.pitching.base<85);
  p.age=19;p.proContract.status='developmental';const dev=report(s),growth=evaluationProjections(dev,r.evaluationReference(s).parameters);assert.ok(growth[0].registeredBase.batting>=growth[0].fields.batting.base);p.proContract.status='regular';assert.deepEqual(report(s).tools,dev.tools);
  p.professional.employment='freeAgent';p.professional.unattachedYears=1;p.teamId=-1;assert.equal(evaluationProjections(report(s),r.evaluationReference(s).parameters).length,0);
});
test('two-way fields retain independent samples and role recommendations grant no eligibility',()=>{
  const s=fixture(true),p=e.getPlayer(s),before=[...p.eligiblePositions];p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};p.seasonByLevel.first=batting(300,90,10,30);p.seasonByLevel.first.pitching={...pitching(30,18,8,3,1).pitching};
  const q=report(s);assert.equal(q.performance.first.batting.confidence,'시즌 내 근거 축적');assert.equal(q.performance.first.pitching.confidence,'제한된 표본');assert.deepEqual(p.eligiblePositions,before);assert.ok(q.roles.every(row=>before.some(pos=>e.roleFor(pos)===row.role)));
});
test('same-grade ranks never call a freshman a current-year draft candidate',()=>{
  const s=fixture(),p=e.getPlayer(s);p.grade=1;const q=report(s);assert.equal(q.graduationYear,s.calendar.seasonYear+2);assert.equal(q.comparison.draftScore,null);assert.ok(e.draftBoard(s.players).every(p=>p.grade===3));assert.ok(q.tools.find(t=>t.stat==='contact').cohortSize>0);
  assert.ok(q.tools.filter(t=>t.cohortRank!==undefined).every(t=>t.cohortRank<=t.cohortSize));assert.equal(q.tools.find(t=>t.stat==='velocity').cohortRank,undefined);
  const pro=fixture(true),graduate=e.previewPlayer('next-rookie-class','Graduate','SP');graduate.grade=3;pro.players=[graduate];pro.calendar.seasonYear=2029;pro.date='2028-11-01';const pick=e.draftForecast(pro)[0],evaluation=pick.scoutingReport.evaluation;assert.equal(pick.scoutingReport.year,2029);assert.equal(evaluation.season,2028);assert.equal(evaluation.graduationYear,2028);assert.ok(evaluationProjections(evaluation,pick.scoutingReport.evaluationParameters).every(row=>row.target>=evaluation.date));
});
test('report reading is pure and deterministic, with no changes to random streams or current decisions',()=>{
  const s=fixture(),before=structuredClone(s),p=e.getPlayer(s),one=report(s),two=report(s);assert.deepEqual(one,two);assert.deepEqual(s,before);assert.equal(e.selectionScore(p),one.comparison.legacyRegistration);
});

test('pro scouting and roster share live selection while old experimental comparison scores stay off screen',()=>{
  const s=fixture(true),p=e.getPlayer(s),roster=require('../.test-build/lib/roster-records.js');
  for(const key of Object.keys(p.stats))p.stats[key]=76;p.fatigue=0;p.recentZ=1;p.proContract.status='regular';delete p.professional.managedUntil;
  const first=report(s);p.fatigue=95;const tired=report(s);
  assert.equal(first.comparison.legacyRegistration,76);assert.equal(tired.comparison.legacyRegistration,76);assert.equal(roster.rosterGradeScore(p),76);
  assert.equal(tired.comparison.candidateRegistration,first.comparison.candidateRegistration);
  const html=renderToStaticMarkup(createElement(PlayerEvaluationContent,{report:tired}));
  assert.match(html,/평가 당시 출전평가 76/);assert.doesNotMatch(html,/현행 계약 평가|1군 표본 분리 비교값|평판 평가|보직 적합도|1군 툴|20~80/);
  assert.equal(tired.reputation,undefined);assert.equal(tired.comparison.legacyContract,null);assert.equal(tired.comparison.candidateRegistration,null);
});
test('monthly capture covers NPCs equally, is idempotent and keeps dated growth without using training exposure as scouting visits',()=>{
  const s=fixture(),p=e.getPlayer(s),rng={...s.rngStates};s.date='2027-04-01';l.capturePlayerEvaluations(s);assert.ok(s.players.every(p=>p.evaluationHistory.some(r=>r.date===s.date)));
  const n=p.evaluationHistory.length;l.capturePlayerEvaluations(s);assert.equal(p.evaluationHistory.length,n);s.date='2027-05-01';p.stats.contact++;l.capturePlayerEvaluations(s);const q=a.playerEvaluationFor(s,p);assert.ok(q.growth.changes.contact>0);assert.deepEqual(s.rngStates,rng);
  p.teamId=1;l.capturePendingEvaluationChanges(s);assert.equal(p.evaluationHistory.at(-1).reason,'team-change');assert.equal(a.playerEvaluationFor(s,p).teamId,1);
  p.position='CF';l.capturePendingEvaluationChanges(s);assert.equal(p.evaluationHistory.at(-1).reason,'role-change');
});
test('archived evaluations survive later growth, transfers, role changes and changes to current model parameters',()=>{
  const s=fixture(true),p=e.getPlayer(s);l.capturePlayerEvaluations(s,'introduced');const original=a.playerEvaluationFor(s,p),obs=p.evaluationHistory.at(-1),originalConfig=e.params['match.hit_base'];
  p.stats.contact=100;p.stats.power=1;p.position='C';p.primaryRole='포수';p.teamId=-1;p.age=40;p.reputation=100;s.date=e.addDays(s.date,50);
  try{e.params['match.hit_base']=.99;assert.deepEqual(a.restoreEvaluation(s,p,obs),original);}finally{e.params['match.hit_base']=originalConfig;}
});
test('save round trips keep reference contexts and old draft reports; a legacy read creates only a present-day assessment',()=>{
  const s=fixture(true),p=e.getPlayer(s);l.capturePlayerEvaluations(s,'introduced');const before=a.playerEvaluationFor(s,p),restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.deepEqual(a.playerEvaluationFor(restored,e.getPlayer(restored)),before);
  delete s.evaluationSystem;for(const q of s.players)delete q.evaluationHistory;s.date='2028-06-01';const legacy=a.playerEvaluationFor(s,p);assert.equal(legacy.date,s.date);assert.equal(legacy.reason,'introduced');assert.equal(p.evaluationHistory,undefined);
});
test('packed records use canonical field order even when imported JSON properties were reordered',()=>{
  const line=batting(100,30,5,10);line.batting=Object.fromEntries(Object.entries(line.batting).reverse());assert.deepEqual(a.unpackEvaluationRecord(a.packEvaluationRecord(line)),line);
});
test('forfeits create no playing evidence and opponent strength is captured only for new games',()=>{
  const s=fixture(),p=e.getPlayer(s),game={id:'forfeit',date:s.date,status:'forfeit',homeTeamId:p.teamId,awayTeamId:1,competitionId:'practice',rulesetId:'hs',score:[0,0],innings:[[],[]],lineup:[],boxScore:{[p.id]:batting(10,10)}};s.calendar.events=[game];assert.equal(report(s).evidence.games,0);assert.equal(game.evaluationEnvironment,undefined);
  const rosters=s.teams.map(t=>s.players.filter(p=>p.teamId===t.id));l.recordEvaluationEnvironment(s,game,rosters);const saved=structuredClone(game.evaluationEnvironment);p.stats.contact=100;l.recordEvaluationEnvironment(s,game,rosters);assert.deepEqual(game.evaluationEnvironment,saved);
});
test('availability counts each observed day once and never invents medical history before tracking began',()=>{
  const s=fixture(true),p=e.getPlayer(s);l.recordEvaluationDay(s);l.recordEvaluationDay(s);assert.equal(p.evaluationAvailability.days,1);assert.equal(p.evaluationAvailability.from,s.date);s.date=e.addDays(s.date,1);l.recordEvaluationDay(s);assert.equal(p.evaluationAvailability.days,2);
});
test('direct professional starts carry no fictitious high-school evaluation history',()=>{
  assert.ok(e.getPlayer(proBase).evaluationHistory.every(r=>r.mode==='pro'));assert.equal(e.getPlayer(proBase).career.length,0);
  const demo=require('../.test-build/lib/sim/pro-career.js').createProfessionalDemo('evaluation-demo','Demo','SS');assert.ok(e.getPlayer(demo).evaluationHistory.every(r=>r.mode==='pro'||r.grade===3));
});
test('the UI separates levels, raw/corrected evidence, model forecasts and conditional growth without invented telemetry',()=>{
  const s=fixture(true),q=report(s),html=renderToStaticMarkup(createElement(PlayerEvaluationContent,{report:q,parameters:r.evaluationReference(s).parameters}));
  for(const text of ['1군 정규 시즌','2군 정규 시즌','미측정','고정된 1군 상대','조건부 성장 전망','판정 비교'])assert.ok(html.includes(text),text);
  assert.match(html,/WAR는 시즌 결산·계약의 성과 평가에 사용/);
  for(const text of ['xwOBA','GB%','회전수 2','km/h'])assert.ok(!html.includes(text),text);
});
