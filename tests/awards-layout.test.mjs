import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),fixture=require('./helpers/allstar-layout.cjs');
const e=require('../.test-build/lib/sim/engine.js');
const {IndividualAwards,PostseasonAwards}=require('../.test-build/app/components/pro-awards-hub.js');
const {seriesAwardRecordText}=require('../.test-build/app/components/pro-awards.js');
const {CareerHonors}=require('../.test-build/app/components/pro-career-summary.js');
const titles=require('../.test-build/lib/sim/pro-individual-awards.js');
function awarded(){
  const s=fixture(),p=e.getPlayer(s),year=s.calendar.seasonYear,r=e.emptyRecord();
  Object.assign(r.batting,{PA:8,AB:8,H:5,HR:4,RBI:9});r.games={batting:2};
  const award={year,kind:'와일드카드 MVP',category:'seriesMvp',series:'wildcard',seriesId:'wildcard',playerId:p.id,playerName:p.name,club:1,value:20,field:'batting',records:r};
  const winner={playerId:p.id,playerName:p.name,club:1};
  const individualAwards=[{level:'first',field:'pitching',metric:'wins',label:'다승왕',value:20,winners:[winner]},{level:'first',field:'pitching',metric:'SO',label:'탈삼진왕',value:200,winners:[winner]},{level:'first',field:'batting',metric:'avg',label:'타격왕',value:.321,format:'rate',winners:[winner]},{level:'first',field:'batting',metric:'H',label:'안타왕',value:180,winners:[winner,{...winner,playerId:'retired-tied',playerName:'공동선수'}]}];
  const season={year,awards:[award],standings:[],farmStandings:[],champion:1,draft:[],individualAwards};s.proWorld.seasons=[season];
  return {s,p,season,award};
}
test('title page shows pitchers and batters together, winner clubs below names, and tied winners',()=>{
  const {s,season}=awarded(),before=structuredClone(s),html=renderToStaticMarkup(createElement(IndividualAwards,{state:s,season,onRecords(){}}));
  assert.match(html,/<h2>타이틀<\/h2>/);assert.match(html,/aria-label="타이틀 리그"/);
  assert.ok(html.indexOf('투수 타이틀')<html.indexOf('타자 타이틀'));
  for(const text of ['다승왕','탈삼진왕','타율왕','20승','200탈삼진','.321','공동선수','공동 1위'])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('개인 수상 분야'));assert.deepEqual(s,before);
});
test('postseason MVPs use four ordered bracket columns with series-only performance and no reward text',()=>{
  const {s,award}=awarded(),before=structuredClone(s),html=renderToStaticMarkup(createElement(PostseasonAwards,{state:s,year:s.calendar.seasonYear,onRecords(){},initialLevel:'first'}));
  assert.match(html,/postseason-rounds series-awards-grid/);
  const labels=['와일드카드','준플레이오프','플레이오프','한국시리즈'];let last=-1;
  for(const label of labels){const at=html.indexOf(`<h3>${label}</h3>`);assert.ok(at>last);last=at;}
  assert.ok(html.includes('2경기 · 8타수 · 5안타 · 타율 0.625 · 4홈런 · 9타점 · OPS 2.750'));assert.ok(!html.includes('출전평가 +1'));assert.deepEqual(s,before);
  assert.equal(seriesAwardRecordText(s,award).includes('OPS 2.750'),true);
});
test('series records can be reconstructed from matching games without leaking regular season or other-series records',()=>{
  const {s,award}=awarded();delete award.records;
  const record=e.emptyRecord();Object.assign(record.pitching,{BF:20,outs:12,H:3,BB:1,SO:8,ER:1,R:1});award.field='pitching';
  const year=s.calendar.seasonYear;
  s.calendar.events=[{id:'series',competitionId:'pro-playoffs-wildcard',date:`${year}-10-01`,status:'completed',boxScore:{[award.playerId]:record}},{id:'unrelated',competitionId:'pro-first',date:`${year}-04-01`,status:'completed',boxScore:{[award.playerId]:record}}];
  const text=seriesAwardRecordText(s,award);assert.ok(text.includes('1경기 · 4.0이닝'));assert.ok(text.includes('2.25'));assert.ok(text.includes('8탈삼진'));assert.ok(text.includes('WHIP 1.00'));
});
test('career honors use occurrence counts and strikeouts are a real award category in both leagues',()=>{
  const {s,p}=awarded(),html=renderToStaticMarkup(createElement(CareerHonors,{state:s}));assert.match(html,/\d+회<\/span>/);assert.doesNotMatch(html,/\d+건<\/span>/);
  for(const q of s.players){q.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};}
  for(const level of ['first','second'])Object.assign(p.seasonByLevel[level].pitching,{BF:20,outs:15,SO:10});
  for(const level of ['first','second']){const award=titles.individualAwards(s).find(r=>r.level===level&&r.metric==='SO');assert.equal(award.label,'탈삼진왕');assert.equal(award.winners[0].playerId,p.id);}
});
test('historical seasons without a strikeout trophy show its category without fabricating a winner or value',()=>{
  const {s,season}=awarded();season.individualAwards=season.individualAwards.filter(row=>row.metric!=='SO');
  const before=structuredClone(season),html=renderToStaticMarkup(createElement(IndividualAwards,{state:s,season,onRecords(){}}));
  assert.ok(html.includes('탈삼진왕'));assert.ok(html.includes('기록 없음'));assert.ok(!html.includes('0탈삼진'));assert.deepEqual(season,before);
});
test('second-team season MVP uses farm records and is announced and saved separately',()=>{
  const {s,p,season}=awarded();
  const {regularAwards}=require('../.test-build/lib/sim/pro-evaluation.js');
  const {presentAwardsCeremony}=require('../.test-build/lib/sim/pro-awards-ceremony.js');
  const {careerHonors}=require('../.test-build/lib/career-summary.js');
  const {SeasonAwards}=require('../.test-build/app/components/pro-awards.js');
  const {decodeCareerSave,encodeCareerSave}=require('../.test-build/lib/career-save.js');
  for(const player of s.players)player.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};
  p.primaryRole='선발';
  Object.assign(p.seasonByLevel.first.pitching,{BF:130,outs:90,ER:10,SO:30});
  Object.assign(p.seasonByLevel.second.pitching,{BF:170,outs:123,ER:9,SO:62});
  season.awards=regularAwards(s);season.rookieRulesVersion=1;
  const mvp=season.awards.find(row=>row.category==='mvp'&&row.level==='second');
  assert.equal(mvp.playerId,p.id);
  assert.equal(mvp.records.pitching.SO,62);
  assert.equal(season.awards.some(row=>row.category==='rookie'&&row.level==='second'),false);
  season.awardsCeremony={version:1,scheduledAt:`${season.year}-12-06`};
  assert.equal(careerHonors(s).individual.some(row=>row.title==='2군 시즌 MVP'),false);
  s.date=season.awardsCeremony.scheduledAt;s.proWorld.seasonClosed=true;
  assert.equal(presentAwardsCeremony(s),true);
  const celebrations=s.noticeQueue.filter(row=>row.award?.title.endsWith('MVP'));
  assert.deepEqual(celebrations,[]);
  const html=renderToStaticMarkup(createElement(SeasonAwards,{state:s,season}));
  assert.ok(html.includes('1군 MVP')&&html.includes('2군 MVP')&&html.includes('62탈삼진'));
  const restored=decodeCareerSave(JSON.stringify(encodeCareerSave(s))).state;
  assert.ok(careerHonors(restored).individual.some(row=>row.title==='2군 시즌 MVP'));
});
