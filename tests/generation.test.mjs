import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
test('school upperclassmen retain exactly the same weekly training history after batching constant factors',()=>{
  const state=e.createGame('school-training-history','초기 성장','SS');
  for(const player of state.players.filter(p=>p.grade>1).slice(0,100)){
    const replay=structuredClone(player);replay.stats={...player.initialStats};replay.talentExposure={batting:0,pitching:0};
    for(let week=0;week<40*(player.grade-1);week++)e.train(replay,e.params['training.days']*.85);
    assert.deepEqual(player.stats,replay.stats,player.id);assert.deepEqual(player.talentExposure,replay.talentExposure,player.id);
  }
});
test('standalone and professional NPC generation do not allocate unused season calendars',()=>{
  const calendar=require('../.test-build/lib/sim/calendar.js'),original=calendar.buildCalendar;let calls=0;
  calendar.buildCalendar=(...args)=>{calls++;return original(...args);};
  try{
    for(const position of ['SP','RP','CP','C','SS','LF']){e.previewPlayer('preview-calendar',position,position);createCareerNPC(`npc-calendar:${position}`,0,0,'pro',true,position);}
    assert.equal(calls,0);
    const state=e.createGame('actual-calendar','시즌 생성','SS');assert.equal(calls,1);assert.ok(state.calendar.events.length>0);
  }finally{calendar.buildCalendar=original;}
});
const {talentIntake,talentFromRoll}=require('../.test-build/lib/sim/talent-generation.js');
const {createCareerNPC}=require('../.test-build/lib/sim/pro-roster.js');
const {positionCohort,schoolPositionIntake}=require('../.test-build/lib/sim/position-generation.js');
const positionGroup=position=>position==='SP'?'starter':['RP','CP'].includes(position)?'bullpen':position==='C'?'catcher':['1B','2B','3B','SS'].includes(position)?'infield':['LF','CF','RF'].includes(position)?'outfield':'other';
const positionCounts=positions=>positions.reduce((counts,position)=>{counts[positionGroup(position)]++;return counts;},{starter:0,bullpen:0,catcher:0,infield:0,outfield:0,other:0});
const positionRandom=seed=>{const source={rngStates:{generation:e.hash(seed),training:0,match:0,injury:0,draft:0,events:0}};return()=>e.random(source,'generation');};
const expectedPositions={starter:175,bullpen:325,catcher:100,infield:200,outfield:200,other:0};
const pitching = ['velocity', 'control', 'movement'];
const batting = ['contact', 'power', 'speed', 'defense'];
const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;
const initialOvr = (p, pitch) => e.ovr({ ...p, stats: p.initialStats }, pitch);
const talents=(players,secondary=false)=>players.map(p=>p.talent[e.isPitcher(p.primaryRole)!==secondary?'pitching':'batting']);
const histogram=values=>Array.from({length:11},(_,i)=>values.filter(n=>n===i).length);

test('every fresh school class has exactly the descending 1,000-player talent intake in both primary and secondary skills',()=>{
 const s=e.createGame('pyramid-intake','피라미드','SP');
 assert.equal(talentIntake.reduce((sum,n)=>sum+n,0),1000);
 for(let i=1;i<talentIntake.length;i++)assert(talentIntake[i]<talentIntake[i-1]);
 for(const grade of [1,2,3])for(const secondary of [false,true])assert.deepEqual(histogram(talents(s.players.filter(p=>p.grade===grade),secondary)),[...talentIntake]);
 const main=talents(s.players.filter(p=>p.grade===1));assert.equal(mean(main),2.305);
});

test('new annual school intake uses the pyramid without rerolling surviving or saved players',()=>{
 const s=e.createGame('pyramid-next-year','보존','SS'),old=new Map(s.players.map(p=>[p.id,{...p.talent}]));
 const p=e.getPlayer(s);p.talent={batting:10,pitching:10};old.set(p.id,{...p.talent});
 const save=require('../.test-build/lib/career-save.js'),restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
 assert.deepEqual(e.getPlayer(restored).talent,{batting:10,pitching:10});
 e.promote(restored);const incoming=restored.players.filter(p=>!old.has(p.id));
 assert.equal(incoming.length,1000);for(const secondary of [false,true])assert.deepEqual(histogram(talents(incoming,secondary)),[...talentIntake]);
 for(const player of restored.players.filter(p=>old.has(p.id)))assert.deepEqual(player.talent,old.get(player.id));
});

test('standalone and professional NPC generation use the same rare high-talent probabilities without elite-school inflation',()=>{
 assert.deepEqual(histogram(Array.from({length:1000},(_,i)=>talentFromRoll((i+.5)/1000))),[...talentIntake]);
 const players=Array.from({length:1000},(_,i)=>createCareerNPC(`pyramid-pro-${i}`,i%20,i,'pro',i%20<10,i%2?'SP':'SS'));
 const values=talents(players),counts=histogram(values);assert(mean(values)>2&&mean(values)<2.6);assert(counts[9]<20);assert(counts[0]>counts[4]&&counts[4]>counts[9]);
});

