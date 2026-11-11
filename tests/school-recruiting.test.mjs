import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {readFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const {highSchools, recruitmentProfile, updateSchoolPrestige} = require('../.test-build/lib/sim/school-recruiting.js');
const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;

test('100 unique school names retain provenance and exclude BC teams', () => {
  assert.equal(highSchools.length, 100);
  assert.equal(new Set(highSchools.map(s => s.name)).size, 100);
  assert.equal(highSchools.filter(s => !s.fictional).length, 83);
  assert.equal(highSchools.filter(s => s.fictional).length, 17);
  assert.ok(highSchools.every((s,i) => s.id === i && !/BC/i.test(s.sourceName ?? '') && s.name !== s.sourceName));
  const real = highSchools.filter(s => !s.fictional);
  for (let i=1; i<real.length; i++) assert.ok(real[i-1].wins/(real[i-1].wins+real[i-1].losses) >= real[i].wins/(real[i].wins+real[i].losses));
  for (const [source, name] of [['경기고','강기고'],['휘문고','하문고'],['광주제일고','제영고'],['동산고','동상고'],['군산상일고','군산영일고']]) assert.equal(real.find(s=>s.sourceName===source).name,name);
  const schoolList=readFileSync(new URL('../docs/high-school-teams.md',import.meta.url),'utf8').split('## 교명 목록')[1];
  const documented=[...schoolList.matchAll(/^\|\s*(\d+)\s*\|\s*[^|]+\|\s*([^|]+?)\s*\|\s*$/gm)].map(([,number,name])=>({id:Number(number)-1,name:name.trim()}));
  assert.equal(documented.length,100);assert.deepEqual(highSchools.map(({id,name})=>({id,name})),documented);
});

test('strong schools recruit better prospects and earn more picks, while weak-school stars remain draftable', () => {
  let weakPicks = 0;
  for (let seed=0; seed<3; seed++) {
    const s=e.createGame('school-audit-'+seed,'검증','SS');
    const top=s.players.filter(p=>p.teamId<20), bottom=s.players.filter(p=>p.teamId>=80);
    const ability=p=>e.overall({...p,stats:p.initialStats});
    const talent=p=>p.talent[e.isPitcher(p.primaryRole)?'pitching':'batting'];
    assert.ok(mean(top.map(ability)) > mean(bottom.map(ability))+10);
    assert.ok(mean(top.map(talent)) > mean(bottom.map(talent))+1);
    assert.ok(Math.max(...bottom.map(ability)) > mean(top.map(ability)), 'weak schools can produce strong individuals');
    const byId=new Map(s.players.map(p=>[p.id,p]));
    const picks=e.draftPlayers(s), strong=picks.filter(p=>byId.get(p.playerId).teamId<20).length;
    const weak=picks.filter(p=>byId.get(p.playerId).teamId>=80).length;
    assert.ok(strong > weak*3); weakPicks+=weak;
    const star=s.players.find(p=>p.grade===3&&p.teamId===99);
    for (const p of s.players) if(p.grade===3) p.reputation=0;
    star.reputation=100;
    assert.equal(e.draftPlayers(s)[0].playerId,star.id);
  }
  assert.ok(weakPicks>0);
});

test('season results and actual senior picks affect future recruitment without changing existing abilities', () => {
  const s=e.createGame('school-evolution','검증','SS');
  const team=s.teams[50], before=team.schoolPrestige, abilities=JSON.stringify(s.players.map(p=>p.stats));
  team.wins=20;team.losses=0;
  const seniors=s.players.filter(p=>p.grade===3&&p.teamId===team.id);
  updateSchoolPrestige(s,seniors.slice(0,4).map(p=>({playerId:p.id})));
  assert.ok(team.schoolPrestige>before);
  assert.equal(JSON.stringify(s.players.map(p=>p.stats)),abilities);
  const good=team.schoolPrestige;team.wins=0;team.losses=20;
  updateSchoolPrestige(s,[]);assert.ok(team.schoolPrestige<good);
  delete team.schoolPrestige;updateSchoolPrestige(s,[]);
  assert.equal(team.schoolPrestige,undefined);
  assert.equal(recruitmentProfile(team).abilityOffset,0);
});

test('annual intake retains the recruiting advantage, school identities and roster size', () => {
  const s=e.createGame('school-next-year','검증','SS');
  for(const t of s.teams){t.wins=10;t.losses=10;}
  const oldIds=new Set(s.players.map(p=>p.id)), names=s.teams.map(t=>t.name), draftRng=s.rngStates.draft;
  e.promote(s);
  const incoming=s.players.filter(p=>!oldIds.has(p.id));
  assert.equal(incoming.length,1000);assert.equal(s.players.length,3000);
  assert.deepEqual(s.teams.map(t=>t.name),names);assert.equal(s.rngStates.draft,draftRng);
  assert.ok(mean(incoming.filter(p=>p.teamId<20).map(e.overall)) > mean(incoming.filter(p=>p.teamId>=80).map(e.overall))+8);
  assert.ok(s.teams.every(t=>s.players.filter(p=>p.teamId===t.id&&p.grade===1).length===10));
});
