import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const r=require('../.test-build/lib/roster-records.js');
const {default:PlayerRoster,RosterTable}=require('../.test-build/app/components/player-roster.js');
function player(id,position='SS',teamId=0){const p=e.previewPlayer(id,id,position);p.id=id;p.teamId=teamId;p.reputation=70;p.seasonStats=e.emptyRecord();p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};return p;}
const state=players=>({players,playerId:players[0].id,teams:Array.from({length:20},(_,id)=>({id,name:`구단${id}`,shortName:`구단${id}`})),phase:'active',date:'2028-05-01',calendar:{seasonYear:2028}});

test('reputation grades have explicit boundaries and unknown reputation remains ungraded',()=>{
  for(const [score,grade] of [[0,'F'],[39.999,'F'],[40,'E'],[47.999,'E'],[48,'D'],[55.999,'D'],[56,'C'],[63.999,'C'],[64,'B'],[71.999,'B'],[72,'A'],[80,'A'],[80.001,'S'],[100,'S'],[null,'—'],[undefined,'—'],[NaN,'—']])assert.equal(r.rosterGrade(score),grade);
  const p=player('ability');for(const k of Object.keys(p.stats))p.stats[k]=60;
  p.reputation=e.reputationScore(p);assert.equal(r.rosterGrade(p.reputation),'C');p.stats.contact=p.stats.power=90;
  p.reputation=e.reputationScore(p);assert.ok(p.reputation>60);assert.equal(r.rosterGrade(p.reputation),'B'); // No extra OVR sum.
});

test('pitchers and batters split by role and two-way players appear in both lists',()=>{
  const bat=player('bat'),pit=player('pit','RP'),duo=player('duo');duo.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};
  const list=[bat,pit,duo],before=structuredClone(list);
  assert.deepEqual(list.filter(p=>r.rosterFieldMember(p,'batting')).map(p=>p.id),['bat','duo']);
  assert.deepEqual(list.filter(p=>r.rosterFieldMember(p,'pitching')).map(p=>p.id),['pit','duo']);assert.deepEqual(list,before);
});

test('level records follow actual appearances after promotion and do not mix first and second-team totals',()=>{
  const p=player('moved','SP',0);p.seasonByLevel.second.pitching.BF=10;p.seasonByLevel.second.pitching.outs=6;
  p.seasonStats.pitching.BF=30;p.seasonStats.pitching.outs=18;
  assert.equal(r.rosterLevelMember(p,'first'),true);assert.equal(r.rosterLevelMember(p,'second'),true);
  assert.equal(r.rosterRecords(p,'first').pitching.outs,0);assert.equal(r.rosterRecords(p,'second').pitching.outs,6);assert.equal(r.rosterRecords(p,'total').pitching.outs,18);
  p.teamId=-1;assert.equal(r.rosterLevelMember(p,'first'),false);assert.equal(r.rosterLevelMember(p,'second'),true);
  delete p.seasonByLevel;assert.equal(r.rosterRecords(p,'first').pitching.BF,0);
});

test('ERA sorts low to high, counting stats high to low, and missing legacy counters sort last',()=>{
  const best=player('best','SP'),worse=player('worse','SP'),none=player('none','SP');
  Object.assign(best.seasonStats.pitching,{BF:30,outs:27,ER:2});Object.assign(worse.seasonStats.pitching,{BF:30,outs:27,ER:10});
  best.seasonStats.games={pitching:8,wins:9};worse.seasonStats.games={pitching:9,wins:2};none.seasonStats.pitching.BF=10;
  const list=[none,worse,best];for(const sort of ['era','wins'])assert.deepEqual([...list].sort((a,b)=>r.compareRosterPlayers(a,b,'pitching','total',sort)).map(p=>p.id),['best','worse','none']);
  const fresh=player('fresh','SP');assert.equal(r.rosterMetrics.pitching.find(m=>m.id==='wins').value(fresh.seasonStats),0);
  assert.equal(r.rosterMetrics.pitching.find(m=>m.id==='wins').value(none.seasonStats),null);
});

