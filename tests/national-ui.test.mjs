import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),View=require('../.test-build/app/components/national-rosters.js').default,Bracket=require('../.test-build/app/components/national-tournament.js').default;
function fixture(){const positions=['CP','RP','SP','DH','RF','CF','LF','SS','3B','2B','1B','C'];const players=positions.map((position,i)=>{const p=e.previewPlayer('ui'+i,position,position);p.id='ui'+i;p.teamId=0;return p;});const entry={kind:'wbc',year:2030,start:'2030-03-01',end:'2030-03-20',roster:players.map(p=>({id:p.id,name:p.name,position:p.position,team:'서울 구단',field:['SP','RP','CP'].includes(p.position)?'pitching':'batting',roleScore:60}))};const countries=[0,1,2,3].map(id=>({id,name:id===0?'대한민국':'상대'+id,players:id?[]:players.map(p=>{const r=e.emptyRecord();Object.assign(r.batting,{PA:19,AB:12,H:4,BB:7});return {id:p.id,name:p.name,position:p.position,stats:p.stats,age:20,fatigue:0,lastPitched:null,sourceId:p.id,records:r};})}));entry.tournament={version:1,countries,games:[],stages:[{id:'opening',name:'조별리그',groups:[[0,1],[2,3]]}],current:0,prepared:[],scenes:[]};return {players,playerId:players[0].id,teams:[{name:'서울 구단'}],nationalTeams:[entry]};}
test('international screen shows only group/knockout controls, one selected group, and Korea roster',()=>{const state=fixture(),html=renderToStaticMarkup(createElement(View,{state,onRecords(){}}));assert.ok(html.includes('대한민국 대표팀'));assert.ok(html.includes('조 선택'));assert.ok(html.includes('토너먼트'));for(const old of ['참가국 명단','개인 기록·수상','일정·결과'])assert.ok(!html.includes(old));assert.ok(html.includes('세이브'));assert.ok(html.indexOf('선발투수')<html.indexOf('중간계투'));assert.ok(html.indexOf('중간계투')<html.indexOf('마무리'));});
test('Korea batting uses AB, not PA, and the requested defensive position order',()=>{const state=fixture(),html=renderToStaticMarkup(createElement(View,{state,onRecords(){},initialField:'batting'}));assert.ok(html.includes('<th>타수</th>'));assert.ok(html.includes('<td>12</td>'));assert.ok(!html.includes('<td>19</td>'));let previous=-1;for(const position of ['포수','1루수','2루수','3루수','유격수','좌익수','중견수','우익수','지명타자']){const index=html.indexOf('<td>'+position+'</td>');assert.ok(index>previous,position);previous=index;}});
test('knockout-only tournaments have no group button or dropdown',()=>{const entry=fixture().nationalTeams[0];entry.tournament.stages=[{id:'final',name:'결승',groups:[[0,1]],knockout:true}];const html=renderToStaticMarkup(createElement(Bracket,{entry}));assert.ok(html.includes('토너먼트'));assert.ok(!html.includes('조 선택'));assert.ok(!html.includes('>조별리그</button>'));});
test('classic bracket separates round headings and reserves a distinct championship card before matchups exist',()=>{
 const entry=fixture().nationalTeams[0],html=renderToStaticMarkup(createElement(Bracket,{entry,initialMode:'knockout'}));assert.ok(html.includes('ROUND 01'));assert.ok(html.includes('ROUND 02'));assert.ok(html.includes('ROUND 03'));assert.ok(html.includes('aria-label="8강"'));assert.ok(html.includes('aria-label="4강 · 준결승"'));assert.ok(html.includes('aria-label="결승전"'));assert.ok(html.includes('medal-gold'));assert.ok(html.includes('진출국 미정'));
});
test('the latest super round shows its standings and actual results, including carried results',()=>{
 const entry=fixture().nationalTeams[0],t=entry.tournament;t.stages.push({id:'second',name:'2차 라운드',groups:[[0,1,2,3]]},{id:'super',name:'슈퍼라운드',groups:[[0,1,2,3]]});t.current=2;
 t.games=[{id:'old',date:'2030-03-02',homeTeamId:0,awayTeamId:1,status:'completed',score:[99,98],national:{stage:'opening',group:0}},
 {id:'carried',date:'2030-03-12',homeTeamId:0,awayTeamId:1,status:'completed',score:[4,2],national:{stage:'super',group:0,carried:true}},
 {id:'fresh',date:'2030-03-13',homeTeamId:0,awayTeamId:2,status:'completed',score:[6,1],national:{stage:'super',group:0}}];
 const html=renderToStaticMarkup(createElement(Bracket,{entry}));assert.ok(html.includes('슈퍼라운드 순위'));assert.ok(html.includes('슈퍼라운드 경기 결과'));assert.ok(html.includes('4 : 2'));assert.ok(html.includes('6 : 1'));assert.ok(html.includes('이전 라운드 성적 이월'));assert.ok(!html.includes('99 : 98'));
 assert.match(html,/<button role="tab" aria-selected="true" class="selected">슈퍼라운드<\/button>/);assert.ok(!html.includes('조 선택'));
 t.current=3;t.finished='2030-03-20';assert.doesNotThrow(()=>renderToStaticMarkup(createElement(Bracket,{entry})));
});
for(const kind of ['apbc','premier12'])test(`${kind} shows one opening/super group without a selector and side-by-side placement games`,()=>{
 const entry=fixture().nationalTeams[0];entry.kind=kind;const t=entry.tournament;t.stages=[{id:'opening',name:'조별리그',groups:[[0,1,2,3]]},{id:'medals',name:'메달 결정전',groups:[[0,1],[2,3]],knockout:true}];t.current=1;
 t.games=[{id:'gold',date:'2030-03-20',homeTeamId:0,awayTeamId:1,status:'completed',score:[4,2],national:{stage:'medals',group:0}},{id:'bronze',date:'2030-03-20',homeTeamId:2,awayTeamId:3,status:'completed',score:[3,1],national:{stage:'medals',group:1}}];
 const group=renderToStaticMarkup(createElement(Bracket,{entry}));assert.ok(!group.includes('조 선택'));if(kind==='premier12')assert.ok(group.includes('>슈퍼라운드</button>'));
 const html=renderToStaticMarkup(createElement(Bracket,{entry,initialMode:'knockout'}));assert.ok(html.includes('national-placement-games'));assert.ok(html.indexOf('1·2위전')<html.indexOf('3·4위전'));assert.ok(html.includes('>대한민국</span>'));assert.ok(html.includes('>4</b>'));assert.ok(html.includes('medal-gold'));assert.ok(html.includes('medal-bronze'));assert.ok(html.includes('CHAMPIONSHIP'));assert.ok(html.includes('BRONZE MEDAL'));
});
test('national career has the same padded panel heading and body as other career panels',()=>{
 const state=fixture(),Honors=require('../.test-build/app/components/national-honors.js').default;
 const html=renderToStaticMarkup(createElement(Honors,{state,playerId:state.playerId}));assert.ok(html.includes('panel national-career'));assert.ok(html.includes('class="panel-heading"'));assert.ok(html.includes('class="career-panel-body"'));assert.ok(html.includes('<h2>국가대표</h2>'));
});
test('round results group matches under chronological date headings',()=>{
 const entry=fixture().nationalTeams[0],t=entry.tournament;t.stages[0].groups=[[0,1,2,3]];
 t.games=[{id:'later',date:'2030-03-12',homeTeamId:0,awayTeamId:1,status:'completed',score:[4,2],national:{stage:'opening',group:0}},{id:'early-b',date:'2030-03-11',homeTeamId:2,awayTeamId:3,status:'completed',score:[2,1],national:{stage:'opening',group:0}},{id:'early-a',date:'2030-03-11',homeTeamId:0,awayTeamId:1,status:'completed',score:[6,3],national:{stage:'opening',group:0}}];
 const html=renderToStaticMarkup(createElement(Bracket,{entry}));assert.equal((html.match(/class="national-match-day"/g)??[]).length,2);assert.ok(html.indexOf('dateTime="2030-03-11"')<html.indexOf('dateTime="2030-03-12"'));assert.ok(html.includes('2경기'));assert.ok(html.indexOf('6 : 3')<html.indexOf('2 : 1'));assert.ok(html.indexOf('2 : 1')<html.indexOf('4 : 2'));
});
