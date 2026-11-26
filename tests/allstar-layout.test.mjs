import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),fixture=require('./helpers/allstar-layout.cjs');
const Allstar=require('../.test-build/app/components/pro-allstar.js').default;
const AwardsHub=require('../.test-build/app/components/pro-awards-hub.js').default;
const {careerHonors}=require('../.test-build/lib/career-summary.js');
const render=s=>renderToStaticMarkup(createElement(Allstar,{state:s,onRecords(){}}));

test('awards hub shows last year until April 30 and this year from the first voting day',()=>{
  const a=require('../.test-build/lib/sim/pro-allstar.js'),s=fixture(),previous=s.proWorld.allstar.year,current=previous+1;
  s.proWorld.seasons=[{year:previous,allstar:structuredClone(s.proWorld.allstar)}];
  s.calendar.seasonYear=current;s.proWorld.year=current;delete s.proWorld.allstar;
  s.date=`${current}-04-30`;s.proWorld.allstar=a.allstarSeasonView(s);
  s.proWorld.allstar.levels.first.blue.ballots.SP=[{playerId:'this-year',name:'올해 후보',club:0,slot:'SP',votes:1234,nominated:true}];
  const before=structuredClone(s);
  let html=renderToStaticMarkup(createElement(AwardsHub,{state:s,onRecords(){}}));
  assert.equal(a.defaultAllstarYear(s),previous);assert.match(html,new RegExp(`<h2>${previous} 올스타</h2>`));
  assert.match(html,new RegExp(`<option value="${previous}" selected="">`));assert.match(html,/BLUE 1 대 3 WHITE/);assert.doesNotMatch(html,/올해 후보/);
  assert.deepEqual(s,before);
  for(const date of [`${current}-05-01`,`${current}-05-15`,`${current}-07-20`]){
    s.date=date;html=renderToStaticMarkup(createElement(AwardsHub,{state:s,onRecords(){}}));
    assert.equal(a.defaultAllstarYear(s),current);assert.match(html,new RegExp(`<h2>${current} 올스타</h2>`));
    assert.match(html,new RegExp(`<option value="${current}" selected="">`));assert.match(html,/올해 후보/);assert.match(html,/1,234/);assert.doesNotMatch(html,/BLUE 1 대 3 WHITE/);
    assert.match(html,/allstar-comparison allstar-voting/);assert.match(html,new RegExp(`<option value="${previous}">`));
  }
  assert.deepEqual(s.proWorld.seasons,before.proWorld.seasons);
});

