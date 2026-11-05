import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
const { pitchingPositions } = require('../.test-build/lib/player-creation.js');
const base = process.env.APP_URL || 'http://localhost:3000';
const response = await fetch(base);
assert.equal(response.status, 200);
const html = await response.text();
for (const label of ['BASEBALL', '나의 선수 만들기', '나의 커리어 시작하기', '어떤 선수로 시작할까요?', '랜덤 배정']) assert.ok(html.includes(label), label);
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
const ui = chunks.map(f => readFileSync('.next/static/chunks/' + f, 'utf8')).find(s => s.includes(bootstrap) && s.includes('onmessage'));
assert.ok(ui, 'worker factory in client bundle');
const configMatch = ui.match(/default\("static\/chunks\/turbopack-worker-[^"]+",(\[[^\]]+\])\)/);
assert.ok(configMatch, 'worker chunks');
const scripts = JSON.parse(configMatch[1]).map(p => '/_next/' + p).reverse();
const bootstrapPath = path.resolve('.next/static/chunks', bootstrap);
const code = `
const {parentPort}=require('node:worker_threads');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
globalThis.self=globalThis;
globalThis.WorkerGlobalScope=class {static [Symbol.hasInstance](obj){return obj===globalThis}};
globalThis.location=new URL('http://localhost:3000/_next/static/chunks/bootstrap?params='+encodeURIComponent(JSON.stringify([${JSON.stringify(scripts)},'', '/_next/'])));
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
  const blocked = await request({ requestId: 45, state: eventExpected, policy: eventPlayer.trainingPolicy, stance: eventPlayer.stance });
  assert.match(blocked.error, /イベント|이벤트/);
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
