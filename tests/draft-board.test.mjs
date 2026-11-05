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

test('forecast displays this season senior top ten instead of the OVR top ten',()=>{
  const html=renderToStaticMarkup(createElement(DraftForecast,{state}));
  assert.match(html,/2027년 예상 드래프트 TOP10/);assert.match(html,/평판 80%/);assert.ok(!html.includes('OVR TOP10'));
  for(const pick of e.draftForecast(state)){assert.ok(html.includes(pick.playerName));assert.ok(html.includes(pick.club));}
});

test('round table retains ten club columns, the thirteenth round and empty ended cells without fabricating picks',()=>{
  const sample=e.draftForecast(state)[0];
  const picks=[{...sample,playerId:'mine',overall:1,round:1,slot:1},{...sample,playerId:'later',overall:110,round:13,slot:7}];
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
