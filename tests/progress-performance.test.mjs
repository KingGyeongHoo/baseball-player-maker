import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const {packRecentRecord,mergeRecentRecord,recentSample}=require('../.test-build/lib/sim/recent-records.js');
const {StateTransferCache}=require('../.test-build/lib/sim/state-transfer.js');
const {workerStateInput,restoreWorkerState}=require('../.test-build/lib/sim/worker-state.js');
const {LatestSaveQueue}=require('../.test-build/lib/latest-save-queue.js');

test('recent evaluation reuse invalidates after real appearances, capped histories and role changes',()=>{
  const state=e.createGame('recent-cache-validation','평가확인','SS'),cache=new Map();state.players=state.players.slice(0,8);
  const check=()=>{const expected=structuredClone(state);e.updateReputation(expected);e.updateReputation(state,cache);assert.deepEqual(state,expected);};
  check();check();
  const p=state.players[0],record=e.emptyRecord();record.batting.PA=record.batting.AB=4;record.batting.H=2;record.pitching.BF=4;record.pitching.outs=3;
  p.recentAppearances.push(packRecentRecord(record));check();
  p.recentAppearances.shift();p.recentAppearances.push(packRecentRecord({...record,batting:{...record.batting,H:4}}));check();
  p.primaryRole='선발';check();p.recentAppearances=structuredClone(p.recentAppearances);check();
});

test('lightweight stored evaluations preserve full-report inputs and tied cohort ranks',()=>{
  const evaluation=require('../.test-build/lib/sim/player-evaluation.js'),pc=require('../.test-build/lib/sim/pro-career.js');
  for(const state of [e.createGame('light-report-school','평가확인','SS'),pc.acknowledgeCareer(pc.createProfessionalDemo('light-report-pro','평가확인','SP'))]){
    const p=e.getPlayer(state),peer=state.players.find(q=>q.id!==p.id&&q.grade===p.grade&&q.primaryRole===p.primaryRole);if(peer)peer.stats={...p.stats};
    const context=evaluation.buildEvaluationContext(state),full=evaluation.createPlayerEvaluation(state,p,context,'monthly');
    full.id+=`:${e.hash(JSON.stringify([full.stats,full.records,full.role,full.position,full.teamId,full.eligiblePositions,full.twoWay,full.health]))}`;
    const observation=evaluation.createPlayerObservation(state,p,context,'monthly','test-context');
    assert.deepEqual(observation,evaluation.compactEvaluation(full,'test-context'));
    if(!state.careerMode)for(const tool of full.tools.filter(t=>t.cohortRank!==undefined)){
      const field=['velocity','control','movement'].includes(tool.stat)?'pitching':['contact','power','speed','defense'].includes(tool.stat)?'batting':e.isPitcher(p.primaryRole)?'pitching':'batting';
      const values=context.cohorts.get(`${p.grade}:${field}`).get(tool.stat).values;
      assert.equal(tool.cohortRank,1+values.filter(v=>v>tool.value).length);
    }
  }
});

test('recent records retain every stat and read legacy, packed and mixed records identically',()=>{
  const old=e.emptyRecord();let value=0;
  for(const group of Object.values(old))for(const key of Object.keys(group))group[key]=++value;
  const packed=packRecentRecord(old),restored=e.emptyRecord();mergeRecentRecord(restored,packed);
  assert.deepEqual(restored,old);assert.equal(recentSample(packed,false),old.batting.PA);assert.equal(recentSample(packed,true),old.pitching.outs);
  const mixed=e.emptyRecord();mergeRecentRecord(mixed,old);mergeRecentRecord(mixed,packed);
  for(const group of ['batting','pitching'])for(const key of Object.keys(old[group]))assert.equal(mixed[group][key],old[group][key]*2);
  assert.ok(JSON.stringify(packed).length<JSON.stringify(old).length/2);
});

test('state transfer reuses only unchanged histories, retains edits, removes departed players and resets on new connections',()=>{
  const sender=new StateTransferCache(),receiver=new StateTransferCache();
  const calendar={events:[]},history=[{id:'entry',stats:{power:40}}],first={calendar,players:[{id:'a',evaluationHistory:history},{id:'b',evaluationHistory:[{id:'other'}]}]};
  const received=receiver.decode(structuredClone(sender.encode(first)));
  const second={calendar,players:[{id:'a',evaluationHistory:history,fatigue:20}]},packet=sender.encode(second);
  assert.deepEqual(packet.reusedHistories,['a']);assert.equal(packet.state.players[0].evaluationHistory,undefined);
  const decoded=receiver.decode(structuredClone(packet));assert.deepEqual(decoded,second);assert.equal(decoded.players[0].evaluationHistory,received.players[0].evaluationHistory);
  const edited={calendar,players:[{id:'a',evaluationHistory:[...history,{id:'monthly'}]}]},updated=sender.encode(edited);
  assert.deepEqual(updated.reusedHistories,[]);assert.deepEqual(receiver.decode(structuredClone(updated)),edited);
  assert.deepEqual(new StateTransferCache().encode(second).reusedHistories,[]);
  assert.throws(()=>new StateTransferCache().decode(structuredClone(packet)),/동기화/);
  assert.deepEqual(receiver.decode(structuredClone(sender.encode({calendar,players:[{id:'a'}]}))),{calendar,players:[{id:'a'}]});
});

