import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
const require = createRequire(import.meta.url);
const e = require('../.test-build/lib/sim/engine.js');
if (!isMainThread) {
  for (const seed of workerData.seeds) {
    let state = e.createGame(`balance-${seed}`, '검증선수', seed % 2 ? 'SP' : 'SS');
    const times = [];
    const totals = e.emptyRecord();
    let games = 0,
      forfeits = 0;
    while (state.phase !== 'ended') {
      if (state.careerEvent) state = e.answerCareerEvent(state, state.careerEvent.choices.find(c=>c.id === "routine")?.id ?? state.careerEvent.choices[0].id);
      const beforeDate = state.date;
      const p = e.getPlayer(state);
      const started = performance.now();
      state = e.advanceWeek(state, p.trainingPolicy, p.stance);
      times.push(performance.now() - started);
      for (const game of state.calendar.events.filter(g => g.date >= beforeDate && g.date < state.date && g.status !== 'scheduled')) {
        if (game.status === 'forfeit') {
          forfeits++;
          continue;
        }
        games++;
        for (const r of Object.values(game.boxScore)) e.mergeRecord(totals, r);
      }
    }
    const p = e.getPlayer(state);
    const grads = state.players.filter(p => p.grade === 3);
    const chosen = new Set(state.draft.map(d => d.playerId));
    parentPort.postMessage({
      seed,
      date: state.date,
      weeks: state.week - 1,
      drafted: chosen.has(p.id),
      ovr: e.ovr(p),
      growth: e.ovr(p) - e.ovr({
        ...p,
        stats: p.initialStats
      }),
      talent: p.talent[e.isPitcher(p.primaryRole) ? 'pitching' : 'batting'],
      injuryDays: state.injuryDays,
      times,
      games,
      forfeits,
      totals,
      graduates: grads.map(p => ({
        ovr: e.ovr(p),
        talent: p.talent[e.isPitcher(p.primaryRole) ? 'pitching' : 'batting'],
        growth: e.ovr(p) - e.ovr({
          ...p,
          stats: p.initialStats
        }),
        drafted: chosen.has(p.id)
      }))
    });
  }
} else {
  const count = Number(process.env.BALANCE_SEEDS || 100);
  const concurrency = Math.min(Number(process.env.BALANCE_WORKERS || 4), count);
  const started = performance.now();
  const results = [];
  const batches = Array.from({
    length: concurrency
  }, () => []);
  for (let n = 0; n < count; n++) batches[n % concurrency].push(n);
  await Promise.all(batches.map(seeds => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), {
      workerData: {
        seeds
      }
    });
    w.on('message', r => {
      results.push(r);
      if (results.length % 5 === 0 || results.length === count) console.log(`${results.length}/${count} careers completed (${Math.round((performance.now() - started) / 1000)}s)`);
    });
    w.once('error', reject);
    w.once('exit', code => code ? reject(new Error(`worker exit ${code}`)) : resolve());
  })));
  const times = results.flatMap(r => r.times).sort((a, b) => a - b);
  const graduates = results.flatMap(r => r.graduates);
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const total = e.emptyRecord();
  for (const r of results) e.mergeRecord(total, r.totals);
  const summary = {
    balanceVersion: require('../baseball_balance_v0_4.json').balanceVersion,
    environment: {
      node: process.version,
      platform: process.platform,
      cpu: os.cpus()[0].model,
      workers: concurrency,
      note: 'Node worker measurements; browser performance not claimed'
    },
    seeds: count,
    elapsedSeconds: (performance.now() - started) / 1000,
    weeklyP95Ms: times[Math.floor(times.length * .95)],
    weeklyMaxMs: times.at(-1),
    totalWeeks: times.length,
    endDates: [...new Set(results.map(r => r.date))],
    graduates: graduates.length,
    meanGraduateOvr: mean(graduates.map(p => p.ovr)),
    meanDraftedOvr: mean(graduates.filter(p => p.drafted).map(p => p.ovr)),
    meanUndraftedOvr: mean(graduates.filter(p => !p.drafted).map(p => p.ovr)),
    growthByTalent: Object.fromEntries(Array.from({
      length: 10
    }, (_, i) => [i + 1, mean(graduates.filter(p => p.talent === i + 1).map(p => p.growth))])),
    meanPlayerInjuryDays: mean(results.map(r => r.injuryDays)),
    games: results.reduce((a, r) => a + r.games, 0),
    forfeits: results.reduce((a, r) => a + r.forfeits, 0),
    battingAverage: total.batting.H / total.batting.AB,
    bbRate: total.batting.BB / total.batting.PA,
    kRate: total.batting.SO / total.batting.PA,
    hrRate: total.batting.HR / total.batting.PA,
    runsPerTeamGame: total.batting.R / results.reduce((a, r) => a + 2 * r.games, 0),
    playerDraftRate: mean(results.map(r => Number(r.drafted))),
    notice: '2026 reference windows with fictional entrants/brackets; these measurements do not establish final balance.'
  };
  mkdirSync('test-results', {
    recursive: true
  });
  writeFileSync('test-results/balance.json', JSON.stringify({
    summary,
    careers: results.map(r => Object.fromEntries(Object.entries(r).filter(([key]) => !["times", "graduates", "totals"].includes(key))))
  }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
