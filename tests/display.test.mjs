import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const {scoreText,changeText}=require('../.test-build/lib/display.js');
const e=require('../.test-build/lib/sim/engine.js');
const Abilities=require('../.test-build/app/components/player-abilities.js').default;

test('score display keeps only the integer part at exact boundaries and never rounds 51.99 to 52',()=>{
  for(const [input,expected] of [[51,'51'],[51.01,'51'],[51.5,'51'],[51.99,'51'],[51.999999,'51'],[52,'52'],[52.01,'52'],[99.99,'99'],[-1.99,'-1'],[-.25,'0'],[null,'—']])assert.equal(scoreText(input),expected);
  assert.equal(changeText(.2),'조금 상승');assert.equal(changeText(-.2),'하락');assert.equal(changeText(1.99),'크게 상승');
});

test('abilities display whole scores while leaving raw fractional state and graphical bar precision intact',()=>{
  const p=e.previewPlayer('whole-scores','정수표시','SS');for(const key of Object.keys(p.stats))p.stats[key]=51.99;
  const original=structuredClone(p);const html=renderToStaticMarkup(createElement(Abilities,{player:p}));
  const text=html.replace(/<[^>]*>/g,' ');assert.ok(!text.includes('51.99'));assert.ok(!text.includes('52'));
  assert.match(html,/<strong>51<\/strong>/);assert.deepEqual(p,original);assert.equal(e.ovr(p,true)>51,true);
});

test('fractional training is retained and the visible score advances only after the real ability crosses 52',()=>{
  const p=e.previewPlayer('fractional-growth','누적','SS');for(const key of Object.keys(p.stats))p.stats[key]=51.99;p.talent={batting:1,pitching:1};
  for(const key of Object.keys(p.trainingPolicy.tickets))p.trainingPolicy.tickets[key]=0;p.trainingPolicy.tickets.physical=1;
  e.train(p,1);assert.equal(scoreText(p.stats.contact),'51');assert.ok(p.stats.contact>51.99);
  for(let day=1;day<4;day++)e.train(p,1);
  assert.equal(scoreText(p.stats.contact),'52');assert.ok(p.stats.contact>52&&p.stats.contact<52.01);
});
