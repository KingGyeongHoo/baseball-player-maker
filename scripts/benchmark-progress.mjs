import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';

const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const {advanceWeekInPlace}=require('../.test-build/lib/sim/week-engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const label=process.argv.find(arg=>arg.startsWith('--label='))?.split('=')[1]??'current';
mkdirSync('test-results',{recursive:true});
for(const key of ['events.weekly_chance','events.focus_chance','pro_events.general_chance','pro_events.game_chance'])e.params[key]=0;
const results=[];
for(const mode of ['school','pro']){
  let state=mode==='school'?e.createGame('progress-benchmark-school','성능확인','SS'):pc.acknowledgeCareer(pc.createProfessionalDemo('progress-benchmark-pro','성능확인','SS'));
  state.date=state.calendar.competitions.find(c=>c.id===(mode==='pro'?'pro-first':'weekend-first'))?.startDate??`${state.calendar.seasonYear}-04-06`;
  const times=[];
  for(let week=0;week<4;week++){
    const current=state.week,start=performance.now();let guard=0;
    while(state.week===current&&state.phase!=='ended'){
      if(++guard>80)throw new Error('Benchmark continuation did not complete');
      while(state.careerNotice)state=pc.acknowledgeCareer(state);
      if(state.careerEvent)state=e.answerCareerEvent(state,state.careerEvent.choices[0].id);
      const player=e.getPlayer(state);state=advanceWeekInPlace(state,player.trainingPolicy,player.stance);
    }
    times.push(Math.round(performance.now()-start));
  }
  const serialized=JSON.stringify(state);
  if(process.argv.includes('--snapshot'))writeFileSync(`test-results/progress-snapshot-${label}-${mode}.json`,serialized);
  results.push({mode,weeks:times.length,milliseconds:times,totalMs:times.reduce((a,b)=>a+b,0),players:state.players.length,bytes:Buffer.byteLength(serialized),checksum:createHash('sha256').update(serialized).digest('hex')});
}
writeFileSync(`test-results/progress-benchmark-${label}.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
