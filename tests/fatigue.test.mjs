import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
e.params['events.weekly_chance']=0;e.params['events.focus_chance']=0;
for(const key of ['injury.training_base_risk','injury.risk_at60','injury.risk_slope60','injury.risk_at80','injury.risk_slope80'])e.params[key]=0;
const template=e.createGame('free-training-fatigue','피로검증','SS');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
function policy(total,mode='normal'){const tickets={};for(const key of Object.keys(e.defaultPolicy('센터라인').tickets)){tickets[key]=Math.min(5,total);total-=tickets[key];}return {mode,tickets};}
function fixture(total=10,r=50,stamina=50){const state=structuredClone(template),player=e.getPlayer(state);require('../.test-build/lib/sim/career-opportunities.js').opportunityState(state).transferOffered=true;for(const key of Object.keys(player.stats))player.stats[key]=50;player.stats.recovery=r;player.stats.stamina=stamina;player.fatigue=30;state.calendar.events=[];state.calendar.competitions=[];return {state,player,policy:policy(total)};}
function conservation(s){const r=s.report,f=r.fatigue;close(r.fatigueBefore+f.training+f.game+(f.events??0)-f.recovered,r.fatigueAfter);for(const key of ['training','game','recovered'])close(f[key],f.days.reduce((n,d)=>n+d[key],0));close(f.peak,Math.max(...f.days.map(d=>d.peak)));for(let i=0;i<f.days.length;i++){const d=f.days[i];close(d.start+d.training+d.game+(d.events??0)-d.recovered,d.end);close(d.start,i?f.days[i-1].end:r.fatigueBefore);assert.ok(d.end>=0&&d.end<=100&&d.peak<=100);assert.ok(d.recovered>=0&&d.recovered<=d.peak+1e-8);}close(f.days.at(-1).end,e.getPlayer(s).fatigue);}

test('all eight fields independently accept 0-5 without an intensity budget',()=>{
  for(const mode of ['light','normal','hard']){assert.ok(e.validPolicy(policy(40,mode)));assert.equal(e.budget(mode),40);}
  for(const value of [-1,.5,6,NaN]){const p=policy(0);p.tickets.velocity=value;assert.equal(e.validPolicy(p),false);}
  assert.equal(e.validPolicy(policy(1,'rest')),false);
});
test('recovery endpoints and the 20-30 percent equilibrium follow the approved formulas',()=>{
  for(const [r,recover,accumulate,neutral] of [[0,20,100,8],[50,60,75,10],[100,100,50,12]]){const zero=e.trainingLoad(r,0),full=e.trainingLoad(r,40),middle=e.trainingLoad(r,neutral);close(zero.maxRecovery,recover);close(full.maxAccumulation,accumulate);close(zero.weeklyDelta,-recover);close(full.weeklyDelta,accumulate);close(middle.weeklyDelta,0);close(middle.marker,50);close(middle.neutralRatio,neutral/40);}
});
test('recovery 50 gives -60/-15/0/+25/+75 at 0/5/10/20/40 investments',()=>{
  for(const [t,d,m] of [[0,-60,0],[5,-15,37.5],[10,0,50],[20,25,50+50/3],[40,75,100]]){const load=e.trainingLoad(50,t);close(load.weeklyDelta,d);close(load.marker,m);}
});
test('investing while recovering cuts recovery quadratically without moving the neutral point',()=>{close(e.trainingLoad(50,5).weeklyDelta,-15);close(e.trainingLoad(50,8).weeklyDelta,-2.4);close(e.trainingLoad(50,9).weeklyDelta,-.6);close(e.trainingLoad(50,10).weeklyDelta,0);close(e.trainingLoad(50,20).weeklyDelta,25);});

