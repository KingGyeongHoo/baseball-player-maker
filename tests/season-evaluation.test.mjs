import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const a=require('../.test-build/lib/sim/pro-assessment.js');
const w=require('../.test-build/lib/sim/pro-war.js');
const v=require('../.test-build/lib/sim/pro-season-evaluation.js');
const save=require('../.test-build/lib/career-save.js');
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('season-evaluation','평가검증','SS'));
function fixture(){const s=structuredClone(template),p=e.getPlayer(s);p.professional.assessments=[];p.professional.allstarHistory=[];p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};return {s,p};}
function good(){const r=e.emptyRecord();Object.assign(r.batting,{PA:50,AB:40,H:20,HR:5,BB:10,SO:5});return r;}
test('official achievements and postseason stats improve the annual grade without changing regular WAR or RNG',()=>{
  const {s,p}=fixture(),year=s.calendar.seasonYear,context=w.createProWarContext(s),war=w.proWarAssessment(p,context),rng=structuredClone(s.rngStates);
  const before=v.seasonEvaluation(s,p,war,context);
  p.seasonPostseason=good();p.professional.allstarHistory=[{year,level:'first',side:'blue',slot:'SS',method:'vote'}];
  const after=v.seasonEvaluation(s,p,war,context);
  assert.ok(after.postseason>0);assert.equal(after.honors,1);assert.ok(after.score>before.score);assert.equal(war.score,71);assert.deepEqual(s.rngStates,rng);
});
test('late awards refresh the same season and cumulative once; save validation rejects tampered totals',()=>{
  const {s,p}=fixture(),year=s.calendar.seasonYear;
  a.recordSeasonAssessment(s,p);
  s.proWorld.seasons.push({year,standings:[],farmStandings:[],champion:null,draft:[],awards:[{year,kind:'골든글러브',category:'goldGlove',playerId:p.id,playerName:p.name,club:0,value:1}],individualAwards:[{level:'first',field:'batting',metric:'HR',label:'홈런왕',value:40,winners:[{playerId:p.id,playerName:p.name,club:0}]}],awardsCeremony:{version:1,scheduledAt:`${year}-12-06`}});
  v.refreshSeasonEvaluations(s);assert.equal(p.professional.assessments[0].score,71);
  s.proWorld.seasons.at(-1).awardsCeremony.presentedAt=`${year}-12-06`;
  v.refreshSeasonEvaluations(s);const row=p.professional.assessments[0];assert.equal(row.score,74);assert.equal(row.cumulative,74);
  v.refreshSeasonEvaluations(s);assert.equal(row.score,74);assert.equal(p.professional.assessments.length,1);
  const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
  assert.equal(e.getPlayer(restored).professional.assessments[0].score,74);
  row.seasonEvaluation.honors++;assert.throws(()=>save.validateCareerState(s),/WAR/);
});
test('senior national performances count in their own year; legacy forfeits retain participation, declined and youth do not',()=>{
  const {s,p}=fixture(),year=s.calendar.seasonYear,context=w.createProWarContext(s),war=w.proWarAssessment(p,context);
  const entry={year,kind:'wbc',participated:true,tournament:{finished:`${year}-03-20`,countries:[{players:[{id:p.id,sourceId:p.id,position:'SS',records:good()}]}]}};
  s.nationalTeams=[entry];assert.ok(v.seasonEvaluation(s,p,war,context).national>.5);
  entry.tournament.countries[0].players[0].records=e.emptyRecord();assert.equal(v.seasonEvaluation(s,p,war,context).national,.5);
  entry.participated=false;assert.equal(v.seasonEvaluation(s,p,war,context).national,0);
  entry.participated=true;entry.kind='youth';assert.equal(v.seasonEvaluation(s,p,war,context).national,0);
  entry.kind='wbc';entry.year--;assert.equal(v.seasonEvaluation(s,p,war,context).national,0);
});
