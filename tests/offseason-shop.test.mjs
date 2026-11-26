import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const shop=require('../.test-build/lib/sim/offseason-shop.js');
const selection=require('../.test-build/lib/sim/pro-selection.js');
const lifecycle=require('../.test-build/lib/sim/evaluation-lifecycle.js');
const life=require('../.test-build/lib/sim/pro-season.js');
const save=require('../.test-build/lib/career-save.js');
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('training-diary','일지검증','C'));
function fixture(){
  const s=structuredClone(template),p=e.getPlayer(s);
  p.professional.earnings=500_000_000;p.proContract.status='regular';
  p.career=[];p.recentAppearances=[];p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};
  p.professional.eventSelectionBonus=0;delete p.professional.wildcardDeclines;
  for(const key of Object.keys(p.stats))p.stats[key]=80;
  return {s,p};
}
function skills(p,value){for(const key of Object.keys(p.stats))p.stats[key]=value;}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('diary costs 10,000만원 and halves a five-point loss without changing skills or records',()=>{
  const {s,p}=fixture(),before=structuredClone(p);
  shop.buyShopItems(s,p,{trainingDiary:1});
  assert.equal(shop.offseasonBalance(p),400_000_000);
  assert.equal(p.offseasonShop.spent,100_000_000);
  near(e.selectionScore(p),80);
  p.professional.eventSelectionBonus=-5;
  near(selection.rawProSelectionScore(p),75);near(e.selectionScore(p),77.5);
  assert.deepEqual(p.stats,before.stats);assert.deepEqual(p.seasonByLevel,before.seasonByLevel);
  const snapshot=structuredClone(p);
  for(let i=0;i<10;i++)near(e.selectionScore(p),77.5);
  assert.deepEqual(p,snapshot);
});

test('midseason purchase starts at the current score; extra stock does not stack or reset peaks',()=>{
  const {s,p}=fixture();skills(p,70);
  shop.buyShopItems(s,p,{trainingDiary:1});near(e.selectionScore(p),70);
  skills(p,65);near(e.selectionScore(p),67.5);
  shop.buyShopItems(s,p,{trainingDiary:2});near(e.selectionScore(p),67.5);
  assert.equal(p.offseasonShop.items.trainingDiary,3);
  skills(p,80);lifecycle.capturePlayerEvaluations(s);near(e.selectionScore(p),80);
  skills(p,75);near(e.selectionScore(p),77.5);
  lifecycle.capturePlayerEvaluations(s);near(e.selectionScore(p),77.5);
  skills(p,80);lifecycle.capturePlayerEvaluations(s);skills(p,75);near(e.selectionScore(p),77.5);
});

test('diary persists through save/load and applies to each role without mutating score reads',()=>{
  const {s,p}=fixture();shop.buyShopItems(s,p,{trainingDiary:1});skills(p,75);
  const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state,q=e.getPlayer(restored);
  assert.deepEqual(q.offseasonShop,p.offseasonShop);
  for(const role of e.roles)near(e.selectionScore(q,role),77.5);
  q.offseasonShop.trainingDiary.peaks['포수']=Infinity;
  assert.equal(shop.validOffseasonShop(q.offseasonShop,s.calendar.seasonYear),false);
  assert.throws(()=>save.validateCareerState(restored),/상점/);
});

test('settlement consumes one diary and the next season resets its reference without carrying protection',()=>{
  const {s,p}=fixture(),year=p.professional.registration.year;
  shop.buyShopItems(s,p,{trainingDiary:2});skills(p,70);near(e.selectionScore(p),75);
  shop.settleShopItems(p,year);shop.settleShopItems(p,year);
  assert.equal(p.offseasonShop.items.trainingDiary,1);near(e.selectionScore(p),70);
  selection.syncTrainingDiary(p);assert.equal(p.offseasonShop.trainingDiary,undefined);
  p.professional.registration.year=year+1;p.professional.agedYear=year+1;
  selection.syncTrainingDiary(p);near(e.selectionScore(p),70);
  skills(p,65);near(e.selectionScore(p),67.5);
  shop.settleShopItems(p,year+1);assert.equal(p.offseasonShop.items.trainingDiary,undefined);
  near(e.selectionScore(p),65);
});

test('public purchase action is immutable and rejects insufficient funds without partial purchase',()=>{
  const {s,p}=fixture(),before=structuredClone(s);
  const next=life.actOnProCareer(s,{type:'buyOffseasonItems',items:{trainingDiary:1}});
  assert.deepEqual(s,before);assert.ok(e.getPlayer(next).offseasonShop.trainingDiary);
  p.professional.earnings=99_999_999;const poor=structuredClone(s);
  assert.throws(()=>shop.buyShopItems(s,p,{trainingDiary:1}),/자금/);assert.deepEqual(s,poor);
});

test('season performance losses are halved and the public next-season transition establishes a fresh peak',()=>{
  const {s,p}=fixture(),year=s.proWorld.year;
  shop.buyShopItems(s,p,{trainingDiary:2});
  Object.assign(p.seasonByLevel.first.batting,{PA:400,AB:360,H:70,BB:40,HR:3});
  const raw=selection.rawProSelectionScore(p);assert.ok(raw<80);
  near(e.selectionScore(p),80-(80-raw)/2);
  shop.settleShopItems(p,year);s.proWorld.seasonClosed=true;
  p.professional.contract.endYear=year+2;delete s.proWorld.stove;
  life.startNextProSeason(s);
  assert.equal(p.offseasonShop.trainingDiary.year,year+1);
  near(e.selectionScore(p),selection.rawProSelectionScore(p));
  const nextPeak=e.selectionScore(p);p.professional.eventSelectionBonus=-5;
  near(e.selectionScore(p),nextPeak-2.5);
});
