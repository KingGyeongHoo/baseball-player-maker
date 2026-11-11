import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const school=require('../.test-build/lib/sim/event-catalog.js');
const pro=require('../.test-build/lib/sim/pro-event-catalog.js');
const system=require('../.test-build/lib/sim/event-system.js');
const runtime=require('../.test-build/lib/sim/pro-event-runtime.js');
const {eligibleStory}=require('../.test-build/lib/sim/event-stories.js');
const {eventCategoryPool,eventFocusPool,resolveEventFocus}=require('../.test-build/lib/sim/event-selection.js');
const storage=require('../.test-build/lib/career-save.js');
const cache=new Map();
const definitions=mode=>(mode==='school'?school.schoolEventCatalog:pro.proEventCatalog).filter(d=>d.rule);
function fixture(mode){
 if(!cache.has(mode)){
  const s=mode==='pro'?pc.acknowledgeCareer(pc.createProfessionalDemo('standalone-events','검증','SS')):e.createGame('standalone-events','검증','SS');
  const p=e.getPlayer(s);s.players=s.players.filter(q=>q.teamId===p.teamId);s.calendar.events=[];s.calendar.competitions=[];
  s.careerEventHistory=[];s.careerEvent=null;s.careerNotice=null;s.noticeQueue=[];delete s.weekProgress;delete s.matchProgress;delete s.proEvents;delete s.eventLedger;delete s.pendingEventOutcome;
  s.week=20;s.phase='weekStart';p.roleOffer=null;p.injury=null;p.forcedRest=false;p.fatigue=40;p.grade=2;p.age=25;p.recentZ=0;
  if(mode==='pro'){s.proWorld.stage='regular';p.professional.employment='active';p.professional.firsts.debut=s.date;}
  cache.set(mode,s);
 }
 return structuredClone(cache.get(mode));
}
function situation(mode,d){
 const s=fixture(mode),p=e.getPlayer(s),rule=d.rule;
 s.date=`${s.calendar.seasonYear}-${String(rule.months?.[0]??7).padStart(2,'0')}-20`;
 p.position=rule.positions?.[0]??(rule.field==='pitching'?'SP':'SS');p.primaryRole=e.roleFor(p.position);p.eligiblePositions=[p.position];p.trainingPolicy=e.defaultPolicy(p.primaryRole);
 for(const key of Object.keys(p.stats))p.stats[key]=60;
 s.calendar.trainingDays=[s.date];
 if(rule.travel)s.calendar.events=[{id:'away',date:e.addDays(s.date,1),status:'scheduled',homeTeamId:99,awayTeamId:p.teamId}];
 return s;
}
function rawEvent(s,id,story){
 const p=e.getPlayer(s);
 return s.careerMode==='pro'?pro.createProEvent(s,id,{version:1,catalogId:id,channel:'general',year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:p.teamId<10?'first':'second',field:e.isPitcher(p.primaryRole)?'pitching':'batting',openedAt:s.date,story}):school.createCareerEvent(id,p,s.date,s.week,{story});
}
function seedFor(s,low,high){
 for(let seed=0;seed<10000;seed++){const q={rngStates:{...s.rngStates,events:seed}},roll=e.random(q,'events');if(roll>=low&&roll<high){s.rngStates.events=seed;return;}}
 assert.fail('No matching event RNG draw');
}

test('catalogs keep the original events and replace all additions with independent scenes near 90 percent baseball',()=>{
 for(const [mode,rows,total,baseball,added] of [['school',school.schoolEventCatalog,60,54,30],['pro',pro.proEventCatalog,75,68,45]]){
  assert.equal(rows.length,total);assert.equal(rows.filter(r=>r.category==='baseball').length,baseball);assert.equal(definitions(mode).length,added);
  for(const d of definitions(mode)){
   assert.equal(d.rule.after,undefined);assert.equal(d.rule.revision,4);assert.equal(d.choices.length,2);
   assert.doesNotMatch(JSON.stringify(d),/리포트|분석실|영상 분석|질문 노트|후속|아무런 변화|변화 없음|큰 변화 없이/);
  }
  for(const d of rows)for(const choice of d.choices)assert.equal(choice.outcomes.reduce((n,b)=>n+b.weight,0),100);
 }
});

