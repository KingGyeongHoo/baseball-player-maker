import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const a=require('../.test-build/lib/sim/pro-assessment.js');
const r=require('../.test-build/lib/sim/pro-season-ranking.js');
const v=require('../.test-build/lib/sim/pro-season-evaluation.js');
const save=require('../.test-build/lib/career-save.js');
const Badge=require('../.test-build/app/components/season-grade-badge.js').default;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('rank-test','순위검증','CP'));
function fixture(){
  const s=structuredClone(template),base=e.getPlayer(s);
  s.players=Array.from({length:10},(_,i)=>{
    const p=structuredClone(base);p.id=i?`closer-${i}`:base.id;p.position='CP';p.professional.assessments=[];
    p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};
    Object.assign(p.seasonByLevel.first.pitching,{BF:260,outs:180,SO:75,BB:15,HR:i,ER:10+i*5});return p;
  });return s;
}
test('relievers and closers share a bullpen pool, with starters and other levels ranked separately',()=>{
  const s=fixture(),extra=structuredClone(s.players[0]);extra.id='starter';extra.position='SP';s.players.push(extra);
  for(const p of s.players.slice(5,10))p.position='RP';
  const farm=structuredClone(s.players[0]);farm.id='farm';farm.seasonByLevel.second=farm.seasonByLevel.first;farm.seasonByLevel.first=e.emptyRecord();s.players.push(farm);
  const none=structuredClone(s.players[0]);none.id='no-appearance';none.seasonByLevel.first=e.emptyRecord();s.players.push(none);
  const snapshot=structuredClone(s),ranks=r.createSeasonRankings(s);
  assert.deepEqual(s.players.slice(0,10).map(p=>ranks.get(p.id).grade),['S','A','B','B','C','C','D','D','E','E']);
  for(const p of s.players.slice(0,10)){assert.equal(ranks.get(p.id).total,10);assert.equal(ranks.get(p.id).role,'bullpen');}
  assert.equal(ranks.get('starter').role,'starter');assert.equal(ranks.get('farm').level,'second');assert.equal(ranks.has('no-appearance'),false);assert.deepEqual(s,snapshot);
});

test('100 distinct ranks have the requested seven grade bands including exact boundaries',()=>{
  const grades=Array.from({length:100},(_,i)=>r.seasonRankGrade(i+1,100));
  assert.deepEqual(Object.fromEntries(['S','A','B','C','D','E','F'].map(g=>[g,grades.filter(v=>v===g).length])),{S:5,A:15,B:20,C:20,D:20,E:15,F:5});
});

test('legacy rank saves migrate grades without changing WAR or rank and remain valid on reload',()=>{
  const s=fixture();for(const p of s.players)a.recordSeasonAssessment(s,p);
  s.proWorld.seasonClosed=true;r.freezeSeasonRankings(s);
  const row=s.players[2].professional.assessments[0];
  // Third of ten used to be A and is now B.
  row.seasonRank.version=1;row.seasonRank.grade=row.grade='A';
  const before=structuredClone(row.seasonRank);
  const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
  const migrated=loaded.players[2].professional.assessments[0];
  assert.deepEqual(migrated.seasonRank,{...before,version:2,grade:'B'});
  assert.equal(migrated.grade,'B');
  assert.doesNotThrow(()=>save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(loaded))));
});
test('equal WAR shares rank, grade and medal rather than using arbitrary player IDs',()=>{
  const s=fixture();s.players[1].seasonByLevel=structuredClone(s.players[0].seasonByLevel);
  const ranks=r.createSeasonRankings(s);
  assert.equal(ranks.get(s.players[0].id).rank,1);assert.equal(ranks.get(s.players[1].id).rank,1);assert.equal(ranks.get(s.players[2].id).rank,3);
});
test('frozen ranks survive awards, roster changes and save/load while numeric evaluations stay independent',()=>{
  const s=fixture();for(const p of s.players)a.recordSeasonAssessment(s,p);
  const scores=s.players.map(p=>p.professional.assessments[0].score);
  s.proWorld.seasonClosed=true;r.freezeSeasonRankings(s);
  assert.deepEqual(s.players.map(p=>p.professional.assessments[0].score),scores);
  const row=s.players[0].professional.assessments[0],rank=structuredClone(row.seasonRank);
  s.players[0].position='SP';v.refreshSeasonEvaluations(s);r.freezeSeasonRankings(s);
  assert.deepEqual(row.seasonRank,rank);assert.equal(row.grade,'S');
  const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
  assert.deepEqual(e.getPlayer(loaded).professional.assessments[0].seasonRank,rank);
  row.seasonRank={...rank,role:'closer'};
  const legacy=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
  assert.deepEqual(e.getPlayer(legacy).professional.assessments[0].seasonRank,row.seasonRank);
  row.seasonRank.rank=3;assert.throws(()=>save.validateCareerState(s),/순위/);
});
test('season badges expose WAR and role rank accessibly, with gold silver bronze for the podium',()=>{
  const s=fixture(),ranks=r.createSeasonRankings(s);
  for(let index=0;index<3;index++){
    const rank=ranks.get(s.players[index].id);
    const html=renderToStaticMarkup(Badge({score:75,rank,war:rank.war}).props.content);
    assert.ok(html.includes(`season-rank-${['gold','silver','bronze'][index]}`));assert.ok(html.includes(`불펜 ${index+1}위 / 10명`));assert.ok(html.includes('WAR '));
  }
});
test('reconstructed historical ranks disclose incomplete saved populations and validate their provenance',()=>{
  const s=fixture(),rank={...r.createSeasonRankings(s).get(s.playerId),basis:'retained-records'};
  assert.equal(r.validSeasonRank(rank),true);
  assert.equal(r.validSeasonRank({...rank,basis:'invented'}),false);
  const html=renderToStaticMarkup(Badge({score:75,rank,war:rank.war}).props.content);
  assert.ok(html.includes('남아 있는 저장 기록 기준'));
});
