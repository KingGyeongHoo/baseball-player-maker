import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{submitChoice}=require('../.test-build/lib/choice-submission.js');

test('a choice rejected by a busy or stale parent remains retryable on the same event',()=>{
  const latch={current:false};let calls=0;
  assert.equal(submitChoice(latch,false,()=>{calls++;return false;}),false);assert.equal(latch.current,false);
  assert.equal(submitChoice(latch,false,()=>{calls++;return true;}),true);assert.equal(calls,2);
});
test('disabled choices do not acquire the duplicate-click latch',()=>{
  const latch={current:false};let calls=0;assert.equal(submitChoice(latch,true,()=>{calls++;return true;}),false);assert.equal(latch.current,false);assert.equal(calls,0);
  assert.equal(submitChoice(latch,false,()=>{calls++;return true;}),true);assert.equal(calls,1);
});
test('resolver exceptions release the latch and do not silently freeze all choices',()=>{
  const latch={current:false};assert.throws(()=>submitChoice(latch,false,()=>{throw new Error('retry');}),/retry/);assert.equal(latch.current,false);assert.equal(submitChoice(latch,false,()=>true),true);
});
test('accepted choices still reject duplicate and reentrant submissions',()=>{
  const latch={current:false};let calls=0;
  const choose=()=>{calls++;assert.equal(submitChoice(latch,false,()=>{calls++;return true;}),false);return true;};
  assert.equal(submitChoice(latch,false,choose),true);assert.equal(submitChoice(latch,false,choose),false);assert.equal(calls,1);
  latch.current=false;assert.equal(submitChoice(latch,false,()=>{calls++;return true;}),true);assert.equal(calls,2);
});