test('more allocation monotonically increases fatigue and marker position; recovery improves every allocation',()=>{
  for(const r of [0,1,25,50,75,100])for(let t=0;t<40;t++){assert.ok(e.trainingLoad(r,t+1).weeklyDelta>e.trainingLoad(r,t).weeklyDelta);assert.ok(e.trainingLoad(r,t+1).marker>e.trainingLoad(r,t).marker);}
  for(let t=0;t<=40;t++)assert.ok(e.trainingLoad(100,t).weeklyDelta<=e.trainingLoad(50,t).weeklyDelta&&e.trainingLoad(50,t).weeklyDelta<=e.trainingLoad(0,t).weeklyDelta);
});
test('the zero-recovery full-allocation endpoint actually gains 100 over seven days, including weekends',()=>{
  const {state,player,policy}=fixture(40,0);player.fatigue=0;const n=e.advanceWeek(state,policy,player.stance);close(e.getPlayer(n).fatigue,100);close(n.report.fatigue.training,100);assert.equal(n.report.fatigue.days.length,7);assert.equal(e.getPlayer(n).forcedRest,true);conservation(n);
});
test('recovery 100 with zero allocation actually recovers 100 in a week and has no stat growth',()=>{
  const {state,player,policy}=fixture(0,100);player.fatigue=100;const before={...player.stats},n=e.advanceWeek(state,policy,player.stance);close(e.getPlayer(n).fatigue,0);close(n.report.fatigue.recovered,100);assert.deepEqual(e.getPlayer(n).stats,before);conservation(n);
});
test('forecast matches real weeks across stamina, recovery, allocation, clamping and forced-rest boundaries',()=>{
  for(const [r,stamina] of [[1,1],[50,50],[100,100],[1,100],[100,1]])for(const total of [0,5,10,20,40]){const {state,player,policy}=fixture(total,r,stamina);player.fatigue=total===0?100:30;const expected=e.fatigueForecast(player,policy,state.date),n=e.advanceWeek(state,policy,player.stance);close(expected.end,e.getPlayer(n).fatigue);close(expected.peak,n.report.fatigue.peak);close(expected.weeklyTraining,n.report.fatigue.training);close(expected.recovered,n.report.fatigue.recovered);conservation(n);}
});
test('stamina and old intensity tags do not add hidden factors to training fatigue',()=>{
  for(const mode of ['light','normal','hard'])for(const stamina of [1,50,100]){const {state,player}=fixture(20,50,stamina),plan=policy(20,mode),n=e.advanceWeek(state,plan,player.stance);close(e.getPlayer(n).fatigue,30+125/7);close(n.report.fatigue.training,125/7);conservation(n);}
});
test('capacity is separate from actual recovery, and zero fatigue never becomes negative',()=>{
  const {state,player,policy}=fixture(0,50);player.fatigue=10;const f=e.fatigueForecast(player,policy),n=e.advanceWeek(state,policy,player.stance);close(f.maxRecovery,60);close(f.recovered,10);close(e.getPlayer(n).fatigue,0);close(n.report.fatigue.recovered,10);conservation(n);
});
test('balanced low investment trains both fields while preserving current fatigue',()=>{
  const {state,player,policy}=fixture(10,50);policy.tickets=Object.fromEntries(Object.keys(policy.tickets).map(k=>[k,0]));policy.tickets.contact=5;policy.tickets.velocity=5;const before={...player.stats},n=e.advanceWeek(state,policy,player.stance);close(e.getPlayer(n).fatigue,30);assert.ok(e.getPlayer(n).stats.contact>before.contact);assert.ok(e.getPlayer(n).stats.velocity>before.velocity);close(n.report.fatigue.training,0);close(n.report.fatigue.recovered,0);conservation(n);
});
test('physical growth does not move a locked week fatigue baseline halfway through the week',()=>{
  const {state,player,policy}=fixture(40,50);player.fatigue=0;const n=e.advanceWeek(state,policy,player.stance);assert.ok(e.getPlayer(n).stats.recovery>50);close(e.getPlayer(n).fatigue,75);conservation(n);
});
test('injury and forced rest recover using zero allocation without erasing the saved plan',()=>{
  for(const kind of ['injury','forced']){const {state,player,policy}=fixture(20,50);player.fatigue=95;if(kind==='injury')player.injury={severity:'severe',startDate:state.date,unavailableUntil:e.addDays(state.date,14),originalPenalty:8,penaltyRemaining:8,penaltyRecoverDays:10};else player.forcedRest=true;const forecast=e.fatigueForecast(player,policy,state.date),n=e.advanceWeek(state,policy,player.stance);close(e.getPlayer(n).fatigue,forecast.end);assert.deepEqual(e.getPlayer(n).trainingPolicy,policy);if(kind==='injury'){close(e.getPlayer(n).fatigue,35);assert.deepEqual(e.getPlayer(n).stats,player.stats);}conservation(n);}
});
test('nontraining offseason weeks recover even when the saved allocation is high',()=>{
  const {state,player,policy}=fixture(40,50);state.date='2027-12-20';player.fatigue=95;const n=e.advanceWeek(state,policy,player.stance);close(n.report.fatigue.training,0);close(e.getPlayer(n).fatigue,35);assert.deepEqual(e.getPlayer(n).stats,player.stats);assert.deepEqual(e.getPlayer(n).trainingPolicy,policy);conservation(n);
});
test('match fatigue remains separate, contributes on top of the plan, and reconciles with daily reports',()=>{
  const {state,player,policy}=fixture(20,50);state.calendar.events=e.calendar(2027).events;state.date=state.calendar.events.find(g=>[g.homeTeamId,g.awayTeamId].includes(player.teamId)).date;for(const key of ['contact','power','speed','defense'])player.stats[key]=100;const n=e.advanceWeek(state,policy,player.stance);assert.ok(n.report.records.batting.PA>0);assert.ok(n.report.fatigue.game>0);assert.ok(n.report.fatigue.training>0);conservation(n);
});
test('checkpoint resumes preserve the weekly recovery baseline after a physical training choice',()=>{
  const {state,player,policy}=fixture(20,50);state.week=6;state.trainingFocus={rng:7,rolledWeek:-1};e.params['events.focus_chance']=1;e.params['events.weekly_chance']=1e-9;
  try{const paused=e.advanceWeek(state,policy,player.stance);assert.equal(paused.careerEvent.definitionId,'S03');const accepted=e.answerCareerEvent(paused,'physical');assert.ok(e.getPlayer(accepted).stats.recovery>50);close(new Map(accepted.weekProgress.fatigueRecoveryStats).get(player.id),50);const n=e.advanceWeek(accepted,policy,player.stance);close(e.getPlayer(n).fatigue,30+125/7);conservation(n);}finally{e.params['events.focus_chance']=0;e.params['events.weekly_chance']=0;}
});
test('legacy recovery and previous allocations persist until explicitly restored, with the new recovery formula',()=>{
  const {state,player,policy:plan}=fixture(40,50);player.fatigue=95;const rest=e.policyForMode(plan,'rest');assert.deepEqual(rest.previousTraining,plan);let s=e.advanceWeek(state,rest,player.stance);close(e.getPlayer(s).fatigue,35);assert.deepEqual(e.getPlayer(s).trainingPolicy,rest);s=e.advanceWeek(s,rest,player.stance);close(e.getPlayer(s).fatigue,0);assert.deepEqual(e.getPlayer(s).trainingPolicy,rest);assert.deepEqual(e.policyForMode(rest,plan.mode),plan);assert.deepEqual(e.getPlayer(s).stats,player.stats);assert.ok(e.validPolicy(plan));
});
test('the same game produces one tenth of the old player fatigue without changing its records', () => {
  const original = e.createGame('fatigue-game-scale', '피로검증', 'SP');
  const current = structuredClone(original), previous = structuredClone(original);
  const currentGame = current.calendar.events[0], previousGame = previous.calendar.events[0];
  const play = (state, game) => e.simulateGame(state, game, [game.homeTeamId, game.awayTeamId].map(teamId => state.players.filter(p => p.teamId === teamId)));
  play(current, currentGame);
  const keys = ['fatigue.field_game', 'fatigue.pitch_out', 'fatigue.no_out_cost'];
  const saved = keys.map(key => e.params[key]);
  try {
    keys.forEach((key, i) => { e.params[key] = [10, 1, .25][i]; });
    play(previous, previousGame);
  } finally {
    keys.forEach((key, i) => { e.params[key] = saved[i]; });
  }
  assert.equal(currentGame.status, 'completed');
  assert.deepEqual(currentGame.boxScore, previousGame.boxScore);
  assert.deepEqual(currentGame.score, previousGame.score);
  assert.ok(current.players.some(p => p.fatigue > 0));
  current.players.forEach((p, i) => close(p.fatigue, previous.players[i].fatigue / 10));
});