test('completed games are reused while live games, new rounds, edits and season rollover remain exact',()=>{
  const sender=new StateTransferCache(),receiver=new StateTransferCache();
  const finished={id:'done',status:'completed',score:[3,1]},live={id:'live',status:'inProgress',score:[0,0]};
  const state={players:[],calendar:{events:[finished,live]}};
  const initial=receiver.decode(structuredClone(sender.encode(state)));
  live.score[0]=1;state.calendar.events.push({id:'new',status:'scheduled',score:[0,0]});
  const packet=sender.encode(state);assert.deepEqual(packet.gameOrder,['done','live','new']);assert.equal(packet.state.calendar.events.length,2);
  const next=receiver.decode(structuredClone(packet));assert.deepEqual(next,state);assert.equal(next.calendar.events[0],initial.calendar.events[0]);
  state.calendar.events[0]={...finished,score:[4,1]};
  assert.deepEqual(receiver.decode(structuredClone(sender.encode(state))),state);
  const season={players:[],calendar:{events:[{id:'next-season',status:'scheduled'}]}};
  assert.deepEqual(receiver.decode(structuredClone(sender.encode(season))),season);
  assert.throws(()=>receiver.decode(structuredClone(packet)),/경기 기록/);
});

test('a failed or edited worker request resends the last committed state; new workers never reuse another worker state',()=>{
  const worker={},state={players:[],calendar:{events:[]}};
  assert.equal(workerStateInput(worker,state),state);
  restoreWorkerState(worker,state);
  assert.equal(workerStateInput(worker,state),undefined);
  assert.equal(workerStateInput(worker,state),state); // No success reply after failure.
  restoreWorkerState(worker,state);
  const edit={...state};assert.equal(workerStateInput(worker,edit),edit);
  restoreWorkerState(worker,state);assert.equal(workerStateInput({},state),state);
});

test('slow saves coalesce pending weeks, keep other careers, and settle only when persisted',async()=>{
  const writes=[],gates=[];
  const queue=new LatestSaveQueue(value=>{writes.push(value);return new Promise((resolve,reject)=>gates.push({resolve,reject}));});
  let saved=false;
  const first=queue.enqueue('a',1),second=queue.enqueue('a',2).then(()=>{saved=true;}),third=queue.enqueue('a',3),other=queue.enqueue('b',4);
  assert.deepEqual(writes,[1]);gates[0].resolve();await first;
  assert.deepEqual(writes,[1,3]);assert.equal(saved,false);
  gates[1].resolve();await Promise.all([second,third]);assert.equal(saved,true);assert.deepEqual(writes,[1,3,4]);
  gates[2].resolve();await other;
  const failed=queue.enqueue('a',5),rejected=assert.rejects(failed,/disk/),retry=queue.enqueue('a',6);
  gates[3].reject(new Error('disk'));await rejected;gates[4].resolve();await retry;
});

test('real worker continuation, UI edits and error recovery match immutable simulation results',async t=>{
  const worker=new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    global.self={postMessage:message=>parentPort.postMessage(message)};
    require(workerData);
    parentPort.on('message',data=>self.onmessage({data}));
  `,{eval:true,workerData:fileURLToPath(new URL('../.test-build/lib/sim/worker.js',import.meta.url))});
  t.after(()=>worker.terminate());
  const send=data=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data);});
  let state=e.createGame('worker-performance','연속진행','SS');
  // Quiet offseason gives multiple uninterrupted weeks, with legacy records too.
  state.date='2027-01-04';
  const me=e.getPlayer(state);me.recentAppearances=[e.emptyRecord()];
  const policy={...me.trainingPolicy,mode:'rest'};policy.tickets=Object.fromEntries(Object.keys(policy.tickets).map(key=>[key,0]));
  for(let step=0;step<3;step++){
    if(step===2)state={...state,seed:state.seed+'-edited'};
    const before=structuredClone(state),expected=e.advanceWeek(state,policy,e.getPlayer(state).stance);
    const reply=await send({requestId:step,state:workerStateInput(worker,state),policy,stance:e.getPlayer(state).stance});
    assert.equal(reply.error,undefined);state=restoreWorkerState(worker,reply.result,reply.reusedHistories,reply.gameOrder);
    delete state.report.processingMs;
    assert.deepEqual(state,expected);assert.deepEqual(before.players[0].stats,expected.players[0].stats);
    if(step===1)assert.ok(reply.reusedHistories.length>0);
  }
  const invalid=await send({requestId:4,state:workerStateInput(worker,state),policy:{...policy,tickets:{...policy.tickets,contact:999}},stance:e.getPlayer(state).stance});
  assert.ok(invalid.error);
  assert.equal(workerStateInput(worker,state),state);
  const expected=e.advanceWeek(state,policy,e.getPlayer(state).stance);
  const recovered=await send({requestId:5,state,policy,stance:e.getPlayer(state).stance});
  const result=restoreWorkerState(worker,recovered.result,recovered.reusedHistories,recovered.gameOrder);delete result.report.processingMs;
  assert.deepEqual(result,expected);
});