test('voting start switches to the current year even before its first tally, and missing archives stay empty',()=>{
  const a=require('../.test-build/lib/sim/pro-allstar.js'),s=fixture(),previous=s.calendar.seasonYear,current=previous+1;
  s.proWorld.seasons=[{year:previous,allstar:s.proWorld.allstar}];s.calendar.seasonYear=current;delete s.proWorld.allstar;
  s.date=`${current}-05-01`;
  let html=renderToStaticMarkup(createElement(AwardsHub,{state:s,onRecords(){}}));
  assert.match(html,new RegExp(`<h2>${current} 올스타</h2>`));assert.match(html,/BLUE 0 대 0 WHITE/);assert.doesNotMatch(html,/일군백1/);
  s.proWorld.seasons=[];s.date=`${current}-04-30`;
  html=renderToStaticMarkup(createElement(AwardsHub,{state:s,onRecords(){}}));
  assert.equal(a.defaultAllstarYear(s),current);assert.match(html,/5월 1일부터/);assert.match(html,new RegExp(`<h2>${current} 올스타</h2>`));
});
test('allstar has zero scores before the game, two view buttons and a league toggle in the title bar',()=>{
  const s=fixture(false,false),before=structuredClone(s),html=render(s);
  assert.match(html,/aria-label="BLUE 0 대 0 WHITE"/);assert.match(html,/allstar-heading/);assert.match(html,/올스타 리그/);
  for(const label of ['투표 현황','최종 명단','미스터 올스타'])assert.ok(html.includes(label));
  assert.doesNotMatch(html,/올스타 진영|BLUE Team|WHITE Team|정규경기 재개|휴식|경기 결과/);assert.deepEqual(s,before);
});
test('ballots compare both teams by position with three ranks, club names and vote counts',()=>{
  const s=fixture(false,false),html=render(s);
  for(const label of ['일군청1','일군청2','일군청3','일군백1','일군백2','일군백3','3,000','2,500','2,000'])assert.ok(html.includes(label));
  assert.match(html,/allstar-position-label">선발/);assert.equal((html.match(/class="allstar-vote-list"/g)??[]).length,24);
  assert.match(html,/<small>[^<]+<\/small>/);
});
test('completed game score and Mr All-Star appear above the full positional rosters, including multiple starters',()=>{
  const s=fixture(),html=render(s);
  assert.match(html,/aria-label="BLUE 1 대 3 WHITE"/);assert.ok(html.includes('일군백1'));assert.ok(html.includes('4탈삼진'));
  assert.ok(html.indexOf('allstar-scoreboard')<html.indexOf('미스터 올스타'));
  assert.ok(html.indexOf('미스터 올스타')<html.indexOf('allstar-view-tabs'));
  assert.equal((html.match(/class="allstar-final-list"/g)??[]).length,24);assert.ok(html.includes('일군청2'));assert.ok(html.includes('일군백3'));assert.ok(html.includes('투표 선발'));assert.ok(html.includes('감독 추천'));
});
test('April still shows the zero scoreboard and league selector, and missing historical player records leave names readable',()=>{
  const s=fixture(false,false);s.date=`${s.calendar.seasonYear}-04-01`;
  assert.match(render(s),/BLUE 0 대 0 WHITE/);assert.match(render(s),/5월 1일부터/);
  const archive=fixture();archive.players=archive.players.filter(p=>p.id!==archive.proWorld.allstar.levels.first.mvp.playerId);
  assert.ok(render(archive).includes('일군백1'));
});
test('the vote leader is selected across both levels, sides and positions; positive ties share the star',()=>{
  const s=fixture(false,false),first=s.proWorld.allstar.levels.first,second=s.proWorld.allstar.levels.second;
  first.white.ballots.SP[1].votes=9000;
  let html=render(s);assert.match(html,/data-vote-leader="qa-first-white-1"/);assert.doesNotMatch(html,/data-vote-leader="qa-first-blue-0"/);
  second.blue.ballots.SP[2].votes=10000;html=render(s);assert.doesNotMatch(html,/data-vote-leader=/);
  first.white.ballots.SP[1].votes=10000;html=render(s);assert.match(html,/공동 최다 득표/);
  for(const entry of Object.values(s.proWorld.allstar.levels))for(const side of ['blue','white'])for(const rows of Object.values(entry[side].ballots))for(const row of rows)row.votes=0;
  assert.doesNotMatch(render(s),/data-vote-leader=/);
});
test('vote selection uses the blue treatment and ballot positions have separate visual sections',()=>{
  assert.match(render(fixture()),/allstar-selection-method is-vote">투표 선발/);
  assert.match(render(fixture(false,false)),/allstar-comparison allstar-voting/);
});
test('award hub omits the duplicate history footer while career selections and individual Mr All-Star awards remain',()=>{
  const s=fixture(),p=s.players.find(p=>p.id===s.playerId),year=s.calendar.seasonYear;
  p.professional.allstarHistory=[{year,level:'first',side:'blue',slot:'SP',method:'vote',participated:true,mvp:true}];
  const html=renderToStaticMarkup(createElement(AwardsHub,{state:s,onRecords(){}}));
  assert.doesNotMatch(html,/<h2>올스타 기록<\/h2>/);
  const honors=careerHonors(s);assert.equal(honors.allstar.length,1);assert.ok(!honors.allstar.some(row=>row.title.includes('미스터')));assert.equal(honors.individual.filter(row=>row.title==='미스터 올스타').length,1);
  delete p.professional.allstarHistory;s.proWorld.allstar.levels.first.blue.roster=[];s.proWorld.allstar.levels.first.white.roster=[];
  s.proWorld.allstar.levels.first.mvp={playerId:p.id,name:p.name,side:'blue',merit:10};
  assert.ok(careerHonors(s).individual.some(row=>row.title==='미스터 올스타'));
});
