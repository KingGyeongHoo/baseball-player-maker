import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const school=require('../.test-build/lib/sim/event-system.js');
const catalog=require('../.test-build/lib/sim/event-catalog.js');
const pro=require('../.test-build/lib/sim/pro-event-runtime.js');
const proCatalog=require('../.test-build/lib/sim/pro-event-catalog.js');
const {eventFocusPool}=require('../.test-build/lib/sim/event-selection.js');
const pitch=['velocity','control','movement'],bat=['contact','power','speed','defense'];
const templates=new Map();
function fixture(mode,origin){
  if(!templates.has(mode))templates.set(mode,mode==='pro'?pc.acknowledgeCareer(pc.createProfessionalDemo('two-way-events','검증','SS')):e.createGame('two-way-events','검증','SS'));
  const s=structuredClone(templates.get(mode)),p=e.getPlayer(s);
  s.players=[p];s.calendar.events=[];s.calendar.competitions=[];s.date=`${s.calendar.seasonYear}-03-01`;s.calendar.trainingDays=Array.from({length:7},(_,i)=>e.addDays(s.date,i));s.week=10;s.phase='weekStart';s.careerEvent=null;s.careerNotice=null;s.careerEventHistory=[];s.lastCareerEventWeek=0;delete s.eventLedger;delete s.proEvents;delete s.weekProgress;delete s.matchProgress;
  p.throws='R';p.position=origin;p.primaryRole=e.roleFor(origin);p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};p.eligiblePositions=['SP','RP','CP','SS','2B','CF','DH'];p.grade=2;p.fatigue=20;p.injury=null;p.forcedRest=false;p.roleOffer=null;p.offerCooldown=0;p.trainingPolicy=e.defaultPolicy(p.primaryRole);for(const key of Object.keys(p.trainingPolicy.tickets))p.trainingPolicy.tickets[key]=3;
  if(mode==='pro'){p.professional.employment='active';s.proWorld.stage='camp';}
  return s;
}
test('two-way focus draw allocates 40% pitching, 40% batting, 10% physical and 10% BQ independently of original role',()=>{
  const pool=[...pitch,...bat,'physical','bq'].flatMap((focus,i)=>Array.from({length:i+1},()=>({focus})));
  for(const primaryPitching of [true,false]){
    const counts={pitching:0,batting:0,physical:0,bq:0};
    for(let i=0;i<12000;i++){const key=eventFocusPool(pool,c=>c.focus,primaryPitching,(i+.5)/12000,true)[0].focus;counts[pitch.includes(key)?'pitching':bat.includes(key)?'batting':key]++;}
    assert.deepEqual(counts,{pitching:4800,batting:4800,physical:1200,bq:1200});
  }
});
test('school training candidates include both disciplines for either two-way origin',()=>{
  for(const origin of ['SS','SP']){
    const s=fixture('school',origin),pool=school.eventCandidates(s,s.date);
    for(const id of ['T01','T02','T03','T06','T07','P05'])assert.ok(pool.some(c=>c.definitionId===id),`${origin} ${id}`);
    const p=e.getPlayer(s);delete p.twoWay;
    const single=school.eventCandidates(s,s.date);assert.ok(!single.some(c=>c.definitionId===(origin==='SP'?'T01':'T06')));
  }
});
test('real school and pro weekly planners select both fields and freeze matching rewards for both two-way origins',()=>{
  const old=[e.params['events.weekly_chance'],e.params['events.gap_weeks'],e.params['pro_events.enabled'],e.params['pro_events.general_chance']];
  e.params['events.weekly_chance']=e.params['pro_events.enabled']=e.params['pro_events.general_chance']=1;e.params['events.gap_weeks']=0;
  try{
    for(const mode of ['school','pro'])for(const origin of ['SS','SP']){
      const s=fixture(mode,origin),p=e.getPlayer(s),seen=new Set();
      for(let i=0;i<100;i++){
        s.rngStates.events=e.hash(`two-way-week:${i}`);delete s.proEvents;
        let id,field,event,definition;
        if(mode==='school'){const planned=school.planEventWeek(s);assert.ok(planned);({definitionId:id,field}=planned);definition=catalog.schoolEventCatalog.find(d=>d.id===id);event=catalog.createCareerEvent(id,p,s.date,s.week,planned);}
        else{pro.planProEventWeek(s);const planned=s.proEvents.reservation;assert.ok(planned);({id}=planned);field=planned.context.field;definition=proCatalog.proEventCatalog.find(d=>d.id===id);event=proCatalog.createProEvent(s,id,planned.context);}
        const focus=(mode==='pro'?(field==='pitching'?definition.pitchingFocus:definition.battingFocus):undefined)??definition.focus;if(pitch.includes(focus)||bat.includes(focus)){assert.equal(field,pitch.includes(focus)?'pitching':'batting');seen.add(field);assert.ok(event.choices.some(c=>c.outcomes.some(o=>o.weeks?.[focus]>0)),`${mode} ${id}`);}
      }
      assert.deepEqual([...seen].sort(),['batting','pitching'],`${mode} ${origin}`);
    }
  }finally{[e.params['events.weekly_chance'],e.params['events.gap_weeks'],e.params['pro_events.enabled'],e.params['pro_events.general_chance']]=old;}
});
test('shared school rewards use the selected field rather than the primary role and remain frozen in saves',()=>{
  for(const origin of ['SS','SP']){
    const s=fixture('school',origin),p=e.getPlayer(s);
    for(const [field,key] of [['pitching','control'],['batting','contact']])assert.deepEqual(catalog.decodeEffects('정교함 +3주분.',p,undefined,field).weeks,{[key]:3});
    const definition=catalog.schoolEventCatalog.find(d=>d.choices.some(c=>c.outcomes.some(o=>o.effect.includes('약점 +'))));
    for(const key of [...pitch,...bat])p.stats[key]=60;p.stats.velocity=10;p.stats.contact=20;
    const event=catalog.createCareerEvent(definition.id,p,s.date,s.week,{field:'pitching'}),frozen=structuredClone(event);p.primaryRole=origin==='SP'?'센터라인':'선발';
    assert.deepEqual(event,frozen);assert.ok(event.choices.some(c=>c.outcomes.some(o=>o.weeks?.velocity>0||o.stats?.velocity)));
  }
});
test('opposite-field reservations actually open in school and pro without rewriting the primary role',()=>{
  const old=[e.params['events.weekly_chance'],e.params['events.gap_weeks'],e.params['pro_events.enabled'],e.params['pro_events.general_chance']];
  e.params['events.weekly_chance']=e.params['pro_events.enabled']=e.params['pro_events.general_chance']=1;e.params['events.gap_weeks']=0;
  try{
    for(const mode of ['school','pro'])for(const origin of ['SS','SP']){
      const s=fixture(mode,origin),p=e.getPlayer(s),role=p.primaryRole,target=origin==='SS'?'pitching':'batting';let opened=false;
      for(let i=0;i<100&&!opened;i++){
        s.rngStates.events=e.hash(`opposite-open:${i}`);delete s.proEvents;
        if(mode==='school'){
          const planned=school.planEventWeek(s);if(planned?.field!==target)continue;
          s.date=planned.date;s.weekProgress={opportunity:planned};
          assert.equal(school.openScheduledEvent(s,catalog.eventKind(planned.definitionId)==='training'?'training':'beforeGames'),true);
        }else{
          pro.planProEventWeek(s);const planned=s.proEvents.reservation;if(planned?.context.field!==target)continue;
          s.date=planned.date;assert.equal(pro.openProGeneralEvent(s),true);assert.equal(s.careerEvent.proEvent.field,target);
        }
        assert.equal(p.primaryRole,role);assert.ok(s.careerEvent);assert.deepEqual(JSON.parse(JSON.stringify(s.careerEvent)),s.careerEvent);opened=true;
      }
      assert.ok(opened,`${mode} ${origin}`);
    }
  }finally{[e.params['events.weekly_chance'],e.params['events.gap_weeks'],e.params['pro_events.enabled'],e.params['pro_events.general_chance']]=old;}
});
