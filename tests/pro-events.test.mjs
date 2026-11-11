import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const catalog=require('../.test-build/lib/sim/pro-event-catalog.js'),runtime=require('../.test-build/lib/sim/pro-event-runtime.js'),ledger=require('../.test-build/lib/sim/pro-event-ledger.js'),roles=require('../.test-build/lib/sim/pro-role-evaluation.js'),national=require('../.test-build/lib/sim/pro-national-events.js');
const market=require('../.test-build/lib/sim/pro-market.js'),evidence=require('../.test-build/lib/sim/pro-event-evidence.js'),storage=require('../.test-build/lib/career-save.js');
const Dialog=require('../.test-build/app/components/career-event-dialog.js').default;
const {changeText}=require('../.test-build/lib/display.js');
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('pro-event-catalog','프로이벤트','SS'));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(position='SS'){
 const s=structuredClone(template),p=e.getPlayer(s);p.teamId=p.teamId%10+10;s.postSchool.pro.level='second';s.date='2028-04-12';s.week=8;s.calendar.events=[];s.careerNotice=null;s.noticeQueue=[];s.careerEvent=null;delete s.weekProgress;delete s.matchProgress;delete s.pendingEventOutcome;
 s.proWorld.stage='regular';s.proWorld.clubs.forEach(c=>c.nextReview='2099-01-01');s.lastCareerEventWeek=s.week;s.trainingFocus={rng:1,rolledWeek:s.week};s.careerEventHistory=[];
 p.position=position;p.primaryRole=e.roleFor(position);p.preferredRole=p.primaryRole;p.eligiblePositions=[position,'DH'];for(const k of Object.keys(p.stats))p.stats[k]=60;p.fatigue=30;p.forcedRest=false;p.injury=null;p.age=22;p.professional.lastRegistration='2028-03-01';p.professional.firsts.debut='2028-03-22';delete p.professional.roleTrial;delete p.professional.requestAfter;delete p.professional.requestedEvaluationUntil;delete p.twoWay;
 p.trainingPolicy=e.defaultPolicy(p.primaryRole);p.seasonStats=e.emptyRecord();p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.careerEventHistory=[];
 delete s.proEvents;ledger.ensureProEvents(s).introducedAt='2028-03-01';return s;
}
function context(s,id,extra={}){const p=e.getPlayer(s);return {version:1,catalogId:id,channel:'general',year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:p.teamId<10?'first':'second',field:e.isPitcher(p.primaryRole)?'pitching':'batting',openedAt:s.date,...extra};}
function open(s,id,extra={}){s.careerEvent=catalog.createProEvent(s,id,context(s,id,extra));ledger.recordProChoice(s,s.careerEvent);return s.careerEvent;}
function cursor(s){const p=e.getPlayer(s);s.weekProgress={remainingDays:7,beforeStats:{...p.stats},policy:structuredClone(p.trainingPolicy),stance:{...p.stance},opportunity:null,report:{from:s.date,to:s.date,growth:e.emptyStats(),fatigueBefore:p.fatigue,fatigueAfter:p.fatigue,fatigue:{training:0,game:0,recovered:0,peak:p.fatigue,days:[],events:0},games:[],messages:[],records:e.emptyRecord(),reputationBefore:p.reputation,reputationAfter:p.reputation}};}
function force(s,a=.1,b=.5){for(let seed=0;seed<100000;seed++){const q={rngStates:{...s.rngStates,events:seed}},x=e.random(q,'events'),y=e.random(q,'events');if(x>=a&&x<a+.02&&y>=b&&y<b+.02){s.rngStates.events=seed;return;}}assert.fail('event seed');}
function withParams(values,fn){const old=Object.fromEntries(Object.keys(values).map(k=>[k,e.params[k]]));try{Object.assign(e.params,values);return fn();}finally{Object.assign(e.params,old);}}
function completed(s,{PA=0,BF=0,days=1,started=false,level,known=true}={}){const p=e.getPlayer(s),record=e.emptyRecord();Object.assign(record.batting,{PA,AB:PA,H:Math.floor(PA*.3)});Object.assign(record.pitching,{BF,outs:Math.floor(BF*.7)});
 const g={id:'observed-'+s.calendar.events.length,date:e.addDays(s.date,-days),homeTeamId:p.teamId,awayTeamId:(p.teamId+1)%10,competitionId:level??(p.teamId<10?'pro-first':'pro-second'),rulesetId:'test',status:'completed',score:[0,0],innings:[[],[]],lineup:[[p.id],[]],boxScore:{[p.id]:record},proAppearanceComplete:known};if(known)g.proAppearances={[p.id]:{teamId:p.teamId,level:p.teamId<10?'first':'second',position:p.position,startedField:!e.isPitcher(p.primaryRole),startedPitching:started}};s.calendar.events.push(g);return g;}
function ids(s){return runtime.proGeneralCandidates(s).map(c=>c.id);}