test('professional annual rookies are selected from a pyramid cohort rather than 1,000 elite-school rolls',()=>{
 const pc=require('../.test-build/lib/sim/pro-career.js'),life=require('../.test-build/lib/sim/pro-season.js');
 const s=pc.createProfessionalDemo('pyramid-pro-rookies','검증','SS'),old=new Map(s.players.map(p=>[p.id,{...p.talent}]));
 const expected=positionCohort(1000,positionRandom(`${s.seed}:graduate-positions:2029`));
 life.addRookieClass(s,2029);const rookies=s.players.filter(p=>p.id.startsWith('pro-rookie-2029-'));
 assert.deepEqual(positionCounts(expected),expectedPositions);for(const p of rookies)assert.equal(p.position,expected[Number(p.id.split('-').at(-1))]);
 assert(rookies.length>=90&&rookies.length<=110);assert(talents(rookies).filter(n=>n===10).length<=5);assert(talents(rookies).filter(n=>n>=8).length<=45);
 for(const p of s.players.filter(p=>old.has(p.id)))assert.deepEqual(p.talent,old.get(p.id));
 const snapshot=rookies.map(p=>[p.id,p.talent,p.stats]);life.addRookieClass(s,2029);assert.deepEqual(s.players.filter(p=>p.id.startsWith('pro-rookie-2029-')).map(p=>[p.id,p.talent,p.stats]),snapshot);
});

test('combined OVR adds both disciplines, exceeds 100 for two-way players, and is role independent', () => {
  const template = e.previewPlayer('combined-ovr', '검증', 'SS');
  for (const [pitch, bat, expected] of [[10, 90, 100], [80, 15, 95], [75, 80, 155], [100, 100, 200]]) {
    const p = structuredClone(template);
    for (const key of pitching) p.stats[key] = pitch;
    for (const key of batting) p.stats[key] = bat;
    assert.equal(e.combinedOvr(p), expected);
    p.primaryRole = '선발';
    assert.equal(e.combinedOvr(p), expected);
    assert.equal(e.ovr(p), pitch);
    p.primaryRole = '코너 야수';
    assert.equal(e.ovr(p), bat);
  }
});

test('secondary generation preserves the main abilities, common stats, talent and global RNG stream', () => {
  const chance = e.params['generation.two_way_chance'];
  try {
    for (const position of ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP', 'CP']) {
      e.params['generation.two_way_chance'] = 0;
      const ordinary = e.previewPlayer('generation-isolation', '검증', position);
      e.params['generation.two_way_chance'] = 1;
      const exception = e.previewPlayer('generation-isolation', '검증', position);
      const main = e.isPitcher(ordinary.primaryRole) ? pitching : batting;
      const secondary = e.isPitcher(ordinary.primaryRole) ? batting : pitching;
      for (const key of [...main, 'stamina', 'recovery', 'arm', 'bq']) assert.equal(ordinary.stats[key], exception.stats[key], position + ':' + key);
      assert.deepEqual(ordinary.talent, exception.talent);
      assert.notDeepEqual(secondary.map(k => ordinary.stats[k]), secondary.map(k => exception.stats[k]));
      assert.deepEqual(ordinary.initialStats, ordinary.stats);
      assert.deepEqual(exception.initialStats, exception.stats);
    }
    e.params['generation.two_way_chance'] = 0;
    const ordinary = e.createGame('generation-stream-isolation', '검증', 'SP');
    e.params['generation.two_way_chance'] = 1;
    const exception = e.createGame('generation-stream-isolation', '검증', 'SP');
    assert.deepEqual(ordinary.rngStates, exception.rngStates);
    assert.deepEqual(ordinary.players.map(p => [p.id, p.name, p.talent]), exception.players.map(p => [p.id, p.name, p.talent]));
  } finally {
    e.params['generation.two_way_chance'] = chance;
  }
});

test('fresh generation keeps primary average near 40 and secondary average near 15 across player and NPC positions', () => {
  const groups = { pitcher: { main: [], secondary: [] }, batter: { main: [], secondary: [] } };
  for (let seed = 0; seed < 3; seed++) {
    const state = e.createGame('role-distribution-' + seed, '검증', seed % 2 ? 'SP' : 'SS');
    for (const p of state.players) {
      const pitch = e.isPitcher(p.primaryRole);
      const group = groups[pitch ? 'pitcher' : 'batter'];
      group.main.push(initialOvr(p, pitch));
      group.secondary.push(initialOvr(p, !pitch));
      assert.ok(Object.values(p.initialStats).every(n => n >= 1 && n <= 100));
      assert.ok(Number.isFinite(e.combinedOvr(p)) && e.combinedOvr(p) <= 200);
    }
    const me = e.getPlayer(state);
    assert.equal(state.history[0].ovr, e.overall(me));
    assert.equal(state.history[0].ovrScale,100);
    assert.deepEqual(me.initialStats, me.stats);
    assert.deepEqual(state, e.createGame('role-distribution-' + seed, '검증', seed % 2 ? 'SP' : 'SS'));
  }
  for (const [kind, group] of Object.entries(groups)) {
    assert.ok(Math.abs(mean(group.main) - e.params['generation.mean']) < 1, kind + ' primary mean ' + mean(group.main));
    assert.ok(Math.abs(mean(group.secondary) - 15) < 0.5, kind + ' secondary mean ' + mean(group.secondary));
    assert.ok(group.secondary.filter(n => n >= 30).length / group.secondary.length < 0.01, kind + ' exceptions stay rare');
  }
});

