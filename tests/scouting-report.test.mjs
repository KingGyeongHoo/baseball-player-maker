import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),scout=require('../.test-build/lib/sim/scouting-report.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const {encodeCareerSave,decodeCareerSave}=require('../.test-build/lib/career-save.js');
const Continuation=require('../.test-build/app/components/career-continuation.js').default;
const {ScoutingReportContent}=require('../.test-build/app/components/scouting-report.js');
const template=e.createGame('scouting-report-tests','도구검증','SS');
function fixture(){const s=structuredClone(template),p=e.getPlayer(s);p.grade=3;p.reputation=95;p.talent={batting:9,pitching:9};for(const k of Object.keys(p.stats))p.stats[k]=50;Object.assign(p.stats,{power:95,speed:90,contact:55,defense:40});const others=s.players.filter(q=>q.id!==p.id).slice(0,20);for(const q of others){q.grade=3;q.primaryRole='센터라인';q.position='SS';q.eligiblePositions=['SS','2B','CF','DH'];for(const k of Object.keys(q.stats))q.stats[k]=50;}s.players=[p,...others];s.phase='ended';s.date=s.calendar.draftDate;s.draftOutcome={revealed:true,offer:null};return s;}
function pick(p,role='코너 야수'){return {playerId:p.id,playerName:p.name,teamName:'검증고',club:e.draftClubs[0],overall:1,round:1,slot:1,role,score:90,ability:70,abilityRank:1,reputation:95,talent:9,fit:75,components:{reputation:76,talent:9,fit:5}};}

test('power and speed scouting language is supported by saved tools and eligible-cohort ranks',()=>{
  const s=fixture(),p=e.getPlayer(s),r=scout.createScoutingReport(pick(p),2027,{stats:p.stats,records:p.seasonStats},s.players,80);
  assert.deepEqual(r.tools.map(t=>t.stat),['power','speed']);assert.equal(r.tools[0].title,'강력한 파워 툴');assert.equal(r.tools[1].title,'빠른 발');assert.equal(r.tools[0].rank,1);assert.equal(r.tools[0].poolSize,21);assert.ok(r.reasons.some(x=>x.title==='구단의 보직 보강 수요'));assert.ok(r.reasons.some(x=>x.title==='높은 평판'));
});
test('pitching reports use pitching tools rather than a stronger unrelated batting skill',()=>{
  const s=fixture(),p=e.getPlayer(s);p.primaryRole='선발';Object.assign(p.stats,{power:100,speed:100,velocity:92,control:85,movement:55,stamina:60});const r=scout.createScoutingReport(pick(p,'선발'),2027,{stats:p.stats,records:p.seasonStats});assert.deepEqual(r.tools.map(t=>t.stat),['velocity','control']);assert.ok(!JSON.stringify(r.tools).includes('파워 툴'));
});
test('modest abilities are not described as elite tools and absent records do not become invented achievements',()=>{
  const s=fixture(),p=e.getPlayer(s);for(const k of Object.keys(p.stats))p.stats[k]=30;const r=scout.createScoutingReport(pick(p),2027,{stats:p.stats,records:p.seasonStats});assert.ok(r.tools.every(t=>t.title.includes('성장 기반')));assert.ok(!JSON.stringify(r).includes('강력한'));assert.ok(!r.reasons.some(x=>x.title.includes('경험')));
});
test('report creation is deterministic and does not mutate players, records or live RNG',()=>{
  const s=fixture(),p=e.getPlayer(s),before=structuredClone(s),d=pick(p);const a=scout.createScoutingReport(d,2027,{stats:p.stats,records:p.seasonStats},s.players,70),b=scout.createScoutingReport(d,2027,{stats:p.stats,records:p.seasonStats},s.players,70);assert.deepEqual(a,b);assert.deepEqual(s,before);p.stats.power=1;p.seasonStats.batting.HR=99;assert.equal(a.statsSnapshot.power,95);assert.equal(a.recordsSnapshot.batting.HR,0);
});
test('actual draft picks and forecasts carry matching immutable reports without forecast writes',()=>{
  const s=fixture(),before=structuredClone(s),forecast=e.draftForecast(s);assert.deepEqual(s,before);const actual=e.draftPlayers(s);assert.deepEqual(forecast,actual.slice(0,10));assert.ok(actual.every(d=>d.scoutingReport.year===2027&&d.scoutingReport.source==='draft'));assert.deepEqual(s.players,before.players);assert.ok(actual.every(d=>d.scoutingReport.statsSnapshot));
});
test('stored reports survive pro entry, later skill changes and save round trips',()=>{
  const s=fixture();s.draft=e.draftPlayers(s);const d=s.draft.find(d=>d.playerId===s.playerId),original=structuredClone(d.scoutingReport);const n=pc.acknowledgeCareer(pc.continueCareer(s,'join'));e.getPlayer(n).stats.power=1;assert.deepEqual(scout.scoutingReportFor(n,n.draft.find(d=>d.playerId===n.playerId)),original);const restored=decodeCareerSave(JSON.stringify(encodeCareerSave(n))).state;assert.deepEqual(restored.draft.find(d=>d.playerId===n.playerId).scoutingReport,original);
});
test('legacy pro results use archived draft-year skills and never substitute current pro skills',()=>{
  const s=fixture(),p=e.getPlayer(s),d=pick(p);s.draft=[d];s.careerMode='pro';s.phase='weekStart';s.calendar.seasonYear=2030;s.postSchool={graduationYear:2027,graduationSchool:'검증고',collegeYears:0,tryouts:[]};p.stats.power=100;p.career=[];assert.equal(scout.scoutingReportFor(s,d).source,'evaluation');assert.equal(scout.scoutingReportFor(s,d).tools.length,0);
  const old={...p.stats,power:45,speed:40,contact:43,defense:41};p.career=[{year:2027,grade:3,records:e.emptyRecord(),stats:old}];const before=structuredClone(s),r=scout.scoutingReportFor(s,d);assert.equal(r.source,'archive');assert.equal(r.statsSnapshot.power,45);assert.ok(r.tools.every(t=>t.value<50));assert.deepEqual(s,before);
});
test('the report button is beside the revealed drafted result and absent before reveal or when undrafted',()=>{
  const s=fixture();s.draft=[pick(e.getPlayer(s))];const render=state=>renderToStaticMarkup(createElement(Continuation,{state,onChange(){},onRetire(){}}));assert.match(render(s),/전체 1순위 지명/);assert.match(render(s),/스카우팅 리포트/);assert.ok(!render({...s,draftOutcome:{revealed:false,offer:null}}).includes('스카우팅 리포트'));assert.ok(!render({...s,draft:[]}).includes('스카우팅 리포트'));
  const r=scout.createScoutingReport(s.draft[0],2027,{stats:e.getPlayer(s).stats});s.draft[0].scoutingReport=r;const html=renderToStaticMarkup(createElement(ScoutingReportContent,{state:s,pick:s.draft[0]}));assert.match(html,/강력한 파워 툴/);assert.match(html,/빠른 발/);assert.match(html,/지명을 뒷받침한 평가/);
});