test('the catalog contains exactly PE01-PE75, two or three choices, and 100 percent per choice',()=>{
 assert.deepEqual(catalog.proEventCatalog.map(c=>c.id),Array.from({length:75},(_,i)=>'PE'+String(i+1).padStart(2,'0')));
 for(const definition of catalog.proEventCatalog){assert.ok(definition.choices.length>=2&&definition.choices.length<=3);for(const choice of definition.choices)assert.equal(choice.outcomes.reduce((n,o)=>n+o.weight,0),100);}
 assert.equal(catalog.proEventCatalog.reduce((n,c)=>n+c.choices.length,0),170);
});
test('opening freezes stat aliases and shows only actions before a choice',()=>{
 const s=fixture(),p=e.getPlayer(s);p.stats.contact=10;p.stats.power=20;const event=open(s,'PE03');assert.equal(event.choices[0].outcomes[0].weeks.contact,4);p.stats.contact=90;p.stats.power=5;assert.equal(event.choices[0].outcomes[0].weeks.contact,4);
 const html=renderToStaticMarkup(createElement(Dialog,{event,outcome:null,disabled:false,onChoose(){return true;},onDone(){}}));for(const word of ['70%','각성','+4','피로 +4','기록과 동작을 함께 보니'])assert.ok(!html.includes(word));assert.ok(html.includes('약점을 고치는 연습을 한다'));
});
test('all catalog outcomes resolve using saved choices and growth never advances the calendar or changes allocation',()=>{
 for(const definition of catalog.proEventCatalog){for(const choice of definition.choices){const s=fixture(),p=e.getPlayer(s),extra={target:'3B',...(Number(definition.id.slice(2))>=20&&Number(definition.id.slice(2))<=24?{channel:'game'}:{})};
   open(s,definition.id,extra);const before={date:s.date,policy:structuredClone(p.trainingPolicy),records:structuredClone(p.seasonStats),exposure:{...p.talentExposure}};force(s,.2,.5);
   const next=e.answerCareerEvent(s,choice.id),q=e.getPlayer(next),result=next.careerEventHistory.at(-1);assert.equal(result.proEvent.catalogId,definition.id);assert.equal(next.careerEvent,null);assert.equal(next.date,before.date);assert.deepEqual(q.trainingPolicy,before.policy);assert.deepEqual(q.seasonStats,before.records);assert.deepEqual(q.talentExposure,before.exposure);assert.ok(Object.values(q.stats).every(n=>n>=1&&n<=100));assert.throws(()=>e.answerCareerEvent(next,choice.id),/선택할/);
 }}
});
test('multi-skill camp has one awakening draw and gives three points at 60',()=>{
 const s=fixture(),p=e.getPlayer(s);open(s,'PE08');force(s,0,0);const before={...s.rngStates},probe={rngStates:{...before}};e.random(probe,'events');e.random(probe,'events');
 const next=e.answerCareerEvent(s,'choice-1'),q=e.getPlayer(next),out=next.careerEventHistory.at(-1);assert.equal(next.rngStates.events,probe.rngStates.events);assert.deepEqual(out.awakened,['contact','power','speed','defense']);for(const key of out.awakened)close(q.stats[key]-p.stats[key],3);for(const key of ['match','training','injury','generation','draft'])assert.equal(next.rngStates[key],before[key]);
});
test('BQ awakening keeps its three-point floor for older developmental players',()=>{
 const s=fixture(),p=e.getPlayer(s);p.age=39;p.proContract.status='developmental';open(s,'PE03');force(s,.1,0);
 const next=e.answerCareerEvent(s,'choice-2'),out=next.careerEventHistory.at(-1);
 assert.deepEqual(out.awakened,['bq']);close(out.stats.bq,3);close(e.getPlayer(next).stats.bq,63);
 assert.equal(p.stats.bq,60);assert.deepEqual(next,e.answerCareerEvent(s,'choice-2'));
});
test('pro outcomes use the same qualitative changes as school outcomes without altering fractional results',()=>{
 const s=fixture();open(s,'PE01');force(s,.1,.5);const next=e.answerCareerEvent(s,'choice-1'),out=next.careerEventHistory.at(-1),before=structuredClone(out);
 const render=outcome=>renderToStaticMarkup(createElement(Dialog,{event:null,outcome,disabled:false,onChoose(){return true;},onDone(){}}));
 const html=render(out);assert.ok(html.includes('실제 변화'));assert.ok(!html.includes('1 미만'));
 for(const [key,amount] of Object.entries(out.stats))if(Math.abs(amount)>1e-9)assert.ok(html.includes(`${e.labels[key]} <b>${changeText(amount)}</b>`));
 const sample={...out,stats:{contact:.03,power:.2,speed:-.2},reputation:.3,fatigue:-4,awakened:[]};
 const changes=text=>text.match(/<div class="event-changes">(.*?)<\/div>/)[1];
 const pro=render(sample);assert.equal(changes(pro),changes(render({...sample,proEvent:undefined})));
 assert.ok(pro.includes('아주 조금 상승'));assert.ok(pro.includes('조금 상승'));assert.ok(pro.includes('하락'));
 const m=render({...out,stats:{},awakened:[],match:{hr:.04},scene:{gameId:'g',inning:7,battingSide:0,outs:1,bases:[null,null,null],score:[0,1],batting:true,batterName:'나',pitcherName:'상대'}});
 assert.ok(m.includes('홈런 종류 판정 <b>매우 크게 상승</b>'));assert.ok(!m.includes('%p'));assert.deepEqual(out,before);
});
test('training eligibility respects field, fatigue, current-level samples and once-per-season camp',()=>{
 const s=fixture(),p=e.getPlayer(s);assert.ok(ids(s).includes('PE01'));assert.ok(!ids(s).includes('PE02'));assert.ok(!ids(s).includes('PE03'));p.seasonByLevel.second.batting.PA=20;assert.ok(ids(s).includes('PE03'));p.fatigue=50;assert.ok(!ids(s).includes('PE04'));p.fatigue=60;assert.ok(!ids(s).includes('PE07'));
 const t=fixture('SP');assert.ok(ids(t).includes('PE02')&&ids(t).includes('PE05'));assert.ok(!ids(t).includes('PE01'));
 s.proWorld.stage='camp';p.fatigue=30;assert.ok(ids(s).includes('PE08'));open(s,'PE08');s.careerEvent=null;assert.ok(!ids(s).includes('PE08'));s.proEvents.history.push(...['PE03','PE06','PE07'].map((catalogId,i)=>({id:'later-'+i,catalogId,date:'2028-08-01',season:2028,channel:'general',teamId:p.teamId,level:'second',budget:true})));s.date='2029-03-10';s.calendar.seasonYear=2029;s.calendar.trainingDays=[s.date];assert.ok(ids(s).includes('PE08'));
});
test('zero allocation allows rest stories, injury permits only rehabilitation, and free agents/college are excluded',()=>{
 const s=fixture(),p=e.getPlayer(s);for(const key of Object.keys(p.trainingPolicy.tickets))p.trainingPolicy.tickets[key]=0;assert.ok(ids(s).includes('PE19'));assert.ok(!ids(s).some(id=>Number(id.slice(2))<=8));p.forcedRest=true;assert.deepEqual(ids(s),['PE19']);p.injury={severity:'moderate',startDate:'2028-04-01',unavailableUntil:'2028-04-15',originalPenalty:4,penaltyRemaining:4,penaltyRecoverDays:7};assert.deepEqual(ids(s),['PE18']);
 open(s,'PE18',{injuryKey:p.id+':'+p.injury.startDate});s.careerEvent=null;assert.deepEqual(ids(s),[]);p.professional.employment='freeAgent';p.teamId=-1;assert.deepEqual(ids(s),[]);s.careerMode='college';assert.equal(runtime.openProGeneralEvent(s),false);
});
test('a stronger old injury is retained and rehabilitation never shortens it or grants eligibility',()=>{
 const s=fixture(),p=e.getPlayer(s);p.injury={severity:'severe',startDate:'2028-04-01',unavailableUntil:'2028-05-01',originalPenalty:12,penaltyRemaining:10,penaltyRecoverDays:30};open(s,'PE27');force(s,.95,.5);const next=e.answerCareerEvent(s,'choice-1'),q=e.getPlayer(next);assert.equal(q.injury.unavailableUntil,'2028-05-01');assert.equal(q.injury.startDate,'2028-04-01');assert.equal(q.injury.penaltyRemaining,10);assert.equal(e.available(q,next.date),false);
});
test('weekly reservations are deterministic, rechecked, cancelled without reroll, and use only event RNG',()=>{
 withParams({'pro_events.general_chance':1},()=>{const s=fixture(),rng={...s.rngStates};runtime.planProEventWeek(s);const saved=structuredClone(s.proEvents.reservation),after={...s.rngStates};assert.ok(saved);runtime.planProEventWeek(s);assert.deepEqual(s.proEvents.reservation,saved);assert.deepEqual(s.rngStates,after);for(const key of ['match','training','injury','generation','draft'])assert.equal(s.rngStates[key],rng[key]);s.date=saved.date;e.getPlayer(s).teamId=(e.getPlayer(s).teamId+1)%20;assert.equal(runtime.openProGeneralEvent(s),false);assert.equal(s.proEvents.reservation,undefined);runtime.planProEventWeek(s);assert.equal(s.proEvents.reservation,undefined);assert.deepEqual(s.rngStates,after);});
});
test('general and game budgets, exact cooldowns and global one-choice-per-day survive transfers and new seasons',()=>{
 const s=fixture(),p=e.getPlayer(s),base={season:2028,teamId:p.teamId,level:'second',budget:true};s.proEvents.history=Array.from({length:12},(_,i)=>({...base,id:'old-'+i,catalogId:'PE01',date:e.addDays(s.date,-100-i),channel:'general'}));assert.equal(ledger.proChannelFree(s,'general'),false);p.teamId=(p.teamId+1)%20;assert.equal(ledger.proChannelFree(s,'general'),false);s.calendar.seasonYear=2029;s.date='2029-04-10';assert.equal(ledger.proChannelFree(s,'general'),true);
 s.proEvents.history=[{...base,id:'last',catalogId:'PE20',date:e.addDays(s.date,-7),season:2029,channel:'game'}];assert.equal(ledger.proChannelFree(s,'game'),true);assert.equal(ledger.proIdFree(s,'PE20','game'),false);s.date=e.addDays(s.date,21);assert.equal(ledger.proIdFree(s,'PE20','game'),true);open(s,'PE19');assert.equal(ledger.proDayFree(s),false);assert.equal(ledger.proChannelFree(s,'game'),false);
});
test('legacy histories preserve settled rewards, consume adoption budget and carry equivalent cooldowns',()=>{
 const s=fixture();delete s.proEvents;s.careerEventHistory=[{id:'legacy',definitionId:'PRO08',kind:'special',title:'기존 보직',date:s.date,choice:'유지',message:'확정됨',stats:{contact:.5},reputation:0,fatigue:0,awakened:[]}];const before=JSON.stringify(s.careerEventHistory),state=ledger.ensureProEvents(s);assert.equal(state.history.filter(r=>r.budget).length,1);assert.ok(!ids(s).includes('PE29'));assert.equal(ledger.proIdFree(s,'PE29','general'),false);assert.equal(JSON.stringify(s.careerEventHistory),before);
 s.careerEvent={id:'pending-old',definitionId:'D01',rewardVersion:2,kind:'special',date:s.date,title:'저장된 레슨',description:'기존 선택',choices:[{id:'saved',label:'저장된 선택',outcomes:[{weight:100,message:'저장된 결과',weeks:{contact:3}}]}]};const next=e.answerCareerEvent(s,'saved');assert.equal(next.careerEventHistory.at(-1).definitionId,'D01');assert.equal(next.careerEventHistory.at(-1).message,'저장된 결과');
});
test('position candidates avoid new catcher/DH and require actual center-field aptitude',()=>{
 const s=fixture(),p=e.getPlayer(s);s.proWorld.stage='camp';p.eligiblePositions=['SS','DH'];assert.equal(evidence.proFieldTarget(s),'2B');assert.ok(ids(s).includes('PE09'));p.position='DH';p.eligiblePositions=['CF'];p.stats.defense=54;assert.notEqual(evidence.proFieldTarget(s),'CF');p.stats.defense=60;p.stats.speed=54;assert.notEqual(evidence.proFieldTarget(s),'CF');p.stats.speed=60;assert.equal(evidence.proFieldTarget(s),'CF');
});
test('absence and slump conditions use dates and current levels, never a young season or missing old starter telemetry',()=>{
 const s=fixture('SP');assert.ok(ids(s).includes('PE10'));ledger.ensureProEvents(s).introducedAt=s.date;assert.ok(!ids(s).includes('PE10'));s.proEvents.introducedAt='2028-03-01';completed(s,{BF:20,started:false,known:false});assert.ok(!ids(s).includes('PE10'));s.calendar.events=[];completed(s,{BF:20,started:true});assert.ok(!ids(s).includes('PE10'));
 const t=fixture(),q=e.getPlayer(t);completed(t,{PA:20,level:'pro-first'});q.recentZ=-.4;assert.ok(!ids(t).includes('PE17'));completed(t,{PA:20});assert.ok(ids(t).includes('PE17'));assert.ok(!ids(t).includes('PE03'));
});
test('14-day role evaluation counts normal training once and waits for an explicit transition choice',()=>{
 const s=fixture(),p=e.getPlayer(s),policy=structuredClone(p.trainingPolicy),old=p.position;roles.beginProRoleTrial(s,'3B','PE09');const trial=p.professional.roleTrial,start=s.date;
 for(let i=0;i<5;i++){s.date=e.addDays(start,i);roles.recordProRoleTraining(s,p);roles.recordProRoleTraining(s,p);}assert.equal(trial.trainingDates.length,5);s.date=trial.until;assert.equal(roles.reviewProRoleTrial(s,true),false);assert.equal(p.position,old);assert.equal(roles.reviewProRoleTrial(s),true);assert.equal(p.position,old);
 const accepted=e.answerCareerEvent(s,'accept'),q=e.getPlayer(accepted);assert.equal(q.position,'3B');assert.deepEqual(q.trainingPolicy,policy);assert.equal(q.professional.roleTrial,undefined);assert.equal(accepted.careerEventHistory.at(-1).proEvent.action.kind,'accepted');
 const kept=e.answerCareerEvent(s,'keep');assert.equal(e.getPlayer(kept).position,old);assert.deepEqual(e.getPlayer(kept).stats,p.stats);assert.equal(e.getPlayer(kept).professional.roleTrial,undefined);
});
test('insufficient training or ending health fails a new trial while old pending trials retain their old completion rule',()=>{
 const s=fixture(),p=e.getPlayer(s);roles.beginProRoleTrial(s,'3B','PE09');s.date=p.professional.roleTrial.until;assert.equal(roles.reviewProRoleTrial(s),false);assert.ok(s.careerNotice.title.includes('마치지'));assert.equal(p.position,'SS');assert.equal(p.professional.roleTrial,undefined);
 const old=fixture(),q=e.getPlayer(old);q.professional.roleTrial={position:'3B',until:old.date};market.finishRoleTrial(old);assert.equal(q.position,'3B');
});
test('menu and event requests share the 28-day cooldown without granting playing time or regular status',()=>{
 const s=fixture(),p=e.getPlayer(s);p.proContract.status='developmental';open(s,'PE12');const before=structuredClone(p.seasonByLevel),next=e.answerCareerEvent(s,'choice-1'),q=e.getPlayer(next);assert.equal(q.professional.requestedEvaluationUntil,e.addDays(s.date,21));assert.equal(q.professional.requestAfter,e.addDays(s.date,28));assert.equal(q.proContract.status,'developmental');assert.deepEqual(q.seasonByLevel,before);assert.throws(()=>market.careerRequest(next,'position','3B'),/이후/);
 next.date=e.addDays(s.date,22);ledger.tickProEvents(next);assert.equal(q.professional.requestedEvaluationUntil,undefined);assert.ok(next.proEvents.cancellations.some(c=>c.id==='evaluation-request'));
});

