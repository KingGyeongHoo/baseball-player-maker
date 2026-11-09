import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const j=require('../.test-build/lib/jersey-numbers.js'),r=require('../.test-build/lib/roster-status.js');
const creation=require('../.test-build/lib/player-creation.js'),save=require('../.test-build/lib/career-save.js');
const entropy=seed=>({randomUUID:()=>seed,getRandomValues:a=>{a[0]=0;return a;}});
test('club rename preserves numeric identities and migrates the shared old/new Changwon name exactly once',()=>{
  const {syncProClubNames,proClubNames}=require('../.test-build/lib/sim/club-names.js');
  assert.deepEqual(proClubNames,['서울 베어스','서울 트윈스','고양 히어로즈','인천 랜더스','수원 위즈','대전 이글스','광주 타이거즈','대구 라이온즈','창원 다이노스','부산 자이언츠']);
  const s={careerMode:'pro',teams:Array.from({length:20},(_,id)=>({id,name:'old',shortName:'old'})),players:[{career:[{careerMode:'pro',schoolId:7,schoolName:'창원 다이노스 1군'}]}],draft:[{club:'창원 다이노스'},{club:'청주 이글스'}],postSchool:{collegeDraft:[{club:'서울 파이오니어스'}]},proWorld:{archive:[],seasons:[{draft:[{club:'부산 웨이브스'}]}]},rngStates:{draft:123}};
  syncProClubNames(s);assert.equal(s.teams[0].name,'서울 베어스 1군');assert.equal(s.teams[1].shortName,'서울 트윈스 1군');assert.equal(s.teams[18].name,'창원 다이노스 2군');
  assert.deepEqual(s.draft.map(p=>p.club),['대구 라이온즈','창원 다이노스']);assert.equal(s.players[0].career[0].schoolName,'대구 라이온즈 1군');assert.deepEqual(s.rngStates,{draft:123});
  const renamed=structuredClone(s);assert.equal(syncProClubNames(s),false);assert.deepEqual(s,renamed);
  const old=e.createGame('club-save-migration','구단변경','SS');delete old.proClubNamesVersion;old.draft=[{club:'창원 다이노스'}];const file=save.encodeCareerSave(old),restored=save.decodeCareerSave(JSON.stringify(file));
  assert.equal(restored.state.draft[0].club,'대구 라이온즈');assert.equal(restored.checksum,save.saveChecksum(JSON.stringify(restored.state)));assert.deepEqual(restored.state.rngStates,old.rngStates);
});
function schools(s){
  for(const team of s.teams){const roster=s.players.filter(p=>p.teamId===team.id),slots=r.startingAssignments(roster);
    assert.equal(new Set(roster.map(p=>p.jerseyNumber)).size,roster.length);
    for(const [slot,n] of Object.entries(j.schoolStarterNumbers)){const p=roster.find(p=>slots.get(p.id)===slot);assert.ok(p,`${team.id} ${slot}`);assert.equal(p.jerseyNumber,n);}
  }
}
test('every school assigns all ten fixed starter numbers, with unique reserve numbers and freshmen on the bench',()=>{
  const s=e.createGame('jersey-world','신입생','SP'),p=e.getPlayer(s);schools(s);assert.ok(p.jerseyNumber>=11&&p.jerseyNumber<=23);assert.ok(!r.rosterAssignments(s.players).has(p.id));
});
test('the chosen freshman number is preserved while a conflicting teammate receives another number',()=>{
  const s=creation.createRandomCareer('희망번호','SS',entropy('jersey-custom'),23);assert.equal(e.getPlayer(s).jerseyNumber,23);schools(s);
});
test('actual weekly progress promotes a strong freshman and reassigns the old starter, then handles demotion',()=>{
  const s=e.createGame('jersey-promotion','주전도전','SS'),p=e.getPlayer(s);s.calendar.events=[];s.calendar.competitions=[];s.trainingFocus={rng:1,rolledWeek:s.week};
  for(const k of Object.keys(p.stats))p.stats[k]=100;
  let next=e.advanceWeek(s,p.trainingPolicy,p.stance);assert.equal(e.getPlayer(next).jerseyNumber,6);schools(next);
  const q=e.getPlayer(next);for(const k of Object.keys(q.stats))q.stats[k]=1;
  j.syncJerseyNumbers(next);assert.ok(q.jerseyNumber>=11&&q.jerseyNumber<=23);schools(next);
});
test('graduation and incoming freshmen preserve full starter coverage and unique numbers',()=>{
  const s=e.createGame('jersey-graduation','진급','CP');e.promote(s);schools(s);assert.ok(s.players.filter(p=>p.grade===1).every(p=>p.jerseyNumber>=11));
});
test('number sync is deterministic, idempotent and consumes no simulation random streams',()=>{
  const s=e.createGame('jersey-stable','보존','C'),rng={...s.rngStates},before=structuredClone(s);j.syncJerseyNumbers(s);assert.deepEqual(s,before);assert.deepEqual(s.rngStates,rng);
});
test('random rerolls obey each mode range and always change the previous number',()=>{
  assert.equal(j.randomJerseyNumber('school',11,()=>0),12);assert.equal(j.randomJerseyNumber('pro',99,()=>.99999),98);
  for(let i=0;i<100;i++)for(const mode of ['school','pro']){const n=j.randomJerseyNumber(mode,null,()=>i/100);assert.ok(n>=(mode==='school'?11:1)&&n<=(mode==='school'?23:99));}
});
test('direct pro starts accept every position, preserve the selected number and use varied rookie skills without invented school records',()=>{
  const values=[];
  for(const [i,pos] of ['C','3B','RP','CP'].entries()){
    const s=creation.createRandomProCareer('프로신인',pos,7,entropy(`jersey-pro-${i}`)),p=e.getPlayer(s);values.push(e.overall(p));
    assert.equal(s.careerMode,'pro');assert.equal(p.position,pos);assert.equal(p.jerseyNumber,7);assert.equal(p.professional.entry,'direct');assert.equal(p.career.length,0);assert.equal(s.draft.length,0);assert.ok(e.overall(p)>=41&&e.overall(p)<=69);
    assert.equal(p.proContract.status,e.roleScore(p)<e.params['pro.second_mean']?'developmental':'regular');
    for(let club=0;club<10;club++){const players=s.players.filter(p=>p.teamId>=0&&p.teamId%10===club);assert.equal(new Set(players.map(p=>p.jerseyNumber)).size,players.length);assert.ok(players.every(p=>p.jerseyNumber>=1&&p.jerseyNumber<=99));}
  }
  assert.ok(new Set(values).size>1);
});
test('save round trips preserve numbers and legacy saves gain numbers after checksum verification',()=>{
  const s=e.createGame('jersey-save','보관','CF'),file=save.encodeCareerSave(s);assert.deepEqual(save.decodeCareerSave(JSON.stringify(file)).state,s);
  for(const p of s.players){delete p.jerseyNumber;delete p.jerseyKind;delete p.freshmanReserve;}
  const raw=JSON.stringify(save.encodeCareerSave(s)),restored=save.decodeCareerSave(raw);schools(restored.state);assert.equal(JSON.parse(raw).state.players[0].jerseyNumber,undefined);assert.equal(restored.checksum,save.saveChecksum(JSON.stringify(restored.state)));
});
