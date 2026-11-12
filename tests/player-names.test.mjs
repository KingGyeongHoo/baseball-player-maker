import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const n=require('../.test-build/lib/sim/player-names.js');
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const {addRookieClass}=require('../.test-build/lib/sim/pro-season.js');
const valid=name=>n.surnamePool.some(surname=>name.startsWith(surname)&&n.givenNamePool.includes(name.slice(surname.length)));
const total=n.surnamePopulations.reduce((a,b)=>a+b,0);

test('pools contain 100 ranked weighted surnames and 724 unique supplied given names',()=>{
  for(const [pool,size] of [[n.surnamePool,100],[n.givenNamePool,724]]){assert.equal(pool.length,size);assert.equal(new Set(pool).size,size);}
  assert.equal(n.surnamePopulations.length,100);
  assert.deepEqual(n.surnamePool.slice(0,3),['김','이','박']);
  assert.ok(n.surnamePopulations.every((v,i)=>Number.isInteger(v)&&v>0&&(!i||n.surnamePopulations[i-1]>=v)));
  assert.ok(n.givenNamePool.every(s=>/^[가-힣]{1,3}$/.test(s)));
  for(const name of ['다니엘','성문','자욱','종진','수종','준완','동열','종범','효조','한이']) assert.ok(n.givenNamePool.includes(name));
  assert.ok(n.givenNamePool.some(s=>s.length===1));
});

test('every surname receives its population interval and the extreme draws remain valid',()=>{
  let start=0;
  for(let i=0;i<100;i++){
    const roll=(start+n.surnamePopulations[i]/2)/total;let calls=0;
    assert.equal(n.generatePlayerName(()=>calls++===0?roll:0),n.surnamePool[i]+n.givenNamePool[0]);
    assert.equal(calls,2);start+=n.surnamePopulations[i];
  }
  assert.equal(n.generatePlayerName(()=>0),n.surnamePool[0]+n.givenNamePool[0]);
  assert.equal(n.generatePlayerName(()=>1-Number.EPSILON),n.surnamePool.at(-1)+n.givenNamePool.at(-1));
  let calls=0;
  assert.equal(n.generatePlayerName(()=>calls++===0?(n.surnamePopulations[0]+.5)/total:0),'이'+n.givenNamePool[0]);
});

test('each complete given name has an equal interval, including single-syllable names',()=>{
  for(let i=0;i<n.givenNamePool.length;i++){
    let calls=0;const result=n.generatePlayerName(()=>calls++===0?0:(i+.5)/n.givenNamePool.length);
    assert.equal(calls,2);assert.equal(result,'김'+n.givenNamePool[i]);
  }
});

test('population weighting produces common surnames more often across deterministic samples',()=>{
  const counts=new Map();
  for(let i=0;i<50000;i++){
    const name=n.seededPlayerName('distribution:'+i);
    // The first three surnames are one syllable and cannot prefix a compound surname.
    const surname=name[0];counts.set(surname,(counts.get(surname)??0)+1);
  }
  assert.ok(counts.get('김')>counts.get('이')&&counts.get('이')>counts.get('박'));
  for(let i=0;i<3;i++)assert.ok(Math.abs(counts.get(n.surnamePool[i])/50000-n.surnamePopulations[i]/total)<.01);
});

test('names replay by seed, allow duplicates and keep compound surnames intact',()=>{
  assert.equal(n.seededPlayerName('same'),n.seededPlayerName('same'));
  assert.equal(n.generatePlayerName(()=>0),n.generatePlayerName(()=>0));
  const i=n.surnamePool.findIndex(s=>s.length===2),prefix=n.surnamePopulations.slice(0,i).reduce((a,b)=>a+b,0);
  let calls=0;assert.equal(n.generatePlayerName(()=>calls++===0?(prefix+n.surnamePopulations[i]/2)/total:0),n.surnamePool[i]+n.givenNamePool[0]);
  assert.ok(Array.from({length:3000},(_,i)=>n.seededPlayerName('sample:'+i)).every(valid));
});

test('high school, yearly intake, college, pro roster and pro rookies all use the shared pools',()=>{
  const s=e.createGame('name-integration','사용자','SS');
  assert.equal(e.getPlayer(s).name,'사용자');assert.ok(s.players.filter(p=>p.id!==s.playerId).every(p=>valid(p.name)));
  const old=new Set(s.players.map(p=>p.id));e.promote(s);
  assert.ok(s.players.filter(p=>!old.has(p.id)).every(p=>valid(p.name)));
  const graduate=e.createGame('name-college','대학생','SS');const p=e.getPlayer(graduate);p.grade=3;graduate.phase='ended';graduate.date=graduate.calendar.draftDate;graduate.draftOutcome={revealed:true,offer:null};
  const college=pc.continueCareer(graduate,'college');assert.ok(college.players.filter(p=>p.id!==college.playerId).every(p=>valid(p.name)));
  const pro=pc.createProfessionalDemo('name-pro','프로선수','SS');assert.ok(pro.players.filter(p=>p.id!==pro.playerId).every(p=>valid(p.name)));
  const existing=new Map(pro.players.map(p=>[p.id,p.name]));addRookieClass(pro,pro.calendar.seasonYear+1);
  const rookies=pro.players.filter(p=>!existing.has(p.id));assert.ok(rookies.length>0);assert.ok(rookies.every(p=>valid(p.name)));
  assert.ok(pro.players.filter(p=>existing.has(p.id)).every(p=>p.name===existing.get(p.id)));
});
