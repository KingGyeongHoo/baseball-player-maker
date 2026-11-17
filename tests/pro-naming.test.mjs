import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const names=require('../.test-build/lib/sim/club-names.js');
const {competitionName}=require('../.test-build/lib/sim/calendar.js');
const {careerHonors}=require('../.test-build/lib/career-summary.js');
const save=require('../.test-build/lib/career-save.js');
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('naming','표시검증','SS'));
test('main club and competition names omit first-team qualifiers while farm names and registration language stay explicit',()=>{
  assert.equal(names.proTeamName(3),'인천 랜더스');assert.equal(names.proTeamName(13),'인천 랜더스 2군');
  assert.equal(names.mainLeagueName('인천 랜더스 1군 · 1군 플레이오프 · 1군 올스타'),'인천 랜더스 · 플레이오프 · 올스타');
  assert.equal(names.mainLeagueName('1군 출전평가 · 1군 정착 · 1군 승격'),'1군 출전평가 · 1군 정착 · 1군 승격');
  const calendar={competitions:[{id:'pro-playoffs-playoff',name:'1군 플레이오프'},{id:'pro-farm-playoffs-final',name:'2군 챔피언결정전'}]};
  assert.equal(competitionName(calendar,'pro-playoffs-playoff'),'플레이오프');assert.equal(competitionName(calendar,'pro-farm-playoffs-final'),'2군 챔피언결정전');
});
test('version-one saves upgrade labels without remapping current club identities, replaying games or changing goals',()=>{
  const s=structuredClone(template),p=e.getPlayer(s);s.proClubNamesVersion=1;
  s.teams[3].name='인천 랜더스 1군';s.teams[13].name='인천 랜더스 2군';s.draft=[{club:'창원 다이노스'}];
  s.proWorld.goal='1군 정착';s.proWorld.news=[{id:'name',date:s.date,text:'1군 올스타 · 인천 랜더스 1군'}];
  s.calendar.competitions.find(c=>c.id==='pro-first').name='프로 1군 정규리그';
  const rng=structuredClone(s.rngStates),ids=s.players.map(p=>[p.id,p.teamId]),date=s.date;
  const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
  assert.equal(loaded.proClubNamesVersion,2);assert.equal(loaded.teams[3].name,'인천 랜더스');assert.equal(loaded.teams[13].name,'인천 랜더스 2군');assert.equal(loaded.draft[0].club,'창원 다이노스');
  assert.equal(loaded.proWorld.goal,'1군 정착');assert.equal(loaded.proWorld.news[0].text,'올스타 · 인천 랜더스');assert.deepEqual(loaded.rngStates,rng);assert.deepEqual(loaded.players.map(p=>[p.id,p.teamId]),ids);assert.equal(loaded.date,date);
  assert.equal(names.syncProClubNames(loaded),false);
});
test('career honors mix levels chronologically and only farm titles retain the level prefix',()=>{
  const s=structuredClone(template),p=e.getPlayer(s),year=s.calendar.seasonYear;
  p.professional.allstarHistory=[{year:year-2,level:'first',side:'blue',slot:'SS',method:'vote',participated:true,mvp:true},{year:year-1,level:'second',side:'white',slot:'SS',method:'vote',participated:true,mvp:true},{year,level:'first',side:'blue',slot:'SS',method:'vote',participated:true}];
  const honors=careerHonors(s);
  assert.deepEqual(honors.allstar.map(r=>r.title),['올스타','2군 올스타','올스타']);
  assert.ok(honors.individual.some(r=>r.title==='미스터 올스타'));assert.ok(honors.individual.some(r=>r.title==='2군 미스터 올스타'));
});