test('rare generation can create an above-average two-way player without capping the sum', () => {
  const chance = e.params['generation.two_way_chance'];
  try {
    e.params['generation.two_way_chance'] = 1;
    const players = Array.from({ length: 40 }, (_, i) => e.previewPlayer('two-way-potential-' + i, '검증', i % 2 ? 'SP' : 'SS'));
    assert.ok(players.some(p => e.ovr(p, true) > e.params['generation.mean'] && e.ovr(p, false) > e.params['generation.mean']));
    for (const p of players) assert.equal(e.combinedOvr(p), e.ovr(p, true) + e.ovr(p, false));
  } finally {
    e.params['generation.two_way_chance'] = chance;
  }
});

test('draft OVR ranking uses primary ratings and two-way averages on the same 100-point scale', () => {
  const template = e.previewPlayer('two-way-ranking', '검증', 'SS');
  const players = [[90, 10], [60, 60], [30, 75]].map(([pitch, bat], index) => {
    const p = structuredClone(template);
    p.id = 'ranking-' + index;
    p.grade = 3;
    if(index===0){p.primaryRole='선발';p.position='SP';}
    if(index===1)p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};
    for (const key of pitching) p.stats[key] = pitch;
    for (const key of batting) p.stats[key] = bat;
    return p;
  });
  assert.deepEqual(e.draftBoard(players).map(p => p.id), ['ranking-0', 'ranking-2', 'ranking-1']);
});


test('annual prospect pools use exact requested position proportions, repeat by seed and round smaller classes without dropping players',()=>{
 for(const year of [2028,2029,2030]){
  const positions=positionCohort(1000,positionRandom('prospects-'+year));assert.deepEqual(positionCounts(positions),expectedPositions);
  assert.deepEqual(positions,positionCohort(1000,positionRandom('prospects-'+year)));assert.equal(positions.filter(p=>p==='CP').length,50);assert.equal(positions.filter(p=>p==='RP').length,275);
 }
 for(const count of [0,1,13,39,40,101]){const cohort=positionCohort(count,positionRandom('rounding'));assert.equal(cohort.length,count);assert.ok(cohort.every(p=>Object.hasOwn(e.positions,p)&&p!=='DH'));}
});
test('school intake meets annual ratios while three adjacent classes cover every defensive position and retain one or two closers',()=>{
 const ids=Array.from({length:100},(_,i)=>i),intakes=[];
 for(let year=2025;year<=2030;year++){
  const intake=schoolPositionIntake(ids,year,positionRandom('school-position-order'));intakes.push(intake);
  assert.deepEqual(positionCounts([...intake.values()].flat()),expectedPositions);
  for(const row of intake.values()){assert.equal(row.length,10);assert.equal(row.filter(p=>p==='C').length,1);assert.equal(row.filter(p=>['SP','RP','CP'].includes(p)).length,5);}
 }
 for(let i=0;i<intakes.length-2;i++)for(const id of ids){
  const squad=intakes.slice(i,i+3).flatMap(intake=>intake.get(id));
  for(const pos of ['C','1B','2B','3B','SS','LF','CF','RF','SP','RP','CP'])assert.ok(squad.includes(pos),`${id}: ${pos}`);
  assert.ok([1,2].includes(squad.filter(p=>p==='CP').length));assert.ok(squad.filter(p=>p==='SP').length>=5);
 }
});
test('two actual school rollovers generate the new ratios and leave surviving positions and abilities unchanged',()=>{
 const s=e.createGame('school-position-rollover','포지션보존','DH');
 assert.equal(e.getPlayer(s).position,'DH');
 for(let year=2028;year<=2029;year++){
  const before=new Map(s.players.map(p=>[p.id,{position:p.position,stats:{...p.stats}}]));e.promote(s);
  const incoming=s.players.filter(p=>!before.has(p.id));assert.equal(incoming.length,1000);assert.deepEqual(positionCounts(incoming.map(p=>p.position)),expectedPositions);
  for(const p of s.players.filter(p=>before.has(p.id))){assert.equal(p.position,before.get(p.id).position);assert.deepEqual(p.stats,before.get(p.id).stats);}
  for(const team of s.teams)assert.equal(s.players.filter(p=>p.teamId===team.id).length,30);
 }
});
