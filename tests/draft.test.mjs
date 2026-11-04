import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-8, a+' != '+b);

test('reputation combines current OVR and retained performance with event corrections', () => {
  const state=e.createGame('reputation-components','검증','SS'),p=e.getPlayer(state);
  for(const k of Object.keys(p.stats)) p.stats[k]=80;
  p.performanceReputation=60;
  close(e.reputationScore(p),72);
  for(const k of Object.keys(p.stats)) p.stats[k]=90;
  close(e.reputationScore(p),78);
  p.performanceReputation=80;
  close(e.reputationScore(p),86);
  p.reputationBonus=3;
  close(e.reputationScore(p),89);
  p.performanceReputation=null;p.reputationBonus=0;
  close(e.reputationScore(p),74);
  p.performanceReputation=100;p.reputationBonus=100;
  close(e.reputationScore(p),100);
});

test('training raises reputation through OVR even without new game records', () => {
  const state=e.createGame('training-reputation','검증','SS'),p=e.getPlayer(state);
  state.calendar.events=[];state.calendar.competitions=[];
  p.performanceReputation=70;p.reputation=e.reputationScore(p);
  const before=p.reputation,ability=e.ovr(p);
  const next=e.advanceWeek(state,p.trainingPolicy,p.stance),after=e.getPlayer(next);
  assert.equal(after.performanceReputation,70);
  assert.ok(after.reputation>before);
  close(after.reputation-before,.6*(e.ovr(after)-ability));
});

test('reputation 100 can lead the draft despite lower OVR and minimum talent', () => {
  const state=e.createGame('reputation-led-draft','검증','SS');
  const seniors=state.players.filter(p=>p.grade===3);
  for(const p of seniors) { for(const k of Object.keys(p.stats)) p.stats[k]=95; p.reputation=50; p.talent={batting:10,pitching:10}; }
  const star=seniors[0];
  for(const k of Object.keys(star.stats)) star.stats[k]=20;
  star.reputation=100; star.talent={batting:1,pitching:1};
  const picks=e.draftPlayers(state);
  assert.equal(picks.length,100);
  assert.equal(picks[0].playerId,star.id);
  assert.equal(picks[0].abilityRank,1000);
});

test('draft score uses exactly reputation 80%, talent 10%, fit 10% with no extra OVR or need bonus', () => {
  const state=e.createGame('draft-score','검증','SP');
  const board=e.draftBoard(state.players);
  const picks=e.draftPlayers(state);
  for(const pick of picks) {
    assert.deepEqual(Object.keys(pick.components).sort(),['fit','reputation','talent']);
    close(pick.components.reputation,.8*pick.reputation);
    close(pick.components.talent,.1*(pick.talent-1)/9*100);
    close(pick.components.fit,.1*pick.fit);
    close(pick.score,Object.values(pick.components).reduce((a,b)=>a+b,0));
    assert.ok(pick.fit>=0 && pick.fit<=100);
    const player=board.find(p=>p.id===pick.playerId);
    close(pick.ability,e.ovr(player));
    assert.equal(pick.abilityRank,board.indexOf(player)+1);
  }
  assert.equal(new Set(picks.map(p=>p.playerId)).size,picks.length);
});

test('talent and role fit can change order among equally reputable prospects', () => {
  const state=e.createGame('draft-fit','검증','C');
  const template=state.players.find(p=>p.grade===3 && p.position==='C');
  state.players=Array.from({length:20},(_,i)=>{
    const p=structuredClone(template);p.id='prospect-'+i;
    for(const k of Object.keys(p.stats))p.stats[k]=i===0?80:20;
    p.reputation=70;p.talent={batting:5,pitching:5};return p;
  });
  assert.equal(e.draftPlayers(structuredClone(state))[0].playerId,'prospect-0');
  for(const p of state.players)for(const k of Object.keys(p.stats))p.stats[k]=50;
  state.players[7].talent={batting:10,pitching:10};
  assert.equal(e.draftPlayers(state)[0].playerId,'prospect-7');
});

test('drafting is deterministic, targets seniors only, and leaves abilities and other RNG streams unchanged', () => {
  const original=e.createGame('draft-isolation','검증','SS');
  const a=structuredClone(original),b=structuredClone(original);
  const picks=e.draftPlayers(a);
  assert.deepEqual(picks,e.draftPlayers(b));
  const seniors=new Set(original.players.filter(p=>p.grade===3).map(p=>p.id));
  assert.ok(picks.every(p=>seniors.has(p.playerId)));
  assert.deepEqual(a.players,original.players);
  for(const stream of Object.keys(original.rngStates).filter(k=>k!=='draft'))assert.equal(a.rngStates[stream],original.rngStates[stream]);
});