test('shared roster renders the requested columns and exact selected-league records with a reputation grade',()=>{
  const p=player('기록선수','SP'),s=state([p]);s.careerMode='pro';for(const k of Object.keys(p.stats))p.stats[k]=60;p.fatigue=0;p.recentZ=0;
  Object.assign(p.seasonByLevel.first.pitching,{BF:30,outs:17,ER:2});p.seasonByLevel.first.games={pitching:7,wins:2,losses:1,holds:3,saves:1};
  const html=renderToStaticMarkup(createElement(RosterTable,{state:s,players:[p],field:'pitching',level:'first',onSelect(){}}));
  const headers=[...html.matchAll(/<th(?: [^>]*)?>(.*?)<\/th>/g)].map(m=>m[1]);
  assert.deepEqual(headers,['선수','OVR','등급','소속','나이','포지션','출전경기','이닝','승','패','홀드','세이브','ERA','출전평가']);
  assert.match(html,/출전평가 등급 E/);assert.match(html,/>5\.2</);assert.match(html,/>3\.18</);assert.doesNotMatch(html,/투수 OVR|타자 OVR/);
  Object.assign(p.seasonStats.batting,{PA:30,AB:25,H:10,HR:2,RBI:8,BB:5});p.seasonStats.games={batting:9};
  const bat=renderToStaticMarkup(createElement(RosterTable,{state:s,players:[p],field:'batting',onSelect(){}}));
  assert.match(bat,/<th>타수<\/th>/);assert.match(bat,/<th>OPS<\/th>/);assert.match(bat,/>\.400</);assert.doesNotMatch(bat,/<th>ERA<\/th>/);
});
test('pro grade and grade ordering use recorded WAR independently of ability and fatigue, while school grades retain reputation',()=>{
  const rested=player('rested'),tired=player('tired');for(const p of [rested,tired]){for(const k of Object.keys(p.stats))p.stats[k]=70;p.recentZ=0;p.fatigue=0;}
  rested.reputation=10;tired.reputation=100;tired.fatigue=90;
  assert.equal(r.rosterGradeScore(rested,true),71);assert.equal(r.rosterGrade(r.rosterGradeScore(rested,true),true),'E');
  assert.equal(r.rosterGradeScore(tired,true),r.rosterGradeScore(rested,true));
  Object.assign(rested.seasonByLevel.first.batting,{PA:300,AB:270,H:100,HR:25,BB:30});
  Object.assign(tired.seasonByLevel.first.batting,{PA:300,AB:285,H:40,HR:2,BB:15});
  assert.ok(r.rosterGradeScore(tired,true)<r.rosterGradeScore(rested,true));assert.ok(r.compareRosterPlayers(rested,tired,'batting','total','grade',true)<0);
  assert.ok(r.compareRosterPlayers(rested,tired,'batting','total','grade',false)>0);assert.equal(r.rosterGradeScore(tired,false),100);
  const before=r.rosterGradeScore(tired,true);tired.proContract={status:'developmental',joinedDate:'2028-01-01'};tired.fatigue=0;assert.equal(r.rosterGradeScore(tired,true),before);
});

test('school and pro share the roster and viewing leaves player data and RNG untouched',()=>{
  const mine=player('우리타자'),other=player('우리투수','RP'),rival=player('다른학교','SS',1),s=state([mine,other,rival]);
  const before=structuredClone(s),school=renderToStaticMarkup(createElement(PlayerRoster,{state:s,onSelect(){}}));
  assert.match(school,/우리타자/);assert.doesNotMatch(school,/우리투수|다른학교/);assert.match(school,/타수/);assert.match(school,/우리 학교/);assert.deepEqual(s,before);
  s.careerMode='pro';mine.teamId=10;s.postSchool={pro:{club:0}};other.teamId=10;
  const proBefore=structuredClone(s),pro=renderToStaticMarkup(createElement(PlayerRoster,{state:s,onSelect(){}}));
  assert.match(pro,/1군/);assert.match(pro,/2군/);assert.match(pro,/시즌 합계/);assert.match(pro,/등급순/);assert.deepEqual(s,proBefore);
});

test('school score column shows reputation, pro shows WAR converted to points, and labels match the actual values',()=>{
  const p=player('서로다른평가'),s=state([p]);
  for(const key of Object.keys(p.stats))p.stats[key]=60;
  p.reputation=82.3;p.fatigue=0;p.recentZ=0;
  const render=()=>renderToStaticMarkup(createElement(RosterTable,{state:s,players:[p],field:'batting',onSelect(){}}));
  const school=render();assert.match(school,/<th>평판<\/th>/);assert.doesNotMatch(school,/출전평가/);
  assert.match(school,/평판 등급 S/);assert.match(school,/>82\.3<\/b><\/td><\/tr>/);
  const guide=renderToStaticMarkup(createElement(PlayerRoster,{state:s,onSelect(){}}));
  assert.match(guide,/평판 열/);assert.doesNotMatch(guide,/출전평가/);
  s.careerMode='pro';const pro=render();
  assert.match(pro,/<th>출전평가<\/th>/);assert.match(pro,/출전평가 등급 E/);assert.match(pro,/>71\.0<\/b><\/td><\/tr>/);
  assert.doesNotMatch(pro,/>82\.3<\/b><\/td><\/tr>/);
});