test('category draw is 90:10 regardless of catalog size and has an explicit eligibility fallback',()=>{
 const pool=[...Array.from({length:250},(_,id)=>({id,category:'baseball'})),{id:'daily',category:'daily'}];
 let baseball=0;
 for(let n=0;n<10000;n++)if(eventCategoryPool(pool,c=>c.category,(n+.5)/10000)[0].category==='baseball')baseball++;
 assert.equal(baseball,9000);
 assert.equal(eventCategoryPool(pool,c=>c.category,.9)[0].category,'daily');
 assert.equal(eventCategoryPool(pool.slice(0,1),c=>c.category,.99)[0].category,'baseball');
 assert.equal(eventCategoryPool(pool.slice(-1),c=>c.category,0)[0].category,'daily');
 assert.deepEqual(eventCategoryPool([],c=>c.category,.5),[]);
});

test('both weekly planners apply category and role-specific focus weights without consuming match RNG',()=>{
 const keys=['events.weekly_chance','events.gap_weeks','pro_events.enabled','pro_events.general_chance'],before=keys.map(k=>e.params[k]);
 try{
  Object.assign(e.params,{'events.weekly_chance':1,'events.gap_weeks':0,'pro_events.enabled':1,'pro_events.general_chance':1});
  for(const mode of ['school','pro'])for(const pitching of [false,true]){
   const base=fixture(mode),rows=mode==='school'?school.schoolEventCatalog:pro.proEventCatalog,categories=new Map(rows.map(r=>[r.id,r.category]));
   const p=e.getPlayer(base);p.position=pitching?'SP':'SS';p.primaryRole=e.roleFor(p.position);p.eligiblePositions=[p.position];p.trainingPolicy=e.defaultPolicy(p.primaryRole);
   base.calendar.trainingDays=Array.from({length:7},(_,i)=>e.addDays(base.date,i));let baseball=0;const focuses={};
   for(let seed=0;seed<2000;seed++){
    const s={...base,rngStates:{...base.rngStates,events:seed},eventLedger:undefined,proEvents:undefined};
    const chosen=mode==='school'?system.planEventWeek(s):(runtime.planProEventWeek(s),s.proEvents.reservation);
    assert(chosen);const id=chosen.definitionId??chosen.id;if(categories.get(id)==='baseball'){
     baseball++;const d=rows.find(r=>r.id===id),focus=resolveEventFocus((pitching?d.pitchingFocus:d.battingFocus)??d.focus,pitching,p.stats);focuses[focus]=(focuses[focus]??0)+1;
    }
    for(const k of ['generation','match','training','injury','draft'])assert.equal(s.rngStates[k],base.rngStates[k]);
   }
   assert(baseball>=1720&&baseball<=1880,`${mode}: ${baseball}/2000 baseball`);
   const targets=pitching?{velocity:.8/3,control:.8/3,movement:.8/3,physical:.1,bq:.1}:{contact:.2,power:.2,speed:.2,defense:.2,physical:.1,bq:.1};
   assert.deepEqual(Object.keys(focuses).sort(),Object.keys(targets).sort());
   for(const[key,target]of Object.entries(targets))assert(Math.abs(focuses[key]/baseball-target)<.04,`${mode} ${pitching?'pitcher':'hitter'} ${key}: ${focuses[key]}/${baseball}`);
  }
 }finally{keys.forEach((k,i)=>e.params[k]=before[i]);}
});

test('whole catalogs leave three school and two pro BQ themes and add one scene to each fixed core ability',()=>{
 const core=['velocity','control','movement','contact','power','speed','defense'];
 for(const[rows,expected,bqIds]of [[school.schoolEventCatalog,[6,5,6,6,5,5,5],['P06','P08','L18']],[pro.proEventCatalog,[7,10,9,8,7,6,7],['PE58','PE71']]]){
  assert.deepEqual(rows.filter(d=>d.focus==='bq').map(d=>d.id).sort(),bqIds.sort());
  core.forEach((key,i)=>assert.equal(rows.filter(d=>d.focus===key).length,expected[i],key));
 }
});

