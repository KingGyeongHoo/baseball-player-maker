import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const Badge=require('../.test-build/app/components/draft-round-badge.js').default;
test('national roster predictions cover every projected round, match the draft model and never consume live RNG',()=>{
  const s=e.createGame('roster-draft','예상라운드','SS'),rng={...s.rngStates},forecast=e.draftProjection(s);
  assert.ok(forecast.length>=90&&forecast.length<=110);assert.deepEqual(s.rngStates,rng);assert.deepEqual(s.draft,[]);
  assert.deepEqual(forecast.slice(0,10),e.draftForecast(s));assert.deepEqual(forecast,e.draftPlayers(structuredClone(s)));
  assert.ok(forecast.every(row=>s.players.find(p=>p.id===row.playerId).grade===3));
});
test('round badges select gold, silver, bronze and gray classes, with final picks distinguished from predictions',()=>{
  for(const round of [1,2,3,4,9,13]){
    const html=renderToStaticMarkup(createElement(Badge,{round}));assert.ok(html.includes(`${round}라운더 예상`));assert.ok(html.includes(`round-${Math.min(round,4)}`));assert.ok(!html.includes('주전')&&!html.includes('후보'));
  }
  assert.match(renderToStaticMarkup(createElement(Badge,{round:2,forecast:false})),/2라운더 지명/);
});
