import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const {retiredNumberLogos,retiredNumberImage,clubRetiredNumbers}=require('../.test-build/lib/hall-of-fame.js');
const {RetiredNumberGallery}=require('../.test-build/app/components/hall-of-fame.js');
const {retiredNumberClaims}=require('../.test-build/lib/retired-number-reservations.js');
test('every supplied club SVG retains its design and embedded font while displaying the saved number',()=>{
  assert.equal(retiredNumberLogos.length,10);
  for(const logo of retiredNumberLogos){
    const source=readFileSync(new URL(`../svg/${logo}.svg`,import.meta.url),'utf8');
    assert.equal(readFileSync(new URL(`../public/hall-of-fame/${logo}.svg`,import.meta.url),'utf8'),source);
    for(const number of [1,7,10,47,99]){
      const image=decodeURIComponent(retiredNumberImage(source,number).split(',').slice(1).join(','));
      assert.match(image,new RegExp(`data-role="number"[^>]*>${number}</text>`));
      assert.equal(image.replace(/(<text\b[^>]*data-role="number"[^>]*>)[\s\S]*?(<\/text>)/,'$1NUMBER$2'),source.replace(/(<text\b[^>]*data-role="number"[^>]*>)[\s\S]*?(<\/text>)/,'$1NUMBER$2'));
    }
  }
  for(const invalid of [0,100,1.5,NaN])assert.throws(()=>retiredNumberImage('',invalid));
});
test('only the saved retired player contributes honors, never NPCs or other careers reserved in the same save',()=>{
  const state={seed:'a',playerId:'own',proWorld:{stage:'regular',retiredNumbers:[{playerId:'own',playerName:'본인',club:1,number:7},{playerId:'npc',playerName:'다른선수',club:1,number:9}]},savedRetiredNumbers:[{playerId:'other',club:1,number:10}]};
  assert.deepEqual(retiredNumberClaims(state),[]);state.proWorld.stage='retired';
  const entries=retiredNumberClaims(state);assert.equal(entries.length,1);assert.equal(entries[0].number,7);assert.equal(entries[0].playerId,'own');
});
test('club galleries filter across saves, deduplicate a career, sort jersey numbers, and retain names safely',()=>{
  const entries=[{saveId:'b',playerId:'b',playerName:'두번째',club:1,number:45},{saveId:'a',playerId:'a',playerName:'<송지온>',club:1,number:7},{saveId:'c',playerId:'c',playerName:'다른구단',club:0,number:1}];
  assert.deepEqual(clubRetiredNumbers([...entries,entries[0]],1).map(row=>row.number),[7,45]);
  const template=readFileSync(new URL('../svg/twins.svg',import.meta.url),'utf8');
  const html=renderToStaticMarkup(createElement(RetiredNumberGallery,{entries,club:1,template}));
  assert.ok(html.includes('서울 트윈스 영구결번'));assert.ok(html.includes('&lt;송지온&gt;'));assert.ok(!html.includes('다른구단'));assert.ok(html.includes('영구결번 7번'));
  const empty=renderToStaticMarkup(createElement(RetiredNumberGallery,{entries,club:9,template:''}));assert.ok(empty.includes('아직 영구결번으로 남은 선수가 없습니다.'));
});
