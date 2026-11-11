import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const save=require('../.test-build/lib/career-save.js'),{careerSaveId}=require('../.test-build/lib/career-save-key.js');
const {LatestSaveQueue,CareerSaveQueue}=require('../.test-build/lib/latest-save-queue.js');
const template=e.createGame('save-slot-test','같은이름','SS');template.players=[e.getPlayer(template)];template.calendar.events=[];

test('one career keeps the same slot across automatic, manual, renamed and later saves',()=>{
  const state=structuredClone(template),first=save.encodeCareerSave(state,false,'2026-11-10T01:00:00Z');
  state.date='2028-04-01';e.getPlayer(state).name='바뀐이름';
  const later=save.encodeCareerSave(state,true,'2026-11-10T02:00:00Z');
  assert.equal(later.id,first.id);assert.equal(later.manual,true);assert.equal(later.name,'바뀐이름');assert.notEqual(later.checksum,first.checksum);
  assert.notEqual(careerSaveId({...state,seed:'another-career'}),first.id);assert.notEqual(careerSaveId({...state,playerId:'another-player'}),first.id);
});

test('legacy auto, manual and imported file identities still decode without changing player data',()=>{
  const file=save.encodeCareerSave(template);
  for(const id of ['auto:old:player','manual:old:player:timestamp','manual:import:manual:old:player:timestamp']){
    const restored=save.decodeCareerSave(JSON.stringify({...file,id}));assert.deepEqual(restored.state,template);assert.equal(careerSaveId(restored.state),file.id);
  }
});

test('deletion replaces queued saves and follows any write already running for the same career',async()=>{
  const writes=[],gates=[],queue=new LatestSaveQueue(job=>{writes.push(job);return new Promise(resolve=>gates.push(resolve));});
  const first=queue.enqueue('career-a',{save:1}),pending=queue.enqueue('career-a',{save:2}),deleted=queue.enqueue('career-a',{deleteId:'career-a'}),other=queue.enqueue('career-b',{save:3});
  assert.deepEqual(writes,[{save:1}]);gates.shift()();await first;
  assert.deepEqual(writes,[{save:1},{deleteId:'career-a'}]);gates.shift()();await Promise.all([pending,deleted]);
  assert.deepEqual(writes,[{save:1},{deleteId:'career-a'},{save:3}]);gates.shift()();await other;
});

test('reset deletion follows an in-flight save, drops stale autosaves and keeps other careers untouched',async()=>{
 const writes=[],gates=[],queue=new CareerSaveQueue(job=>{writes.push(job);return new Promise(resolve=>gates.push(resolve));});
 const state=structuredClone(template),id=careerSaveId(state),other={...state,seed:'other-retired-career'};
 const first=queue.save(state),pending=queue.save({...state,date:'2027-05-01'}),deletion=queue.delete(id);
 assert.equal(await queue.save({...state,date:'2027-05-02'}),false);
 gates.shift()();await first;assert.deepEqual(writes[1],{deleteId:id});gates.shift()();await Promise.all([pending,deletion]);
 assert.equal(writes.length,2);assert.equal(await queue.save(state),false);
 const preserved=queue.save(other);gates.shift()();assert.equal(await preserved,true);assert.equal(writes[2].state.seed,other.seed);
 const manual=queue.save(state,true);gates.shift()();assert.equal(await manual,true);
 const resumed=queue.save(state);gates.shift()();assert.equal(await resumed,true);
});

test('failed reset deletion leaves the career available for saving and retry',async()=>{
 let fail=true;const writes=[],queue=new CareerSaveQueue(async job=>{if('deleteId' in job&&fail)throw Error('삭제 실패');writes.push(job);});
 await assert.rejects(queue.delete(careerSaveId(template)),/삭제 실패/);assert.equal(await queue.save(template),true);
 fail=false;await queue.delete(careerSaveId(template));assert.equal(await queue.save(template),false);assert.equal(writes.length,2);
});