test('redistributed pro offers retain their actions and adapt concrete training rewards to both fields',()=>{
 const ids=['PE12','PE19','PE25','PE26','PE27','PE29','PE30'];
 for(const pitching of [true,false])for(const id of ids){
  const s=fixture('pro'),p=e.getPlayer(s);p.position=pitching?'SP':'SS';p.primaryRole=e.roleFor(p.position);
  const d=pro.proEventCatalog.find(d=>d.id===id),context={version:1,catalogId:id,channel:'general',year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:'second',field:pitching?'pitching':'batting',openedAt:s.date,target:pitching?'RP':'DH'};
  const event=pro.createProEvent(s,id,context),focus=resolveEventFocus((pitching?d.pitchingFocus:d.battingFocus)??d.focus,pitching,p.stats);
  assert.doesNotMatch(JSON.stringify(event),/\{(?:정교|힘|구종|첫발|수비) 훈련\}/);
  assert(event.choices[0].outcomes.some(o=>(o.weeks?.[focus]??0)>0),`${id} ${context.field}`);
  for(const choice of event.choices)for(const outcome of choice.outcomes){
   assert.equal(outcome.weeks?.bq,undefined,id);
   for(const[key,n]of Object.entries(outcome.weeks??{})){assert(key in p.stats,`${id} ${key}`);assert(n>0);}
  }
  if(id==='PE12')assert(event.choices[0].outcomes[0].proChanceRequest);
  if(id==='PE29'){assert.equal(event.choices[0].outcomes[0].proRoleTrial,context.target);assert(event.choices[0].outcomes[0].proAutoTransition);}
 }
});

test('added technical catalogs contain equal counts for every core ability within each role',()=>{
 for(const[mode,pitchCount,batCount]of [['school',3,3],['pro',6,4]]){
  const counts={};for(const d of definitions(mode).filter(d=>d.category==='baseball')){
   counts[d.focus]=(counts[d.focus]??0)+1;
   if(['velocity','control','movement'].includes(d.focus))assert.equal(d.rule.field,'pitching',d.id);
   if(['contact','power','speed','defense'].includes(d.focus))assert.equal(d.rule.field,'batting',d.id);
   if(['physical','bq'].includes(d.focus))assert.equal(d.rule.field,undefined,d.id);
  }
  for(const key of ['velocity','control','movement'])assert.equal(counts[key],pitchCount,`${mode} ${key}`);
  for(const key of ['contact','power','speed','defense'])assert.equal(counts[key],batCount,`${mode} ${key}`);
  assert(counts.physical>0);assert(counts.bq>0);
 }
});

test('focus draw is 80:10:10 with even core weights despite uneven IDs and dates',()=>{
 for(const pitching of [true,false]){
  const core=pitching?['velocity','control','movement']:['contact','power','speed','defense'];
  const all=[...core,'physical','bq'];
  const pool=all.flatMap((focus,i)=>Array.from({length:(i+1)*17},()=>({focus})));
  const counts={};for(let n=0;n<30000;n++){const selected=eventFocusPool(pool,c=>c.focus,pitching,(n+.5)/30000);const key=selected[0].focus;counts[key]=(counts[key]??0)+1;}
  for(const key of core)assert.equal(counts[key],24000/core.length);
  assert.equal(counts.physical,3000);assert.equal(counts.bq,3000);
  assert.deepEqual(eventFocusPool([],c=>c.focus,pitching,.5),[]);
  assert.equal(eventFocusPool([{focus:'bq'}],c=>c.focus,pitching,0)[0].focus,'bq');
  const sparse=[{focus:core[0]},{focus:'physical'}];let physical=0;
  for(let n=0;n<11000;n++)if(eventFocusPool(sparse,c=>c.focus,pitching,(n+.5)/11000)[0].focus==='physical')physical++;
  assert(Math.abs(physical/11000-.1/(.8/core.length+.1))<.001);
 }
});

test('every added event is eligible without any prior story and reaches its real scheduling phase',()=>{
 for(const mode of ['school','pro'])for(const d of definitions(mode)){
  const s=situation(mode,d),p=e.getPlayer(s),story=eligibleStory(s,d.id,d.rule);assert(story,d.id);assert.equal(story.sourceId,undefined);
  if(mode==='school'){
   const candidate=system.eventCandidates(s,s.date).find(c=>c.definitionId===d.id);assert(candidate,d.id);s.weekProgress={opportunity:candidate};
   assert(system.openScheduledEvent(s,school.eventKind(d.id)==='training'?'training':'beforeGames'),d.id);
  }else{
   const candidate=runtime.proGeneralCandidates(s).find(c=>c.id===d.id);assert(candidate,d.id);s.proEvents.reservation={week:s.week,date:s.date,id:d.id,context:candidate.context};assert(runtime.openProGeneralEvent(s),d.id);
  }
  assert.equal(s.careerEvent.definitionId,d.id);assert.equal(s.careerEvent.story.teamId,p.teamId);
 }
});