test('every general catalog event has a reachable eligible situation',()=>{
 const seen=new Set(),collect=s=>ids(s).forEach(id=>seen.add(id));collect(fixture());collect(fixture('SP'));
 const camp=fixture();camp.proWorld.stage='camp';collect(camp);
 const form=fixture(),p=e.getPlayer(form);p.seasonByLevel.second.batting.PA=40;completed(form,{PA:30});p.recentZ=.4;p.fatigue=45;collect(form);p.recentZ=-.4;collect(form);
 const duo=fixture();e.getPlayer(duo).twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};collect(duo);
 const away=fixture(),a=e.getPlayer(away);away.calendar.events=[1,2].map(i=>({id:'away'+i,date:e.addDays(away.date,i),status:'scheduled',homeTeamId:99,awayTeamId:a.teamId}));collect(away);
 const hurt=fixture();e.getPlayer(hurt).injury={severity:'mild',startDate:hurt.date,unavailableUntil:e.addDays(hurt.date,6),originalPenalty:2,penaltyRemaining:2,penaltyRecoverDays:5};collect(hurt);
 const rest=fixture();for(const k of Object.keys(e.getPlayer(rest).trainingPolicy.tickets))e.getPlayer(rest).trainingPolicy.tickets[k]=0;collect(rest);
 const bench=fixture(),b=e.getPlayer(bench);b.teamId%=10;for(let i=1;i<=5;i++)completed(bench,{days:i});collect(bench);
 const vet=fixture('SP'),v=e.getPlayer(vet);v.age=34;vet.proWorld.stage='camp';const mate=vet.players.find(q=>q.id!==v.id&&q.teamId%10===v.teamId%10&&e.isPitcher(q.primaryRole));mate.professional.rookieYear=2028;collect(vet);
 const expected=Array.from({length:30},(_,i)=>'PE'+String(i+1).padStart(2,'0')).filter(id=>Number(id.slice(2))<=19&&id!=='PE13'||Number(id.slice(2))>=28);assert.deepEqual([...seen].filter(id=>Number(id.slice(2))<=30).sort(),expected);
});
function matchFixture(pitching=false){
 const s=fixture(pitching?'SP':'SS'),p=e.getPlayer(s),opponent=s.players.find(q=>q.id!==p.id);cursor(s);const batter=pitching?opponent:p,pitcher=pitching?p:opponent;batter.stats.contact=40;pitcher.stats.velocity=70;
 const scene={gameId:'actual-match',inning:7,battingSide:1,outs:1,bases:[null,null,null],score:[1,2],batting:!pitching,batterName:batter.name,pitcherName:pitcher.name,batterId:batter.id,pitcherId:pitcher.id};
 s.matchProgress={gameId:scene.gameId,ready:true,inning:scene.inning,battingSide:1,battingIndex:[0,0],pitchers:[pitcher.id,p.id],sides:[{field:[],order:[],starter:pitcher.id,pitchers:[pitcher.id]},{field:[batter.id],order:Array(9).fill(batter.id),starter:p.id,pitchers:[p.id]}],original:[],usedPitchers:[[],[]],pitchOuts:[0,0],recentEvents:[],defense:[60,60],arm:[60,60],outs:1,pa:1,runs:0,bases:[null,null,null],eventFatigue:0};
 return {s,p,batter,pitcher,scene};
}
test('game scenes use actual cursor, correct priority and exactly one attempt per game even on failure',()=>{
 withParams({'pro_events.game_chance':1},()=>{
  const {s,p,batter,pitcher,scene}=matchFixture(true);p.fatigue=65;scene.bases=['一','二','三'];assert.equal(runtime.openProMatchEvent(s,scene,batter,pitcher),true);assert.equal(s.careerEvent.definitionId,'PE22');assert.equal(s.proEvents.attemptedGames.length,1);s.careerEvent=null;assert.equal(runtime.openProMatchEvent(s,scene,batter,pitcher),false);
  const b=matchFixture();b.scene.score=[3,1];b.scene.bases=['一',null,null];assert.equal(runtime.openProMatchEvent(b.s,b.scene,b.batter,b.pitcher),true);assert.equal(b.s.careerEvent.definitionId,'PE21');
 });
 withParams({'pro_events.game_chance':0},()=>{const {s,batter,pitcher,scene}=matchFixture();const before={...s.rngStates};assert.equal(runtime.openProMatchEvent(s,scene,batter,pitcher),false);assert.equal(s.proEvents.attemptedGames.length,1);const after={...s.rngStates};assert.equal(runtime.openProMatchEvent(s,scene,batter,pitcher),false);assert.deepEqual(s.rngStates,after);for(const key of ['match','training','injury','generation','draft'])assert.equal(s.rngStates[key],before[key]);});
 const fake=matchFixture();delete fake.s.matchProgress;assert.equal(runtime.openProMatchEvent(fake.s,fake.scene,fake.batter,fake.pitcher),false);
});
test('all five match catalog events can be selected without fabricating stats',()=>{
 for(const [id,pitching,setup]of [['PE20',false,()=>{}],['PE21',false,x=>{x.scene.score=[3,1];x.scene.bases=['runner',null,null];}],['PE22',true,x=>{x.scene.bases=['a','b','c'];}],['PE23',true,x=>{x.scene.score=[2,1];}],['PE24',true,x=>{x.p.fatigue=65;}]])withParams({'pro_events.game_chance':1},()=>{const x=matchFixture(pitching);setup(x);const stats=structuredClone(x.p.seasonStats);assert.ok(runtime.openProMatchEvent(x.s,x.scene,x.batter,x.pitcher));assert.equal(x.s.careerEvent.definitionId,id);assert.deepEqual(x.p.seasonStats,stats);});
});
test('first-team preparation requires an actual selected lineup and is not replayed for an established player',()=>{
 const s=fixture(),p=e.getPlayer(s);cursor(s);p.teamId%=10;delete p.professional.firsts.debut;
 const game={id:'first',homeTeamId:p.teamId,awayTeamId:(p.teamId+1)%10,competitionId:'pro-first',round:1},sides=[{field:[],starter:'other'},{field:[],starter:'other'}];assert.equal(runtime.openProPreparation(s,game,sides),false);sides[0].field=[p.id];assert.equal(runtime.openProPreparation(s,game,sides),true);assert.equal(s.careerEvent.definitionId,'PE13');assert.equal(s.careerEvent.proEvent.field,'batting');assert.deepEqual(p.seasonByLevel.first,e.emptyRecord());s.careerEvent=null;s.date=e.addDays(s.date,1);assert.equal(runtime.openProPreparation(s,game,sides),false);
 const old=fixture(),q=e.getPlayer(old);cursor(old);q.teamId%=10;q.seasonByLevel.first.batting.PA=1;assert.equal(runtime.openProPreparation(old,{...game,homeTeamId:q.teamId},[{field:[q.id],starter:'other'},sides[1]]),false);
});
test('postseason preparation respects roster and elimination priority, then records skipped collision',()=>{
 const s=fixture(),p=e.getPlayer(s);cursor(s);p.teamId%=10;const other=(p.teamId+1)%10,series={id:'test-series',clubs:[p.teamId,other],wins:[0,2],target:3,game:0,stage:'semi',lastDate:s.date,rosters:{[p.teamId]:[p.id],[other]:[]},excluded:[]};s.proWorld.postseason={seeds:series.clubs,series:[series]};s.proWorld.stage='postseason';
 const game={id:'series-first',homeTeamId:p.teamId,awayTeamId:other,competitionId:'pro-playoffs-test-series',round:1};assert.equal(runtime.openProPreparation(s,game,[{field:[p.id],starter:'other'},{field:[],starter:'other'}]),true);assert.equal(s.careerEvent.definitionId,'PE26');assert.ok(s.proEvents.cancellations.some(c=>c.id==='PE25:test-series'));
 const fresh=fixture(),q=e.getPlayer(fresh);cursor(fresh);q.teamId=p.teamId;fresh.proWorld.postseason={seeds:series.clubs,series:[{...series,wins:[0,0],rosters:{[p.teamId]:[q.id]}}]};assert.equal(runtime.openProPreparation(fresh,game,[{field:[],starter:'other'},{field:[],starter:'other'}]),true);assert.equal(fresh.careerEvent.definitionId,'PE25');
});
function nationalFixture(){
 const s=fixture(),base=e.getPlayer(s),players=[];const add=(position,n)=>{for(let i=0;i<n;i++){const p=structuredClone(base);p.id=position+'-'+i;p.position=position;p.primaryRole=e.roleFor(position);p.teamId=0;p.reputation=90-i;p.seasonByLevel.first=e.emptyRecord();p.seasonByLevel.second=e.emptyRecord();if(e.isPitcher(p.primaryRole)){p.seasonByLevel.first.pitching.outs=90;p.seasonByLevel.first.pitching.BF=130;}else{p.seasonByLevel.first.batting.PA=100;p.seasonByLevel.first.batting.AB=90;}players.push(p);}};
 add('SP',8);add('RP',8);add('C',3);for(const pos of ['1B','2B','3B','SS'])add(pos,2);for(const pos of ['LF','CF','RF'])add(pos,2);add('DH',2);
 s.playerId=players.find(p=>p.position==='SS').id;s.players=players;s.phase='ended';s.proWorld.stage='summary';s.proWorld.seasonClosed=true;s.date='2028-10-20';return s;
}
test('adult training invitation freezes at most 23 with exact role quotas and first-team current-year samples',()=>{
 const s=nationalFixture(),p=e.getPlayer(s),rng={...s.rngStates};national.freezeProNational(s);const entry=s.proEvents.national['2028'];assert.equal(entry.roster.length,23);assert.equal(new Set(entry.roster.map(p=>p.id)).size,23);assert.equal(entry.roster.filter(p=>p.position==='SP').length,6);assert.equal(entry.roster.filter(p=>p.position==='RP').length,6);assert.equal(entry.roster.filter(p=>p.position==='C').length>=2,true);assert.deepEqual(s.rngStates,rng);const frozen=JSON.stringify(entry.roster);for(const q of s.players)q.reputation=1;const appended=structuredClone(p);appended.id='new-superstar';appended.reputation=100;s.players.push(appended);national.freezeProNational(s);assert.equal(JSON.stringify(entry.roster),frozen);
 const second=nationalFixture();for(const q of second.players){q.seasonByLevel.second=structuredClone(q.seasonByLevel.first);q.seasonByLevel.first=e.emptyRecord();}national.freezeProNational(second);assert.equal(second.proEvents.national['2028'].roster.length,0);
 const sparse=nationalFixture();sparse.players=sparse.players.filter(q=>q.id===sparse.playerId);national.freezeProNational(sparse);assert.equal(sparse.proEvents.national['2028'].roster.length,1);
});
test('selected adult invitation occurs next day after settlement and resolves while the season stays ended',()=>{
 const s=nationalFixture(),p=e.getPlayer(s);p.reputation=100;national.freezeProNational(s);const roster=JSON.stringify(s.proEvents.national['2028'].roster),before=structuredClone(p.seasonByLevel);s.careerNotice={id:'season',date:s.date,kind:'seasonComplete',title:'결산',message:'완료'};assert.equal(national.tryProNationalInvitation(s),false);
 const next=pc.acknowledgeCareer(s);assert.equal(next.careerEvent.definitionId,'PE27');assert.equal(next.date,'2028-10-21');assert.equal(next.phase,'ended');force(next,.3,.5);const result=e.answerCareerEvent(next,'choice-1');assert.equal(result.phase,'ended');assert.equal(result.proEvents.national['2028'].settled,true);assert.deepEqual(e.getPlayer(result).seasonByLevel,before);assert.equal(JSON.stringify(result.proEvents.national['2028'].roster),roster);assert.equal(national.tryProNationalInvitation(result),false);
 const pending=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(next,false)));assert.equal(pending.state.careerEvent.definitionId,'PE27');assert.deepEqual(e.answerCareerEvent(pending.state,'choice-1'),result);
});
test('reservations, role decisions and frozen event choices round-trip through saves without rerolls',()=>{
 const s=fixture();withParams({'pro_events.general_chance':1},()=>runtime.planProEventWeek(s));const copy=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(s,false))).state;assert.deepEqual(copy,s);open(copy,'PE08');force(copy,0,0);const loaded=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(copy,false))).state;assert.deepEqual(e.answerCareerEvent(loaded,'choice-1'),e.answerCareerEvent(copy,'choice-1'));
 const corrupt=structuredClone(copy);corrupt.proEvents.version=2;assert.throws(()=>storage.encodeCareerSave(corrupt),/프로 이벤트/);
});

