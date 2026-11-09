import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),w=require('../.test-build/lib/sim/pro-world.js');
const base=pc.acknowledgeCareer(pc.createProfessionalDemo('stable-registration','안정검증','SS'));
function fixture(){const s=structuredClone(base),p=e.getPlayer(s);s.date='2028-05-01';s.proWorld.stage='regular';for(const q of s.players){q.fatigue=0;q.forcedRest=false;q.injury=null;delete q.professional.lastRegistration;}
 for(const q of s.players.filter(q=>q.teamId===0&&q.position==='SS'))q.teamId=10;p.teamId=0;p.proContract.status='regular';s.postSchool.pro.club=0;s.postSchool.pro.level='first';for(const k of Object.keys(p.stats))p.stats[k]=70;p.recentZ=0;
 Object.assign(p.seasonByLevel.first.batting,{PA:110,AB:100,H:35});return s;
}
test('fatigue-only forced rest keeps a high-grade hitter in the first team instead of causing repeated demotion',()=>{
 const s=fixture(),p=e.getPlayer(s);for(const k of Object.keys(p.stats))p.stats[k]=90;p.fatigue=100;p.forcedRest=true;assert.ok(e.selectionScore(p)>=70);
 for(let i=0;i<3;i++){w.reviewLeagueRegistrations(s);assert.equal(p.teamId,0);s.date=e.addDays(s.date,14);}
});
test('an established .350 first-team hitter is retained against a small temporary selection-score gap',()=>{
 const s=fixture(),p=e.getPlayer(s);for(const q of s.players.filter(q=>q.teamId===10&&q.position==='SS')){for(const k of Object.keys(q.stats))q.stats[k]=76;q.recentZ=0;q.proContract.status='regular';}
 w.reviewLeagueRegistrations(s);assert.equal(p.teamId,0);
});
test('a sustained large ability gap or a long injury can still justify a real registration change',()=>{
 for(const injury of [false,true]){const s=fixture(),p=e.getPlayer(s);for(const q of s.players.filter(q=>q.teamId===10&&q.position==='SS')){for(const k of Object.keys(q.stats))q.stats[k]=injury?60:85;q.recentZ=0;q.proContract.status='regular';}
 if(injury)p.injury={startDate:s.date,unavailableUntil:e.addDays(s.date,30),penaltyRemaining:5};w.reviewLeagueRegistrations(s);assert.equal(p.teamId,10);assert.equal(s.careerNotice.kind,'demoted');}
});
