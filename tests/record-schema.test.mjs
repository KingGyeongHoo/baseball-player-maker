import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const {removeBattedBallRecords}=require('../.test-build/lib/record-schema.js');
const recent=require('../.test-build/lib/sim/recent-records.js');
const evaluation=require('../.test-build/lib/sim/player-evaluation.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const save=require('../.test-build/lib/career-save.js');
const a=require('../.test-build/lib/sim/pro-assessment.js');
const {playerSeasonWar}=require('../.test-build/lib/player-season-war.js');
const {playerSeasons}=require('../.test-build/lib/player-records.js');
const {leagueLeaders,proRankingMetricIds,leaderMetrics}=require('../.test-build/lib/league-leaders.js');
const Records=require('../.test-build/app/components/season-records.js').default;
const League=require('../.test-build/app/components/pro-league.js').default;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('record-schema','기록검증','SS'));
const old=[10,8,3,1,0,1,2,2,1,3,7,9,30,18,5,2,6,1,2,2];
test('new records and leader metrics contain no ground/fly ball counters',()=>{
  assert.equal('GB' in e.emptyRecord().batting,false);assert.equal('FB' in e.emptyRecord().batting,false);
  assert.equal(leaderMetrics.batting.some(m=>['GB','FB'].includes(m.id)),false);
  assert.deepEqual(proRankingMetricIds.batting,['avg','H','HR','RBI','SB','WAR']);
  assert.deepEqual(proRankingMetricIds.pitching,['era','wins','losses','holds','saves','WAR']);
});
test('legacy recent arrays preserve pitching and steals through conversion and repeated merges',()=>{
  const packed=recent.packRecentRecord([...old,4,1]),first=e.emptyRecord(),second=e.emptyRecord();
  recent.mergeRecentRecord(first,[...old,4,1]);recent.mergeRecentRecord(second,packed);assert.deepEqual(first,second);
  assert.equal(first.pitching.BF,30);assert.equal(first.pitching.outs,18);assert.equal(first.batting.SB,4);
  assert.equal(recent.recentSample(packed,true),18);assert.equal(recent.recentSample(packed,false),10);
  assert.deepEqual(recent.packRecentRecord(packed),packed);
});
test('legacy evaluation snapshots keep game counters and SB/CS after removing the two batting slots',()=>{
  const values=[...old,12,6,3,2,1,4,5,2],record=evaluation.unpackEvaluationRecord(values);
  assert.equal(record.pitching.BF,30);assert.equal(record.games.batting,12);assert.equal(record.games.saves,4);assert.equal(record.batting.SB,5);assert.equal(record.batting.CS,2);
  assert.deepEqual(evaluation.unpackEvaluationRecord(evaluation.packEvaluationRecord(record)),record);
});
test('save migration removes nested counters immutably, checks integrity first, and preserves legacy recent samples',()=>{
  const s=structuredClone(template),p=e.getPlayer(s);p.seasonStats.batting.GB=7;p.seasonStats.batting.FB=9;p.recentAppearances=[[...old,4,1]];
  const file={...save.encodeCareerSave(s),state:s};file.checksum=save.saveChecksum(JSON.stringify(s));
  const before=JSON.stringify(file),loaded=save.decodeCareerSave(before),q=e.getPlayer(loaded.state);
  assert.equal('GB' in q.seasonStats.batting,false);assert.equal('FB' in q.seasonStats.batting,false);assert.equal(q.recentAppearances[0][0],-2);assert.equal(JSON.stringify(file),before);
  const bad={...file,checksum:'bad'};assert.throws(()=>save.decodeCareerSave(JSON.stringify(bad)),/무결성/);
  assert.deepEqual(removeBattedBallRecords(loaded.state),loaded.state);
});
test('personal records put WAR last in both tables and keep batting and pitching contributions separate',()=>{
  const s=structuredClone(template),p=e.getPlayer(s),r=e.emptyRecord();
  Object.assign(r.batting,{PA:100,AB:90,H:30,HR:5,BB:10});p.seasonByLevel={first:r,second:e.emptyRecord()};p.professional.assessments=[];
  const row=a.recordSeasonAssessment(s,p),season=playerSeasons(p,s.calendar.seasonYear).find(r=>r.current),contribution=playerSeasonWar(p,season,'first');
  assert.equal(contribution.batting,row.war.first.batting+row.war.first.fielding+row.war.first.positional);assert.equal(contribution.pitching,0);
  const html=renderToStaticMarkup(createElement(Records,{state:s,player:p,year:s.calendar.seasonYear,school:'구단',ended:false,mine:true,onMyRecords(){}}));
  assert.equal((html.match(/>WAR<\/th><\/tr>/g)??[]).length,2);assert.doesNotMatch(html,/>단계<|>땅볼<|>뜬공</);
  const leader=leagueLeaders(s,'pro-first','batting').find(b=>b.metric.id==='WAR').rows.find(r=>r.player.id===p.id);
  assert.equal(leader.value,contribution.batting);
});
test('league batting boards show exactly the six requested categories in order',()=>{
  const html=renderToStaticMarkup(createElement(League,{state:structuredClone(template),onRecords(){}}));
  const headings=[...html.matchAll(/<h3>(.*?) <span>TOP 10<\/span><\/h3>/g)].map(match=>match[1]);
  assert.deepEqual(headings,['타율','안타','홈런','타점','도루','WAR']);
});