function finishWeek(input,policy=e.getPlayer(input).trainingPolicy){let s=input,guard=0;while(s.week===input.week&&s.phase!=='ended'&&guard++<40){while(s.careerNotice)s=pc.acknowledgeCareer(s);if(s.careerEvent)throw new Error('unexpected choice '+s.careerEvent.definitionId);s=e.advanceWeek(s,policy,e.getPlayer(s).stance);}assert.equal(s.week,input.week+1);return s;}
const noRandom={'events.weekly_chance':0,'events.focus_chance':0,'pro_events.general_chance':0,'pro_events.game_chance':0,'injury.training_base_risk':0,'injury.risk_at60':0,'injury.risk_slope60':0,'injury.risk_at80':0,'injury.risk_slope80':0};
function realGame(first=false){const s=structuredClone(template),p=e.getPlayer(s);s.careerNotice=null;s.noticeQueue=[];s.proWorld.clubs.forEach(c=>c.nextReview='2099-01-01');p.teamId=p.teamId%10+(first?0:10);s.postSchool.pro.level=first?'first':'second';
 const game=s.calendar.events.find(g=>g.competitionId===(first?'pro-first':'pro-second')&&[g.homeTeamId,g.awayTeamId].includes(p.teamId));s.date=game.date;s.calendar.events=[game];s.lastCareerEventWeek=s.week;s.trainingFocus={rng:0,rolledWeek:s.week};p.eligiblePositions=['SS'];for(const key of ['contact','power','speed','defense'])p.stats[key]=100;p.stats.contact=first?100:1;p.fatigue=0;p.professional.firsts={...(first?{}:{debut:'2028-03-01'})};game.evaluationPlayers=[p.id];
 for(const q of s.players.filter(q=>q.teamId===(game.homeTeamId===p.teamId?game.awayTeamId:game.homeTeamId)))q.stats.velocity=100;
 for(const key of Object.keys(p.trainingPolicy.tickets))p.trainingPolicy.tickets[key]=0;return s;
}
test('real match checkpoint consumes a neutral choice once and matches uninterrupted records and RNG',()=>withParams({...noRandom,'pro_events.game_chance':1},()=>{
 const input=realGame(),p=e.getPlayer(input),baseline=withParams({'pro_events.enabled':0},()=>finishWeek(structuredClone(input)));
 let paused=e.advanceWeek(input,p.trainingPolicy,p.stance);while(paused.careerNotice){paused=pc.acknowledgeCareer(paused);paused=e.advanceWeek(paused,p.trainingPolicy,p.stance);}assert.equal(paused.careerEvent.definitionId,'PE20');assert.equal(paused.calendar.events[0].boxScore[p.id]?.batting.PA??0,0);assert.equal(paused.matchProgress.ready,true);
 paused.careerEvent.choices[0].outcomes=[{weight:100,message:'중립 준비',match:{},proResultId:'neutral-check'}];const saved=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(paused,false))).state,answered=e.answerCareerEvent(saved,'choice-1');assert.ok(answered.matchEffect);const resumed=finishWeek(answered);assert.deepEqual(resumed.calendar.events[0].boxScore,baseline.calendar.events[0].boxScore);assert.deepEqual(resumed.calendar.events[0].score,baseline.calendar.events[0].score);assert.equal(resumed.rngStates.match,baseline.rngStates.match);assert.equal(resumed.matchEffect,undefined);assert.equal(resumed.careerEventHistory.filter(row=>row.definitionId==='PE20').length,1);assert.equal(resumed.calendar.events[0].proAppearanceComplete,true);
}));
test('first-game preparation saves a fixed lineup before any pitch and records debut only after actual play',()=>withParams(noRandom,()=>{
 const input=realGame(true),p=e.getPlayer(input);let paused=e.advanceWeek(input,p.trainingPolicy,p.stance);while(paused.careerNotice){paused=pc.acknowledgeCareer(paused);paused=e.advanceWeek(paused,p.trainingPolicy,p.stance);}assert.equal(paused.careerEvent.definitionId,'PE13');assert.equal(paused.calendar.events[0].status,'scheduled');assert.ok(paused.calendar.events[0].proPreparedLineup);assert.equal(paused.matchProgress,undefined);assert.deepEqual(paused.calendar.events[0].boxScore,{});assert.equal(e.getPlayer(paused).professional.firsts.debut,undefined);
 const loaded=storage.decodeCareerSave(JSON.stringify(storage.encodeCareerSave(paused,false))).state,chosen=e.answerCareerEvent(loaded,'choice-3'),resumed=finishWeek(chosen);assert.ok(e.getPlayer(resumed).seasonByLevel.first.batting.PA>0);assert.equal(e.getPlayer(resumed).professional.firsts.debut,input.date);assert.equal(resumed.careerEventHistory.filter(row=>row.definitionId==='PE13').length,1);
}));
test('weekly training supplies trial evidence and a completed trial never auto-switches the role',()=>withParams(noRandom,()=>{
 let s=fixture();roles.beginProRoleTrial(s,'3B','PE09');s=finishWeek(s);assert.equal(e.getPlayer(s).professional.roleTrial.trainingDates.length,6);s=finishWeek(s);const next=e.advanceWeek(s,e.getPlayer(s).trainingPolicy,e.getPlayer(s).stance);assert.equal(next.careerEvent.definitionId,'PE09_FOLLOWUP');assert.equal(e.getPlayer(next).position,'SS');assert.equal(e.getPlayer(e.answerCareerEvent(next,'keep')).position,'SS');
}));

