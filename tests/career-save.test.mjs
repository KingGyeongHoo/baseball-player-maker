import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const save=require('../.test-build/lib/career-save.js'),{careerSaveId}=require('../.test-build/lib/career-save-key.js');
const {LatestSaveQueue}=require('../.test-build/lib/latest-save-queue.js');
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
