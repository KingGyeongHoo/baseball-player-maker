import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),fixture=require('./helpers/allstar-layout.cjs');
const Dialog=require('../.test-build/app/components/career-event-dialog.js').default;
const oldDescription='BLUE 1 : 3 WHITE · 송지온 3타수 0안타 0홈런 / 0.0이닝 0탈삼진. 정규 성적과 분리해 이 무대를 커리어에 남겼다.';
function render(state,level='first'){
  const event={id:'result',definitionId:`AS-RESULT-${level}`,date:state.date,title:'올스타의 하루를 마쳤다',description:oldDescription,choices:[{id:'remember',label:'함께한 무대를 기억한다',outcomes:[]},{id:'review',label:'교류하며 배운 기술을 짧게 복습한다',outcomes:[]}]};
  return renderToStaticMarkup(createElement(Dialog,{state,event,outcome:null,disabled:false,onChoose(){return true;},onDone(){}}));
}
test('allstar result modal replaces legacy prose with the shared scoreboard and Mr All-Star card',()=>{
  const s=fixture(),before=structuredClone(s),html=render(s);
  assert.match(html,/allstar-result-modal/);assert.match(html,/aria-label="BLUE 1 대 3 WHITE"/);assert.ok(html.includes('일군백1'));
  assert.ok(html.indexOf('allstar-scoreboard')<html.indexOf('미스터 올스타'));
  assert.ok(!html.includes('송지온 3타수'));assert.ok(!html.includes('정규 성적과 분리'));assert.ok(!html.includes('0.0이닝 0탈삼진'));
  assert.ok(!html.includes('함께한 무대를 기억한다'));assert.ok(!html.includes('짧게 복습한다'));assert.equal((html.match(/<button/g)??[]).length,1);assert.match(html,/>확인<\/b>/);assert.deepEqual(s,before);
});
test('farm result modal and archived result modal use the matching league and year',()=>{
  const s=fixture();assert.match(render(s,'second'),/BLUE 4 대 2 WHITE/);assert.ok(render(s,'second').includes('이군백1'));
  s.proWorld.seasons.push({year:s.calendar.seasonYear,allstar:s.proWorld.allstar});delete s.proWorld.allstar;
  assert.match(render(s),/BLUE 1 대 3 WHITE/);
});
test('a saved pending allstar outcome also shows results directly with one confirmation',()=>{
  const s=fixture(),outcome={definitionId:'AS-RESULT-first',date:s.date,title:'올스타의 하루',choice:'교류하며 복습',message:'기존 결과 설명'};
  const html=renderToStaticMarkup(createElement(Dialog,{state:s,event:null,outcome,disabled:false,onChoose(){return true;},onDone(){}}));
  assert.match(html,/BLUE 1 대 3 WHITE/);assert.ok(!html.includes('기존 결과 설명'));assert.ok(!html.includes('선택의 결과'));assert.equal((html.match(/<button/g)??[]).length,1);
});