test('existing two-way proposals respect the new daily choice limit and wait until the next day',()=>{
 const s=fixture(),p=e.getPlayer(s);for(const k of ['contact','power','speed','defense','velocity','control','movement'])p.stats[k]=80;p.professional.twoWayReview.qualifiedDays=28;p.professional.twoWayReview.lastDate=e.addDays(s.date,-1);open(s,'PE19');s.careerEvent=null;
 const dual=require('../.test-build/lib/sim/pro-two-way.js');assert.equal(dual.reviewProTwoWay(s),false);s.date=e.addDays(s.date,1);p.professional.twoWayReview.lastDate=e.addDays(s.date,-1);assert.equal(dual.reviewProTwoWay(s),true);assert.equal(s.careerEvent.definitionId,'PRO16');
});

test('a manual cross-field role trial preserves training but never grants unqualified pro two-way eligibility',()=>{
 const s=fixture(),p=e.getPlayer(s),policy=structuredClone(p.trainingPolicy);roles.beginProRoleTrial(s,'SP','ROLE_REQUEST');const trial=p.professional.roleTrial;trial.trainingDates=s.calendar.trainingDays.filter(date=>date>=s.date&&date<trial.until).slice(0,5);s.date=trial.until;assert.ok(roles.reviewProRoleTrial(s));const result=e.answerCareerEvent(s,'accept'),q=e.getPlayer(result);assert.equal(q.position,'SP');assert.equal(q.twoWay,undefined);assert.ok(q.eligiblePositions.every(pos=>['SP','RP','CP'].includes(pos)));assert.deepEqual(q.trainingPolicy,policy);
});
