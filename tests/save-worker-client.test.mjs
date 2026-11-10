import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{SaveWorkerClient,SaveWorkerUnavailableError}=require('../.test-build/lib/save-worker-client.js');
class FakeWorker{
  onmessage=null;onerror=null;onmessageerror=null;messages=[];terminated=false;
  postMessage(message){this.messages.push(message);}
  terminate(){this.terminated=true;}
  reply(data){this.onmessage?.({data});}
}

test('sends large state only after readiness, matches reply IDs and reuses a ready worker',async()=>{
  const worker=new FakeWorker(),client=new SaveWorkerClient(()=>worker);let encoded=0;
  const first=client.request(()=>{encoded++;return {state:'snapshot'};});assert.equal(encoded,0);assert.equal(worker.messages.length,0);
  worker.reply({type:'ready'});assert.equal(encoded,1);const id=worker.messages[0].id;worker.reply({id:id+1});worker.reply({id});await first;
  const second=client.request(()=>({deleteId:'career'}));assert.equal(worker.messages.length,2);worker.reply({id:worker.messages[1].id});await second;
});

test('a silent hot-update worker fails startup without encoding and a replacement can recover',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const workers=[],client=new SaveWorkerClient(()=>{const worker=new FakeWorker();workers.push(worker);return worker;},5,20);
  let encoded=false;const failed=assert.rejects(client.request(()=>{encoded=true;return {};}),SaveWorkerUnavailableError);
  t.mock.timers.tick(5);await failed;assert.equal(encoded,false);assert.equal(workers[0].terminated,true);
  const retry=client.request(()=>({state:'latest'}));workers[1].reply({type:'ready'});workers[1].reply({id:workers[1].messages[0].id});await retry;
});

test('migration progress renews the operation deadline instead of timing out an active upgrade',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const worker=new FakeWorker(),client=new SaveWorkerClient(()=>worker,5,20),saved=client.request(()=>({state:'migration'}));
  worker.reply({type:'ready'});const id=worker.messages[0].id;
  for(let i=0;i<4;i++){t.mock.timers.tick(15);worker.reply({id,type:'progress'});assert.equal(worker.terminated,false);}
  worker.reply({id});await saved;
});

test('a worker that stops answering after readiness produces a recoverable transport failure',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const worker=new FakeWorker(),client=new SaveWorkerClient(()=>worker,5,20),failed=assert.rejects(client.request(()=>({state:'save'})),SaveWorkerUnavailableError);
  worker.reply({type:'ready'});t.mock.timers.tick(20);await failed;assert.equal(worker.terminated,true);
});

test('real storage errors remain visible and are not treated as a worker outage',async()=>{
  const worker=new FakeWorker(),client=new SaveWorkerClient(()=>worker),failed=assert.rejects(client.request(()=>({})),error=>!(error instanceof SaveWorkerUnavailableError)&&error.message==='저장 공간 부족');
  worker.reply({type:'ready'});worker.reply({id:worker.messages[0].id,error:'저장 공간 부족'});await failed;
});

test('constructor and message delivery failures are recoverable',async()=>{
  await assert.rejects(new SaveWorkerClient(()=>{throw new Error('stale worker loader');}).request(()=>({})),SaveWorkerUnavailableError);
  const worker=new FakeWorker();worker.postMessage=()=>{throw new Error('channel closed');};
  const client=new SaveWorkerClient(()=>worker),failed=assert.rejects(client.request(()=>({})),SaveWorkerUnavailableError);worker.reply({type:'ready'});await failed;assert.equal(worker.terminated,true);
});
