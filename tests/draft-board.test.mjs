import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const {DraftForecast,DraftRoundTable}=require('../.test-build/app/components/draft-board.js');
const state=e.createGame('draft-ui','표검증','SS');
const render=props=>renderToStaticMarkup(createElement(DraftRoundTable,{year:2029,onSelect(){},playerId:'mine',...props}));

test('school draft results display old middle-relief and closer picks as bullpen without rewriting saved roles',()=>{
 const sample=e.draftForecast(state)[0];
 for(const role of ['중간계투','마무리']){const pick={...sample,role},before=structuredClone(pick),html=render({picks:[pick]});assert.match(html,/<em>불펜<\/em>/);assert.ok(!html.includes(`<em>${role}</em>`));assert.deepEqual(pick,before);}
 assert.match(render({picks:[{...sample,role:'선발'}]}),/<em>선발<\/em>/);
});

test('forecast displays this season senior top ten instead of the OVR top ten',()=>{
  const html=renderToStaticMarkup(createElement(DraftForecast,{state}));
  assert.match(html,/2027년 예상 드래프트 TOP10/);assert.match(html,/평판 80%/);assert.ok(!html.includes('OVR TOP10'));
  for(const pick of e.draftForecast(state)){assert.ok(html.includes(pick.playerName));assert.ok(html.includes(pick.club));}
});

test('round table retains ten club columns, the thirteenth round and empty ended cells without fabricating picks',()=>{
  const sample=e.draftForecast(state)[0];
  const picks=[{...sample,playerId:'mine',overall:1,round:1,slot:1},{...sample,club:e.draftClubs.find(club=>club!==sample.club),playerId:'later',overall:110,round:13,slot:7}];
  const html=render({picks});
  assert.equal((html.match(/scope="col"/g)||[]).length,11);assert.equal((html.match(/scope="row"/g)||[]).length,13);
  assert.equal((html.match(/지명 평가 보기/g)||[]).length,2);assert.equal((html.match(/class="draft-cell-ended"/g)||[]).length,128);
  assert.match(html,/13라운드/);assert.match(html,/draft-cell-my/);assert.match(html,/총 <b>2명 지명/);
  for(const club of e.draftClubs)assert.ok(html.includes(club));
});

test('round table displays at least ten rounds and safely displays older full-round results',()=>{
  const sample=e.draftForecast(state)[0],pick={...sample,overall:92};delete pick.round;delete pick.slot;
  const html=render({picks:[pick]});assert.equal((html.match(/scope="row"/g)||[]).length,10);
  assert.match(html,/10라운드 2순번, 전체 92순위/);assert.match(html,/지명 종료/);
});

test('round headers follow the saved random club order and stay aligned with pick buttons',()=>{
  const sample=e.draftForecast(state)[0],order=[...e.draftClubs].reverse(),picks=order.map((club,index)=>({...sample,club,playerId:`random-${index}`,overall:index+1,round:1,slot:index+1}));
  const html=render({picks});
  for(const [index,club]of order.entries()){
    assert.ok(html.includes(`<strong>${index+1}</strong><span>${club}</span>`));
    assert.ok(html.includes(`${club} 1라운드 ${index+1}순번, 전체 ${index+1}순위`));
  }
  assert.equal(html,render({picks:JSON.parse(JSON.stringify(picks))}));
  const legacy=e.draftClubs.map((club,index)=>({...sample,club,playerId:`legacy-${index}`,overall:index+1,round:1,slot:index+1}));
  const old=render({picks:legacy});for(const [index,club]of e.draftClubs.entries())assert.ok(old.includes(`<strong>${index+1}</strong><span>${club}</span>`));
});
