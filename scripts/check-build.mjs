import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const { pitchingPositions } = require('../.test-build/lib/player-creation.js');
const base = process.env.APP_URL || 'http://localhost:3001';
const response = await fetch(base);
assert.equal(response.status, 200);
const html = await response.text();
for (const label of ['BASEBALL', '나의 선수 만들기', '나의 커리어 시작하기', '어떤 선수로 시작할까요?', '고교 선수로 시작하기', '프로 선수로 시작하기', '등번호 설정']) assert.ok(html.includes(label), label);
assert.ok(!html.includes('커리어 시드'));
assert.ok(!html.includes('<select'));
for (const { image: assetPath } of pitchingPositions) {
  const asset = await fetch(new URL(assetPath, base));
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /image\/png/);
  const optimized = await fetch(new URL(`/_next/image?url=${encodeURIComponent(assetPath)}&w=384&q=75`, base), { headers: { accept: 'image/webp' } });
  assert.equal(optimized.status, 200);
  assert.match(optimized.headers.get('content-type'), /^image\//);
}
const assets = [...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/g)].map(m => m[1]);
for (const asset of new Set(assets)) {
  const response = await fetch(new URL(asset, base));
  assert.equal(response.status, 200, asset);
}
const chunks = readdirSync('.next/static/chunks').filter(f => f.endsWith('.js'));
const bootstrap = chunks.find(f => readFileSync('.next/static/chunks/' + f, 'utf8').includes('Worker entrypoint must be loaded'));
// Autosave and simulation both use workers; select the simulation entrypoint.
const configs = chunks.flatMap(f => [...readFileSync('.next/static/chunks/' + f, 'utf8').matchAll(/default\("static\/chunks\/turbopack-worker-[^"]+",(\[[^\]]+\])\)/g)]);
const configMatch = configs.find(match => JSON.parse(match[1]).some(file => readFileSync(path.join('.next',file),'utf8').includes('주간 계산에 실패했습니다.')));
assert.ok(configMatch, 'simulation worker chunks');
const scripts = JSON.parse(configMatch[1]).map(p => '/_next/' + p).reverse();
const bootstrapPath = path.resolve('.next/static/chunks', bootstrap);
const code = `
const {parentPort}=require('node:worker_threads');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
globalThis.self=globalThis;
globalThis.WorkerGlobalScope=class {static [Symbol.hasInstance](obj){return obj===globalThis}};
globalThis.location=new URL(${JSON.stringify(new URL('/_next/static/chunks/bootstrap',base).href)}+'?params='+encodeURIComponent(JSON.stringify([${JSON.stringify(scripts)},'', '/_next/'])));
globalThis.importScripts=(...urls)=>{for(const url of urls){const relative=new URL(url).pathname.replace(/^\\/_next\\//,'');vm.runInThisContext(fs.readFileSync(path.join(${JSON.stringify(path.resolve('.next'))},relative),'utf8'),{filename:url});}};
globalThis.postMessage=data=>parentPort.postMessage(data);
vm.runInThisContext(fs.readFileSync(${JSON.stringify(bootstrapPath)},'utf8'));
parentPort.on('message',data=>globalThis.onmessage({data}));
`;
const worker = new Worker(code, {
  eval: true
});
const state = e.createGame('production-smoke', '검증', 'SP');
const p = e.getPlayer(state);
const expected = e.advanceWeek(state, p.trainingPolicy, p.stance);
function request(data) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { worker.off('message', onMessage); worker.off('error', onError); };
    const onMessage = data => { cleanup(); resolve(data); };
    const onError = error => { cleanup(); reject(error); };
    worker.once('message', onMessage);
    worker.once('error', onError);
    worker.postMessage(data);
  });
}
try {
  const result = await request({
    requestId: 41,
    state,
    policy: p.trainingPolicy,
    stance: p.stance
  });
  assert.equal(result.requestId, 41);
  assert.ok(result.result, result.error);
  assert.ok(result.result.report.processingMs >= 0);
  delete result.result.report.processingMs;
  assert.deepEqual(result.result, expected);
  assert.equal(result.result.evaluationSystem.version,1);
  assert.equal(e.getPlayer(result.result).reputationEvaluation.modelVersion,'evaluation-reputation-v1');
  assert.equal(e.getPlayer(result.result).reputation,e.reputationScore(e.getPlayer(result.result)));
  assert.ok(e.getPlayer(result.result).evaluationHistory.length>0);
  const recoveryPolicy = e.policyForMode(p.trainingPolicy, 'rest');
  const recovered = await request({ requestId: 43, state, policy: recoveryPolicy, stance: p.stance });
  assert.ok(recovered.result, recovered.error);
  delete recovered.result.report.processingMs;
  assert.deepEqual(recovered.result, e.advanceWeek(state, recoveryPolicy, p.stance));
  assert.deepEqual(e.getPlayer(recovered.result).trainingPolicy, recoveryPolicy);
  assert.deepEqual(e.policyForMode(e.getPlayer(recovered.result).trainingPolicy, p.trainingPolicy.mode), p.trainingPolicy);
  assert.equal(recovered.result.report.fatigue.training, 0);
  let eventInput, eventExpected;
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = e.createGame(`production-event-${attempt}`, '이벤트검증', 'SS');
    candidate.week = 6;
    const player = e.getPlayer(candidate);
    const next = e.advanceWeek(candidate, player.trainingPolicy, player.stance);
    if (next.careerEvent) { eventInput = candidate; eventExpected = next; break; }
  }
  assert.ok(eventInput, 'deterministic event fixture');
  const eventPlayer = e.getPlayer(eventInput);
  const eventResponse = await request({ requestId: 44, state: eventInput, policy: eventPlayer.trainingPolicy, stance: eventPlayer.stance });
  assert.ok(eventResponse.result, eventResponse.error);
  delete eventResponse.result.report.processingMs;
  assert.deepEqual(eventResponse.result, eventExpected);
  const answeredEvent = e.answerCareerEvent(eventResponse.result, eventResponse.result.careerEvent.choices[0].id);
  const resumedEvent = await request({ requestId: 46, state: answeredEvent, policy: e.getPlayer(answeredEvent).trainingPolicy, stance: e.getPlayer(answeredEvent).stance });
  assert.ok(resumedEvent.result, resumedEvent.error);
  delete resumedEvent.result.report.processingMs;
  assert.deepEqual(resumedEvent.result, e.advanceWeek(answeredEvent, e.getPlayer(answeredEvent).trainingPolicy, e.getPlayer(answeredEvent).stance));

  const { planEventWeek } = require('../.test-build/lib/sim/event-system.js');
  const sceneInput = e.createGame('production-scene', '장면검증', 'SP'), scenePlayer = e.getPlayer(sceneInput);
  const sceneGame = sceneInput.calendar.events.find(g => [g.homeTeamId,g.awayTeamId].includes(scenePlayer.teamId));
  sceneInput.calendar.events = [sceneGame]; sceneInput.calendar.competitions = []; sceneInput.date = sceneGame.date; sceneInput.week = 6;
  for (const key of Object.keys(scenePlayer.stats)) scenePlayer.stats[key] = 90;
  let scheduled = false;
  for (let seed=0; seed<50000; seed++) {
    const probe = { ...sceneInput, rngStates: { ...sceneInput.rngStates, events: seed } };
    const plan = planEventWeek(probe);
    if (plan?.definitionId === 'G04' && plan.date === sceneInput.date) { sceneInput.rngStates.events = seed; scheduled = true; break; }
  }
  assert.ok(scheduled, 'real mound scene fixture');
  const sceneResponse = await request({ requestId: 47, state: sceneInput, policy: scenePlayer.trainingPolicy, stance: scenePlayer.stance });
  assert.ok(sceneResponse.result, sceneResponse.error);
  delete sceneResponse.result.report.processingMs;
  assert.equal(sceneResponse.result.careerEvent.definitionId, 'G04');
  assert.ok(sceneResponse.result.matchProgress);
  assert.deepEqual(sceneResponse.result, e.advanceWeek(sceneInput, scenePlayer.trainingPolicy, scenePlayer.stance));
  const answeredScene = e.answerCareerEvent(sceneResponse.result, sceneResponse.result.careerEvent.choices[0].id);
  const resumedScene = await request({ requestId: 48, state: answeredScene, policy: scenePlayer.trainingPolicy, stance: scenePlayer.stance });
  assert.ok(resumedScene.result, resumedScene.error);
  delete resumedScene.result.report.processingMs;
  assert.deepEqual(resumedScene.result, e.advanceWeek(answeredScene, scenePlayer.trainingPolicy, scenePlayer.stance));
  assert.equal(resumedScene.result.matchProgress, undefined);
  assert.equal(resumedScene.result.matchEffect, undefined);
  const { opportunityState } = require('../.test-build/lib/sim/career-opportunities.js');
  const dualInput = e.createGame('production-two-way', '겸업검증', 'SS'), dualPlayer = e.getPlayer(dualInput);
  for (const key of Object.keys(dualPlayer.stats)) dualPlayer.stats[key] = 60;
  opportunityState(dualInput).qualifiedWeeks = 2;
  const dualResponse = await request({ requestId: 49, state: dualInput, policy: dualPlayer.trainingPolicy, stance: dualPlayer.stance });
  assert.ok(dualResponse.result, dualResponse.error); delete dualResponse.result.report.processingMs;
  assert.equal(dualResponse.result.careerEvent.definitionId, 'S01');
  assert.deepEqual(dualResponse.result, e.advanceWeek(dualInput, dualPlayer.trainingPolicy, dualPlayer.stance));
  const acceptedDual = e.answerCareerEvent(dualResponse.result, 'accept');
  const resumedDual = await request({ requestId: 50, state: acceptedDual, policy: dualPlayer.trainingPolicy, stance: dualPlayer.stance });
  assert.ok(resumedDual.result, resumedDual.error); delete resumedDual.result.report.processingMs;
  assert.deepEqual(resumedDual.result, e.advanceWeek(acceptedDual, dualPlayer.trainingPolicy, dualPlayer.stance));
  assert.ok(e.getPlayer(resumedDual.result).twoWay);
  const transferInput = e.createGame('production-transfer', '전학검증', 'SS'), transferPlayer = e.getPlayer(transferInput);
  transferInput.date = '2027-12-31'; transferInput.eventLedger = {recent:[],centerGrades:[],nationalGrades:[2,3],competitions:[],games:[]};
  const opportunities = opportunityState(transferInput); opportunities.transferOffered = true;
  opportunities.pendingTransfer = { offerId: 'production-transfer', fromTeamId: transferPlayer.teamId, toTeamId: 1, effectiveDate: '2028-01-01', kind: 'playingTime' };
  const joined = await request({ requestId: 51, state: transferInput, policy: transferPlayer.trainingPolicy, stance: transferPlayer.stance });
  assert.ok(joined.result, joined.error); delete joined.result.report.processingMs;
  assert.deepEqual(joined.result, e.advanceWeek(transferInput, transferPlayer.trainingPolicy, transferPlayer.stance));
  assert.equal(e.getPlayer(joined.result).teamId, 1); assert.equal(joined.result.date, '2028-01-01');
  const resumedJoin = await request({ requestId: 52, state: joined.result, policy: transferPlayer.trainingPolicy, stance: transferPlayer.stance });
  assert.ok(resumedJoin.result, resumedJoin.error); delete resumedJoin.result.report.processingMs;
  assert.deepEqual(resumedJoin.result, e.advanceWeek(joined.result, transferPlayer.trainingPolicy, transferPlayer.stance));
  assert.equal(resumedJoin.result.careerEventHistory.filter(event => event.definitionId === 'S02_JOIN').length, 1);
  const draftInput = e.createGame('production-draft-board', '드래프트검증', 'SS'), draftPlayer = e.getPlayer(draftInput);
  draftPlayer.grade = 3; draftInput.date = draftInput.calendar.draftDate;
  draftInput.eventLedger = {recent:[],centerGrades:[],nationalGrades:[2,3],competitions:[],games:[]};
  const draftResponse = await request({ requestId: 53, state: draftInput, policy: draftPlayer.trainingPolicy, stance: draftPlayer.stance });
  assert.ok(draftResponse.result, draftResponse.error); delete draftResponse.result.report.processingMs;
  assert.deepEqual(draftResponse.result, e.advanceWeek(draftInput, draftPlayer.trainingPolicy, draftPlayer.stance));
  assert.equal(draftResponse.result.phase, 'ended');
  assert.ok(draftResponse.result.draft.length >= 90 && draftResponse.result.draft.length <= 110);
  assert.ok(draftResponse.result.draft.every(pick => pick.round >= 1 && pick.round <= 13 && pick.slot >= 1 && pick.slot <= 10));
  const drawnClubs=e.draftClubOrder(draftResponse.result).map(index=>e.draftClubs[index]);
  assert.ok(draftResponse.result.draft.every(pick=>pick.club===drawnClubs[pick.slot-1]));
  assert.ok(draftResponse.result.draft.every(pick => pick.scoutingReport?.version === 1 && pick.scoutingReport.year === draftInput.calendar.seasonYear && pick.scoutingReport.statsSnapshot));
  assert.ok(draftResponse.result.draft.every(pick => pick.scoutingReport.evaluation?.modelVersion==='scouting-v1'&&pick.scoutingReport.evaluation.playerId===pick.playerId));

  const focusInput=e.createGame('production-focus','Focus','SS'),focusPlayer=e.getPlayer(focusInput);
  focusInput.week=6;focusInput.calendar.events=[];focusInput.calendar.competitions=[];focusInput.rngStates.events=1;focusInput.trainingFocus={rng:7,rolledWeek:-1};focusPlayer.fatigue=50;
  const focusResponse=await request({requestId:61,state:focusInput,policy:focusPlayer.trainingPolicy,stance:focusPlayer.stance});
  assert.ok(focusResponse.result,focusResponse.error);delete focusResponse.result.report.processingMs;
  assert.equal(focusResponse.result.careerEvent.definitionId,'S03');assert.deepEqual(focusResponse.result,e.advanceWeek(focusInput,focusPlayer.trainingPolicy,focusPlayer.stance));
  const focusRest=e.answerCareerEvent(focusResponse.result,'rest');assert.equal(focusRest.weekProgress.day.skipPlayerTraining,true);
  const focusResumed=await request({requestId:62,state:focusRest,policy:focusPlayer.trainingPolicy,stance:focusPlayer.stance});
  assert.ok(focusResumed.result,focusResumed.error);delete focusResumed.result.report.processingMs;
  assert.deepEqual(focusResumed.result,e.advanceWeek(focusRest,focusPlayer.trainingPolicy,focusPlayer.stance));
  assert.ok(e.getPlayer(focusResumed.result).fatigue<50);

  const pc=require('../.test-build/lib/sim/pro-career.js');
  const rookie=pc.acknowledgeCareer(pc.createProfessionalDemo('production-pro','Rookie','SS')),rp=e.getPlayer(rookie);
  const rookieWeek=await request({requestId:63,state:rookie,policy:rp.trainingPolicy,stance:rp.stance});
  assert.ok(rookieWeek.result,rookieWeek.error);delete rookieWeek.result.report.processingMs;
  assert.deepEqual(rookieWeek.result,e.advanceWeek(rookie,rp.trainingPolicy,rp.stance));
  assert.equal(e.getPlayer(rookieWeek.result).evaluationHistory.at(-1).mode,'pro');
  const callup=structuredClone(rookie);callup.date=callup.postSchool.pro.nextReviewDate;for(const key of Object.keys(e.getPlayer(callup).stats))e.getPlayer(callup).stats[key]=95;
  const promotion=await request({requestId:64,state:callup,policy:rp.trainingPolicy,stance:rp.stance});
  assert.ok(promotion.result,promotion.error);delete promotion.result.report.processingMs;
  assert.equal(promotion.result.careerNotice.kind,'promoted');assert.deepEqual(promotion.result,e.advanceWeek(callup,rp.trainingPolicy,rp.stance));
  const acknowledged=pc.acknowledgeCareer(promotion.result);
  const resumedPro=await request({requestId:65,state:acknowledged,policy:rp.trainingPolicy,stance:rp.stance});
  assert.ok(resumedPro.result,resumedPro.error);delete resumedPro.result.report.processingMs;
  assert.deepEqual(resumedPro.result,e.advanceWeek(acknowledged,rp.trainingPolicy,rp.stance));
  assert.equal(resumedPro.result.postSchool.pro.transactions.length,1);
  assert.equal(draftResponse.result.draftOutcome.revealed,false);
  const dc=require('../.test-build/lib/sim/draft-outcome.js');
  const graduate=structuredClone(draftResponse.result),prospect=e.getPlayer(graduate);
  graduate.draft=graduate.draft.filter(pick=>pick.playerId!==prospect.id);delete graduate.draftOutcome;
  prospect.stats.power=100;for(const other of graduate.players)if(other.id!==prospect.id)other.stats.power=Math.min(99,other.stats.power);
  const farm=pc.acknowledgeCareer(pc.continueCareer(dc.revealDraftResult(graduate),'developmental')),fp=e.getPlayer(farm);
  const farmWeek=await request({requestId:66,state:farm,policy:fp.trainingPolicy,stance:fp.stance});
  assert.ok(farmWeek.result,farmWeek.error);delete farmWeek.result.report.processingMs;
  assert.deepEqual(farmWeek.result,e.advanceWeek(farm,fp.trainingPolicy,fp.stance));assert.equal(e.getPlayer(farmWeek.result).proContract.status,'developmental');
  Object.assign(fp.seasonByLevel.second.batting,{PA:80,AB:72,H:25,BB:8,HR:2,'2B':5});fp.seasonStats=structuredClone(fp.seasonByLevel.second);
  const registered=await request({requestId:67,state:farm,policy:fp.trainingPolicy,stance:fp.stance});
  assert.ok(registered.result,registered.error);delete registered.result.report.processingMs;
  assert.equal(registered.result.careerNotice.kind,'registered');assert.equal(e.getPlayer(registered.result).proContract.status,'regular');
  assert.deepEqual(registered.result,e.advanceWeek(farm,fp.trainingPolicy,fp.stance));
  const regular=pc.acknowledgeCareer(registered.result);
  const regularWeek=await request({requestId:68,state:regular,policy:fp.trainingPolicy,stance:fp.stance});
  assert.ok(regularWeek.result,regularWeek.error);delete regularWeek.result.report.processingMs;
  assert.deepEqual(regularWeek.result,e.advanceWeek(regular,fp.trainingPolicy,fp.stance));assert.notEqual(regularWeek.result.careerNotice?.kind,'registered');
  const postseason=structuredClone(rookie);postseason.date=postseason.proWorld.regularEnd;postseason.proWorld.stage='regular';postseason.calendar.events=[];
  for(const player of postseason.players)if(player.professional)player.professional.lastRegistration=postseason.date;
  require('../.test-build/lib/sim/pro-event-ledger.js').ensureProEvents(postseason).plannedWeek=postseason.week;
  for(const club of postseason.proWorld.clubs)club.nextReview=e.addDays(postseason.date,14);
  const playoffStart=await request({requestId:70,state:postseason,policy:rp.trainingPolicy,stance:rp.stance});
  assert.ok(playoffStart.result,playoffStart.error);delete playoffStart.result.report.processingMs;
  assert.equal(playoffStart.result.proWorld.stage,'postseason');assert.deepEqual(playoffStart.result,e.advanceWeek(postseason,rp.trainingPolicy,rp.stance));
  const playoffResume=pc.acknowledgeCareer(playoffStart.result);
  const playoffs=await request({requestId:71,state:playoffResume,policy:rp.trainingPolicy,stance:rp.stance});
  assert.ok(playoffs.result,playoffs.error);delete playoffs.result.report.processingMs;assert.deepEqual(playoffs.result,e.advanceWeek(playoffResume,rp.trainingPolicy,rp.stance));
  const {encodeCareerSave,decodeCareerSave}=require('../.test-build/lib/career-save.js');
  const stored=decodeCareerSave(JSON.stringify(encodeCareerSave(playoffStart.result))).state;
  const fromSave=pc.acknowledgeCareer(stored),restored=await request({requestId:72,state:fromSave,policy:rp.trainingPolicy,stance:rp.stance});
  assert.ok(restored.result,restored.error);delete restored.result.report.processingMs;assert.deepEqual(restored.result,playoffs.result);
  const blocked = await request({ requestId: 45, state: eventExpected, policy: eventPlayer.trainingPolicy, stance: eventPlayer.stance });
  assert.match(blocked.error, /イベント|이벤트/);
  const proDual=structuredClone(rookie),pd=e.getPlayer(proDual);
  for(const key of ['velocity','control','movement'])pd.stats[key]=80;
  for(const key of ['contact','power','speed','defense'])pd.stats[key]=78;
  Object.assign(pd.professional.twoWayReview,{qualifiedDays:28,lastDate:e.addDays(proDual.date,-1)});
  const dualProResponse=await request({requestId:80,state:proDual,policy:pd.trainingPolicy,stance:pd.stance});
  assert.ok(dualProResponse.result,dualProResponse.error);delete dualProResponse.result.report.processingMs;
  assert.equal(dualProResponse.result.careerEvent.definitionId,'PRO16');
  assert.deepEqual(dualProResponse.result,e.advanceWeek(proDual,pd.trainingPolicy,pd.stance));
  const acceptedProDual=e.answerCareerEvent(dualProResponse.result,'accept');
  assert.equal(e.overall(e.getPlayer(acceptedProDual)),79);
  const resumedProDual=await request({requestId:81,state:acceptedProDual,policy:pd.trainingPolicy,stance:pd.stance});
  assert.ok(resumedProDual.result,resumedProDual.error);delete resumedProDual.result.report.processingMs;
  assert.deepEqual(resumedProDual.result,e.advanceWeek(acceptedProDual,pd.trainingPolicy,pd.stance));
  const stopDual=structuredClone(acceptedProDual),sd=e.getPlayer(stopDual);
  for(const key of ['velocity','control','movement'])sd.stats[key]=69;
  Object.assign(sd.professional.twoWayReview,{belowDays:28,lastDate:e.addDays(stopDual.date,-1)});
  const focusProResponse=await request({requestId:82,state:stopDual,policy:sd.trainingPolicy,stance:sd.stance});
  assert.ok(focusProResponse.result,focusProResponse.error);delete focusProResponse.result.report.processingMs;
  assert.equal(focusProResponse.result.careerEvent.definitionId,'PRO17');
  assert.deepEqual(focusProResponse.result,e.advanceWeek(stopDual,sd.trainingPolicy,sd.stance));
  const focusedPro=e.answerCareerEvent(focusProResponse.result,'focus');
  assert.equal(e.getPlayer(focusedPro).twoWay,undefined);
  assert.ok(e.getPlayer(focusedPro).eligiblePositions.every(pos=>!['SP','RP','CP'].includes(pos)));
  const focusProResume=await request({requestId:83,state:focusedPro,policy:sd.trainingPolicy,stance:sd.stance});
  assert.ok(focusProResume.result,focusProResume.error);delete focusProResume.result.report.processingMs;
  assert.deepEqual(focusProResume.result,e.advanceWeek(focusedPro,sd.trainingPolicy,sd.stance));

  const loadBase=e.createGame('production-free-training','FreeTraining','SS');loadBase.calendar.events=[];loadBase.calendar.competitions=[];
  const fullPolicy={mode:'normal',tickets:Object.fromEntries(Object.keys(p.trainingPolicy.tickets).map(key=>[key,5]))};
  let fullInput,fullExpected;
  for(let seed=0;seed<50;seed++){const candidate=structuredClone(loadBase),cp=e.getPlayer(candidate);cp.stats.recovery=0;cp.fatigue=0;candidate.rngStates.injury=seed;const predicted=e.advanceWeek(candidate,fullPolicy,cp.stance);if(!e.getPlayer(predicted).injury&&Math.abs(e.getPlayer(predicted).fatigue-100)<1e-8){fullInput=candidate;fullExpected=predicted;break;}}
  assert.ok(fullInput,'uninterrupted full-allocation anchor');
  const fullLoad=await request({requestId:90,state:fullInput,policy:fullPolicy,stance:e.getPlayer(fullInput).stance});
  assert.ok(fullLoad.result,fullLoad.error);delete fullLoad.result.report.processingMs;assert.deepEqual(fullLoad.result,fullExpected);
  assert.ok(Math.abs(e.getPlayer(fullLoad.result).fatigue-100)<1e-8);
  const zeroInput=structuredClone(loadBase),zp=e.getPlayer(zeroInput);zp.stats.recovery=100;zp.fatigue=100;
  const zeroPolicy={mode:'normal',tickets:Object.fromEntries(Object.keys(p.trainingPolicy.tickets).map(key=>[key,0]))};
  const zeroLoad=await request({requestId:91,state:zeroInput,policy:zeroPolicy,stance:zp.stance});
  assert.ok(zeroLoad.result,zeroLoad.error);delete zeroLoad.result.report.processingMs;
  assert.deepEqual(zeroLoad.result,e.advanceWeek(zeroInput,zeroPolicy,zp.stance));assert.equal(e.getPlayer(zeroLoad.result).fatigue,0);

  const disciplinePolicies=[['contact','power','speed','defense'],['velocity','control','movement']].map(keys=>({mode:'normal',tickets:Object.fromEntries(Object.keys(p.trainingPolicy.tickets).map(key=>[key,keys.includes(key)?5:0]))}));
  const weightedInput=structuredClone(loadBase),wp=e.getPlayer(weightedInput);wp.stats.recovery=50;wp.fatigue=30;
  for(let i=0;i<disciplinePolicies.length;i++){
    const policy=disciplinePolicies[i],response=await request({requestId:92+i,state:weightedInput,policy,stance:wp.stance});
    assert.ok(response.result,response.error);delete response.result.report.processingMs;
    assert.deepEqual(response.result,e.advanceWeek(weightedInput,policy,wp.stance));
    assert.ok(Math.abs(e.getPlayer(response.result).fatigue-(30+125/7))<1e-8,'equal batting/pitching full-focus fatigue');
  }

  const monthInput=structuredClone(state);monthInput.date='2027-04-01';monthInput.calendar.events=[];monthInput.calendar.competitions=[];monthInput.lastCareerEventWeek=monthInput.week;monthInput.trainingFocus={rng:0,rolledWeek:monthInput.week};
  const monthly=await request({requestId:94,state:monthInput,policy:p.trainingPolicy,stance:p.stance});
  assert.ok(monthly.result,monthly.error);delete monthly.result.report.processingMs;
  assert.deepEqual(monthly.result,e.advanceWeek(monthInput,p.trainingPolicy,p.stance));
  assert.ok(monthly.result.players.every(player=>player.evaluationHistory.some(row=>row.date==='2027-04-01'&&row.reason==='monthly')));
  assert.ok(monthly.result.players.every(player=>player.reputationEvaluation.modelVersion==='evaluation-reputation-v1'));
  assert.ok(monthly.result.players.every(player=>player.evaluationHistory.find(row=>row.date==='2027-04-01'&&row.reason==='monthly').reputation));

  // New catalog: a real rehabilitation reservation pauses and round-trips in
  // the bundled Worker without replaying already processed recovery days.
  const peInput=structuredClone(rookie),pep=e.getPlayer(peInput);peInput.calendar.events=[];peInput.lastCareerEventWeek=peInput.week;peInput.trainingFocus={rng:0,rolledWeek:peInput.week};pep.fatigue=60;
  for(const key of Object.keys(pep.trainingPolicy.tickets))pep.trainingPolicy.tickets[key]=0;
  pep.injury={severity:'mild',startDate:peInput.date,unavailableUntil:e.addDays(peInput.date,6),originalPenalty:2,penaltyRemaining:2,penaltyRecoverDays:7};
  let peExpected;for(let seed=0;seed<60;seed++){peInput.rngStates.events=seed;const next=e.advanceWeek(peInput,pep.trainingPolicy,pep.stance);if(next.careerEvent?.definitionId==='PE18'){peExpected=next;break;}}
  assert.ok(peExpected,'rehabilitation fixture');
  const proChoice=await request({requestId:95,state:peInput,policy:pep.trainingPolicy,stance:pep.stance});assert.ok(proChoice.result,proChoice.error);delete proChoice.result.report.processingMs;assert.deepEqual(proChoice.result,peExpected);assert.equal(proChoice.result.careerEvent.rewardVersion,3);
  const loadedChoice=decodeCareerSave(JSON.stringify(encodeCareerSave(proChoice.result))).state,chosenPro=e.answerCareerEvent(loadedChoice,'choice-2');
  const proResumed=await request({requestId:96,state:chosenPro,policy:pep.trainingPolicy,stance:pep.stance});assert.ok(proResumed.result,proResumed.error);delete proResumed.result.report.processingMs;assert.deepEqual(proResumed.result,e.advanceWeek(chosenPro,pep.trainingPolicy,pep.stance));assert.equal(proResumed.result.careerEventHistory.filter(row=>row.definitionId==='PE18').length,1);

  const bad = structuredClone(p.trainingPolicy);
  bad.tickets.contact = 99;
  const failed = await request({
    requestId: 42,
    state,
    policy: bad,
    stance: p.stance
  });
  assert.equal(failed.requestId, 42);
  assert.ok(failed.error);
  assert.equal(failed.result, undefined);
  console.log(`PASS: HTTP page, ${new Set(assets).size} assets, production Turbopack Worker success/error and sequential equality.`);
} finally {
  await worker.terminate();
}
