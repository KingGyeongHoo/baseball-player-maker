import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),fixture=require('./helpers/allstar-layout.cjs');
const e=require('../.test-build/lib/sim/engine.js');
const Records=require('../.test-build/app/components/season-records.js').default;
const {default:Honors,nationalTeamResult}=require('../.test-build/app/components/national-honors.js');
const {playerSeasons}=require('../.test-build/lib/player-records.js');
function setup(){const state=fixture(),player=e.getPlayer(state);player.career=[];player.seasonStats=e.emptyRecord();player.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};return {state,player};}
function render(state,player){return renderToStaticMarkup(createElement(Records,{state,player,year:2028,school:'서울 구단',ended:false,mine:true,onMyRecords(){}}));}
test('personal records hide unused batting/pitching sections based on actual appearances',()=>{
  const {state,player}=setup();assert.ok(!render(state,player).includes('연도별 투수 기록'));assert.ok(!render(state,player).includes('연도별 타자 기록'));
  player.seasonByLevel.first.batting.PA=1;player.seasonByLevel.first.batting.BB=1;
  let html=render(state,player);assert.ok(html.includes('연도별 타자 기록'));assert.ok(!html.includes('연도별 투수 기록'));
  player.seasonByLevel.first.batting.PA=0;player.seasonByLevel.first.pitching.outs=1;
  html=render(state,player);assert.ok(!html.includes('연도별 타자 기록'));assert.ok(html.includes('연도별 투수 기록'));
});
test('personal records show compact profile and paired season/team filters without instructional text',()=>{
  const {state,player}=setup(),html=render(state,player);
  for(const text of ['모든 시즌','모든 팀','시즌 선택','팀별 선택',`${player.age}세`])assert.ok(html.includes(text),text);
  for(const text of ['나의 선수','구단별 기록','재능','OPS는 출루율','5.2이닝은','통산 비율 기록','선택한 시즌에'])assert.ok(!html.includes(text),text);
});
test('pitching decisions appear in the season row and total even before the first out',()=>{
  const {state,player}=setup(),r=player.seasonByLevel.first;
  r.pitching.BF=1;r.games={pitching:1,wins:2,losses:3,holds:4,saves:5};
  const html=render(state,player);
  const summary=html.split('class="career-record-summary"')[1].split('</section>')[0];
  assert.deepEqual([...summary.matchAll(/<span>([^<]+)<\/span><b>([^<]+)<\/b>/g)].map(([,label,value])=>[label,value]),
    [['이닝','0.0'],['승','2'],['패','3'],['홀드','4'],['세이브','5'],['탈삼진','0'],['평균자책점','—']]);
  for(const label of ['승','패','홀드','세이브'])assert.ok(html.includes(`scope="col">${label}</th>`));
  for(const label of ['WHIP','실점','피안타','피홈런'])assert.ok(!html.includes(`scope="col">${label}</th>`));
  assert.equal(html.split('<td>2</td><td>3</td><td>4</td><td>5</td>').length-1,2);
});
test('club history remains available without postseason records',()=>{
  const {player}=setup();delete player.seasonPostseason;player.seasonByClub={'1':{first:e.emptyRecord(),second:e.emptyRecord()}};
  assert.ok(playerSeasons(player,2028)[0].byClub['1']);
});
function entry(){return {kind:'wbc',year:2028,roster:[],tournament:{countries:[{id:0,players:[]}],stages:[{id:'opening',name:'조별리그',groups:[[0,1]]}],games:[],current:0,finished:'2028-03-20',champion:1}};}
function game(stage,group=0,winner=1){return {homeTeamId:0,awayTeamId:1,status:'completed',advancingTeamId:winner,national:{stage,group,knockout:true}};}
test('national team result distinguishes group exits, knockout exits, finals and placement games',()=>{
  const row=entry(),t=row.tournament;assert.equal(nationalTeamResult(row),'조별리그 탈락');
  t.stages.push({id:'super',name:'슈퍼라운드',groups:[[0,1]]});assert.equal(nationalTeamResult(row),'슈퍼라운드 탈락');
  t.stages.push({id:'quarter',name:'8강',groups:[[0,1]],knockout:true});t.games=[game('quarter')];assert.equal(nationalTeamResult(row),'8강 탈락');
  t.stages.push({id:'semi',name:'준결승',groups:[[0,1]],knockout:true});t.games=[game('semi')];assert.equal(nationalTeamResult(row),'4강 탈락');
  t.games=[game('final')];assert.equal(nationalTeamResult(row),'준우승');
  t.games=[game('final',0,0)];assert.equal(nationalTeamResult(row),'우승');
  t.games=[game('medals',1)];assert.equal(nationalTeamResult(row),'4위');t.bronze=0;assert.equal(nationalTeamResult(row),'3위');t.champion=0;assert.equal(nationalTeamResult(row),'우승');
});
test('Olympic opening-round bye is not reported as elimination while quarterfinals run',()=>{
  const row=entry(),t=row.tournament;delete t.finished;delete t.champion;t.stages[0].byes=[0,1];t.stages.push({id:'quarter',name:'준준결승',groups:[[2,3,4,5]],knockout:true});
  assert.equal(nationalTeamResult(row),'진행 중');
});
test('national records separate team finish and individual honors',()=>{
  const {state,player}=setup(),row=entry(),r=e.emptyRecord();r.batting.PA=4;r.batting.AB=4;r.batting.H=2;
  row.roster=[{id:player.id,field:'batting'}];row.tournament.countries[0].players=[{id:player.id,records:r}];row.tournament.awards=[{id:player.id,title:'MVP'}];state.nationalTeams=[row];
  const html=renderToStaticMarkup(createElement(Honors,{state,playerId:player.id}));
  assert.ok(html.includes('<h2>국가대표</h2>'));assert.ok(html.includes('<th>기록</th><th>결과</th><th>수상</th>'));assert.ok(html.includes('<td>조별리그 탈락</td><td>MVP</td>'));assert.ok(!html.includes('0.0이닝'));
});
test('national selections without appearances display zero records for their selected role',()=>{
  const {state,player}=setup(),row=entry();row.roster=[{id:player.id,field:'batting'}];state.nationalTeams=[row];
  let html=renderToStaticMarkup(createElement(Honors,{state,playerId:player.id}));assert.ok(html.includes('0타수 0안타 0홈런 0타점'));
  row.roster[0].field='pitching';html=renderToStaticMarkup(createElement(Honors,{state,playerId:player.id}));assert.ok(html.includes('0.0이닝 0탈삼진'));
});