test('every new outcome makes a real change and preserves game records, training allocation and unrelated RNG',()=>{
 for(const mode of ['school','pro'])for(const d of definitions(mode)){
  const base=situation(mode,d);base.careerEvent=rawEvent(base,d.id,eligibleStory(base,d.id,d.rule));
  for(const choice of base.careerEvent.choices){let low=0;
   for(const branch of choice.outcomes){
    const s=structuredClone(base),p=e.getPlayer(s),high=low+branch.weight/100;seedFor(s,low,high);
    const next=e.answerCareerEvent(s,choice.id),q=e.getPlayer(next),out=next.careerEventHistory.at(-1);
    assert.equal(out.message,branch.message,d.id);assert(Object.values(out.stats).some(n=>n!==0)||out.fatigue!==0||out.reputation!==0,`${mode} ${d.id} ${choice.id}: no effect`);
    assert.deepEqual(q.seasonStats,p.seasonStats);assert.deepEqual(q.trainingPolicy,p.trainingPolicy);assert.equal(next.date,s.date);
    for(const k of ['generation','match','training','injury','draft'])assert.equal(next.rngStates[k],s.rngStates[k]);
    assert.throws(()=>e.answerCareerEvent(next,choice.id),/선택할/);low=high;
   }
  }
 }
});

test('leg kicks, double kicks and new pitch grips affect their actual technical abilities',()=>{
 for(const [mode,id,key]of [['school','T11','power'],['school','T12','control'],['school','L03','movement'],['pro','PE32','power'],['pro','PE33','control'],['pro','PE40','movement'],['pro','PE62','movement']]){
  const d=definitions(mode).find(d=>d.id===id),s=situation(mode,d);s.careerEvent=rawEvent(s,id);seedFor(s,0,.7);
  const next=e.answerCareerEvent(s,'choice-1');assert(next.careerEventHistory.at(-1).stats[key]>0,id);
 }
 const d=definitions('school').find(d=>d.id==='T11'),s=situation('school',d);s.careerEvent=rawEvent(s,d.id);seedFor(s,.7,1);
 const failed=e.answerCareerEvent(s,'choice-1');assert(failed.careerEventHistory.at(-1).stats.contact<0);assert(failed.careerEventHistory.at(-1).fatigue>0);
});

test('training, travel, fatigue and defensive position requirements remain real constraints',()=>{
 const d=definitions('pro').find(d=>d.id==='PE50'),s=situation('pro',d);assert(eligibleStory(s,d.id,d.rule));
 e.getPlayer(s).eligiblePositions=['DH'];assert.equal(eligibleStory(s,d.id,d.rule),undefined);
 const pitch=definitions('pro').find(d=>d.id==='PE62'),p=situation('pro',pitch);p.calendar.trainingDays=[];assert.equal(eligibleStory(p,pitch.id,pitch.rule),undefined);
 const travel=definitions('pro').find(d=>d.id==='PE43'),t=situation('pro',travel);assert(eligibleStory(t,travel.id,travel.rule));t.calendar.events=[];assert.equal(eligibleStory(t,travel.id,travel.rule),undefined);
 const rest=definitions('school').find(d=>d.id==='L01'),r=situation('school',rest);e.getPlayer(r).fatigue=0;assert.equal(eligibleStory(r,rest.id,rest.rule),undefined);
});

test('old histories do not cause chains and already open saved choices retain their authored outcome',()=>{
 const d=definitions('school').find(d=>d.id==='L16'),s=situation('school',d);
 s.careerEventHistory=[{id:'old-parent',definitionId:'L03',date:e.addDays(s.date,-14),choiceId:'choice-1',story:{mode:'school',teamId:e.getPlayer(s).teamId,revision:2}}];
 assert.equal(eligibleStory(s,d.id,d.rule).sourceId,undefined);
 s.careerEvent=rawEvent(s,d.id);s.careerEvent.choices=[{id:'saved',label:'저장된 선택',outcomes:[{weight:100,message:'저장된 결과',fatigue:-3}]}];
 const loaded=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(s))).state;assert.deepEqual(loaded.careerEvent,s.careerEvent);
 const done=e.answerCareerEvent(loaded,'saved');assert.equal(done.careerEventHistory.at(-1).message,'저장된 결과');assert.equal(done.careerEvent,null);
});
