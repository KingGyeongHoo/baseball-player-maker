import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const {createTrainingFocus,tryTrainingFocus}=require('../.test-build/lib/sim/training-focus.js');
const Dialog=require('../.test-build/app/components/career-event.js').default;
const base=e.createGame('training-focus','집중훈련','SS');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(pitching=false){const s=structuredClone(base),p=e.getPlayer(s);if(pitching)e.assignRole(p,'선발');for(const k of Object.keys(p.stats))p.stats[k]=40;p.talent={batting:1,pitching:1};s.week=6;s.calendar.events=[];s.calendar.competitions=[];return s;}
function rolls(s,predicate){for(let seed=0;seed<100000;seed++){const probe={rngStates:{...s.rngStates,events:seed}},first=e.random(probe,'events'),second=e.random(probe,'events');if(predicate(first,second)){s.rngStates.events=seed;return;}}assert.fail('roll');}
function answer(s,id){s.careerEvent=createTrainingFocus(e.getPlayer(s),s.date,s.week);return e.answerCareerEvent(s,id);}
function withParams(changes,fn){const old={};for(const key of Object.keys(changes)){old[key]=e.params[key];e.params[key]=changes[key];}try{return fn();}finally{Object.assign(e.params,old);}}

test('pitchers, batters and accepted two-way players receive their own focus choices plus physical and rest',()=>{
  const s=fixture(),p=e.getPlayer(s);
  assert.deepEqual(createTrainingFocus(p,s.date,6).choices.map(x=>x.id),['contact','power','speed','defense','physical','rest']);
  assert.ok(createTrainingFocus(p,s.date,6).choices.some(x=>x.label.includes('주루')));
  e.assignRole(p,'선발');assert.deepEqual(createTrainingFocus(p,s.date,6).choices.map(x=>x.id),['velocity','control','movement','physical','rest']);
  p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'pitching',reputationBonus:0};assert.equal(createTrainingFocus(p,s.date,6).choices.length,9);
});

test('a focus choice instantly grants exactly five-ticket one-week growth, without advancing dates or granting other stats',()=>{
  for(const pitching of [true,false])for(const key of pitching?['velocity','control','movement']:['contact','power','speed','defense']){
    const s=fixture(pitching),p=e.getPlayer(s),reference=structuredClone(p);rolls(s,(_,second)=>second>=.05);
    reference.trainingPolicy.tickets=Object.fromEntries(Object.keys(reference.trainingPolicy.tickets).map(k=>[k,0]));reference.trainingPolicy.tickets[key]=5;
    for(let d=0;d<5;d++)e.train(reference,1);
    const n=answer(s,key),q=e.getPlayer(n);close(q.stats[key],reference.stats[key]);close(q.stats[key]-p.stats[key],.28);
    for(const other of Object.keys(p.stats).filter(k=>k!==key))assert.equal(q.stats[other],p.stats[other]);
    assert.equal(n.date,s.date);assert.equal(n.week,s.week);assert.deepEqual(q.trainingPolicy,p.trainingPolicy);assert.deepEqual(q.talentExposure,p.talentExposure);
  }
});

test('physical focus splits the five-ticket result across stamina, recovery and arm',()=>{
  const s=fixture(),p=e.getPlayer(s);rolls(s,(_,second)=>second>=.05);const n=answer(s,'physical'),q=e.getPlayer(n);
  for(const key of ['stamina','recovery','arm'])close(q.stats[key]-p.stats[key],.25/3);
  assert.equal(q.stats.contact,p.stats.contact);assert.equal(q.stats.bq,p.stats.bq);
});

test('rest restores ten to twenty percent of current fatigue including endpoints, never stat points or the whole meter',()=>{
  for(const percent of [10,20])for(const fatigue of [0,50,100]){
    const s=fixture(),p=e.getPlayer(s);p.fatigue=fatigue;rolls(s,(_,second)=>10+Math.floor(second*11)===percent);
    const n=answer(s,'rest'),q=e.getPlayer(n);close(q.fatigue,fatigue*(1-percent/100));assert.deepEqual(q.stats,p.stats);
    assert.deepEqual(q.trainingPolicy,p.trainingPolicy);close(n.careerEventHistory.at(-1).fatigue,-fatigue*percent/100);
  }
});

test('one opportunity is rolled per eligible week and scheduled events, inactivity and injury take priority',()=>withParams({'events.weekly_chance':.01,'events.focus_chance':0},()=>{
  const s=fixture(),p=e.getPlayer(s);s.weekProgress={opportunity:{definitionId:'T04',date:s.date}};
  assert.equal(tryTrainingFocus(s),false);assert.equal(s.trainingFocus,undefined);s.weekProgress.opportunity=null;
  p.injury={unavailableUntil:e.addDays(s.date,2)};assert.equal(tryTrainingFocus(s),false);p.injury=null;
  assert.equal(tryTrainingFocus(s),false);const used=s.trainingFocus.rng;e.params['events.focus_chance']=1;assert.equal(tryTrainingFocus(s),false);assert.equal(s.trainingFocus.rng,used);
  s.week++;assert.equal(tryTrainingFocus(s),true);assert.equal(s.careerEvent.definitionId,'S03');
}));

test('choosing rest pauses before practice and skips only that day, preserving the weekly plan and fatigue conservation',()=>withParams({'events.weekly_chance':1e-12,'events.focus_chance':1,'injury.training_base_risk':0},()=>{
  const s=fixture(),p=e.getPlayer(s);p.fatigue=50;const paused=e.advanceWeek(s,p.trainingPolicy,p.stance);
  assert.equal(paused.careerEvent.definitionId,'S03');assert.equal(paused.week,s.week);assert.equal(paused.weekProgress.remainingDays,7);assert.equal(paused.report.fatigue.training,0);
  const reference=structuredClone(p);for(let d=0;d<4;d++)e.train(reference,1);
  const chosen=e.answerCareerEvent(paused,'rest');assert.equal(chosen.weekProgress.day.skipPlayerTraining,true);
  const n=e.advanceWeek(chosen,p.trainingPolicy,p.stance),q=e.getPlayer(n);for(const key of Object.keys(p.stats))close(q.stats[key],reference.stats[key]);
  assert.deepEqual(q.trainingPolicy,p.trainingPolicy);assert.equal(n.careerEventHistory.length,1);assert.equal(n.week,s.week+1);
  const f=n.report.fatigue;close(n.report.fatigueBefore+f.training+f.game-f.recovered+(f.events??0),n.report.fatigueAfter);
  assert.equal(f.days[0].training,0);for(const day of f.days.slice(1))close(day.training-day.recovered,e.trainingLoad(p.stats.recovery,p.trainingPolicy).weeklyDelta/7);
}));

test('results use the five verbal increase levels and decline text, while pre-choice effects stay hidden',()=>{
  const s=fixture();rolls(s,(_,second)=>second>=.05);s.careerEvent=createTrainingFocus(e.getPlayer(s),s.date,s.week);
  const render=(event,outcome)=>renderToStaticMarkup(createElement(Dialog,{event,outcome,disabled:false,onChoose(){},onDone(){}}));
  const before=render(s.careerEvent,null);assert.ok(!/1주|5장|10%|20%/.test(before));
  const n=e.answerCareerEvent(s,'contact'),out=n.careerEventHistory.at(-1),html=render(null,out);assert.match(html,/조금 상승/);assert.ok(!html.includes('+0.28'));
  const r=fixture();e.getPlayer(r).fatigue=50;const rested=answer(r,'rest');assert.match(render(null,rested.careerEventHistory.at(-1)),/하락/);
});
