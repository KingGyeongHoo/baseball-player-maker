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
    worker.once('message', resolve);
    worker.once('error', reject);
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
