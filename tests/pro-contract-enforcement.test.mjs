import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js'),w=require('../.test-build/lib/sim/pro-world.js');
const market=require('../.test-build/lib/sim/pro-market.js'),squads=require('../.test-build/lib/sim/pro-squads.js');
const post=require('../.test-build/lib/sim/pro-postseason-roster.js'),life=require('../.test-build/lib/sim/pro-season.js');
const status=require('../.test-build/lib/sim/pro-registration-status.js'),save=require('../.test-build/lib/career-save.js');
e.params['pro_events.enabled']=0;e.params['events.focus_chance']=0;
const base=pc.acknowledgeCareer(pc.createProfessionalDemo('enforce-fa-promises','계약검증','SS'));
function fixture(){
 const s=structuredClone(base);s.date='2028-05-01';s.proWorld.stage='regular';
 for(const p of s.players){p.fatigue=0;p.forcedRest=false;p.injury=null;delete p.professional.lastRegistration;}
 return s;
}
function guarantee(p,level='first',end=2030){
 p.professional.contract={...p.professional.contract,startYear:2028,endYear:end,club:p.teamId%10,
  faTerms:{plan:'starter',title:'주전 보장',description:'test',position:p.position,startingLevel:level,starterGuaranteed:true}};
}
test('an accepted first-team FA promise wins actual lineups and blocks every ordinary and injury demotion',()=>{
 const s=fixture(),p=s.players.find(p=>p.teamId===0&&p.position==='SS');guarantee(p);
 for(const key of Object.keys(p.stats))p.stats[key]=35;
 for(const q of s.players.filter(q=>q.teamId===10&&q.position==='SS'))for(const key of Object.keys(q.stats))q.stats[key]=95;
 assert.equal(squads.setProSquad(s,p,'second'),false);
 for(const injured of [false,true]){
  if(injured)p.injury={startDate:s.date,unavailableUntil:e.addDays(s.date,40),penaltyRemaining:0};
  w.reviewLeagueRegistrations(s);assert.equal(p.teamId,0);s.date=e.addDays(s.date,14);
 }
 p.injury=null;const roster=s.players.filter(p=>p.teamId===0);
 assert.equal(w.professionalLineup(s,roster,s.date).field[1].id,p.id);
 // Loading an old squad model must also honor the signed promise.
 delete s.proWorld.squadsVersion;squads.reorganizeProSquads(s);assert.equal(p.teamId,0);
 assert.match(status.proRegistrationStatus(s,p),/FA.*1군/);
});
test('postseason expansion and the following opening-day cut retain the promised player even at the lowest score',()=>{
 const s=fixture(),p=s.players.find(p=>p.teamId===0&&p.position==='SS');guarantee(p);
 for(const key of Object.keys(p.stats))p.stats[key]=10;
 s.date='2028-10-01';s.proWorld.stage='postseason';s.proWorld.postseason={format:'kbo-v1',seeds:[0,1,2,3,4],series:[]};
 post.expandPostseasonRosters(s);assert.equal(p.teamId,0);assert.equal(s.players.filter(q=>q.teamId===0).length,32);
 s.proWorld.year=2029;s.calendar.competitions.find(c=>c.id==='pro-first').startDate='2029-03-22';s.date='2029-03-22';
 const changes=post.trimPostseasonRostersForOpening(s);assert.equal(p.teamId,0);assert.equal(s.players.filter(q=>q.teamId===0).length,29);
 assert.ok(!changes.flatMap(r=>r.players).includes(p));
});
test('an injured promised player stays first-team registered while the playoff playing roster uses a replacement',()=>{
 const s=fixture(),p=s.players.find(p=>p.teamId===0&&p.position==='SS');guarantee(p);
 p.injury={startDate:s.date,unavailableUntil:'2028-12-01',penaltyRemaining:0};s.proWorld.stage='postseason';
 s.proWorld.postseason={format:'kbo-v1',rosterVersion:1,seeds:[0,1],series:[{id:'test',stage:'final',clubs:[0,1],wins:[0,0],target:4,game:1,lastDate:s.date,rosters:{0:[p.id],1:[]},excluded:[]}]};
 life.preparePlayoffReplacements(s);assert.equal(p.teamId,0);
 assert.ok(!s.proWorld.postseason.series[0].rosters[0].includes(p.id));assert.ok(s.players.filter(q=>q.teamId===0).length<=29);
});
test('a saved mistaken demotion is repaired from the actual contract without changing records, RNG or roster size',()=>{
 const s=fixture(),p=s.players.find(p=>p.teamId===0&&p.position==='SS');guarantee(p);
 p.teamId=10;const second=s.players.find(q=>q.teamId===10&&q.id!==p.id&&q.position==='SS');second.teamId=0;
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
 const before=structuredClone(p.seasonStats),rng={...restored.rngStates};w.ensureProWorld(restored);
 const q=restored.players.find(q=>q.id===p.id);assert.equal(q.teamId,0);assert.deepEqual(q.seasonStats,before);assert.deepEqual(restored.rngStates,rng);
 assert.equal(restored.players.filter(q=>q.teamId===0).length,29);
});
test('second-team promises block third-team demotion and expire with the signed contract',()=>{
 const s=fixture(),p=e.getPlayer(s);p.teamId=p.teamId%10+10;guarantee(p,'second',2028);
 assert.equal(squads.setProSquad(s,p,'third'),false);
 s.date='2029-01-01';assert.equal(squads.setProSquad(s,p,'third'),true);
});
test('a promoted second-team promise cannot override an existing first-team starting promise',()=>{
 const s=fixture(),first=s.players.find(q=>q.teamId===0&&q.position==='SS'),second=s.players.find(q=>q.teamId===10&&q.position==='SS');
 guarantee(first);guarantee(second,'second');second.teamId=0;
 for(const key of Object.keys(first.stats))first.stats[key]=40;
 for(const key of Object.keys(second.stats))second.stats[key]=99;
 assert.equal(w.professionalLineup(s,s.players.filter(q=>q.teamId===0),s.date).field[1].id,first.id);
 delete s.proWorld.squadsVersion;squads.reorganizeProSquads(s);assert.equal(first.teamId,0);assert.equal(s.players.filter(q=>q.teamId===0).length,29);
});
test('repairing a legacy third-team demotion still takes the registered second-team step before the first team',()=>{
 const s=fixture(),p=s.players.find(q=>q.teamId===0&&q.position==='SS');guarantee(p);p.teamId=20;
 const before={...s.rngStates};squads.restoreGuaranteedSquads(s);assert.equal(p.teamId,10);
 squads.restoreGuaranteedSquads(s);assert.equal(p.teamId,10);
 s.date=e.addDays(s.date,1);w.reviewLeagueRegistrations(s);assert.equal(p.teamId,0);assert.deepEqual(s.rngStates,before);
});
test('the FA offer accepted through the public market API retains its role promise into the next season',()=>{
 const s=fixture(),p=e.getPlayer(s),club=p.teamId%10;
 const old=s.players.find(q=>q.teamId===club&&q.position===p.position);old.teamId=club+10;p.teamId=club;
 p.professional.faEligible=true;for(const key of Object.keys(p.stats))p.stats[key]=80;
 s.date='2028-11-01';s.proWorld.stage='summary';s.proWorld.seasonClosed=true;
 for(const q of s.players)if(q.id!==p.id&&q.position===p.position)for(const key of Object.keys(q.stats))q.stats[key]=40;
 const offers=Array.from({length:10},(_,c)=>market.offerFor(s,p,c,2029,'fa')).filter(Boolean),offer=offers.find(o=>o.faTerms?.plan==='starter');assert.ok(offer);
 market.signContract(s,p,offer);assert.equal(p.teamId,offer.club);assert.equal(p.professional.contract.faTerms.starterGuaranteed,true);
 s.date='2029-04-01';s.proWorld.year=2029;s.proWorld.stage='regular';
 for(const key of Object.keys(p.stats))p.stats[key]=20;
 w.reviewLeagueRegistrations(s);squads.normalizeFirstTeamRoster(s,offer.club);assert.equal(p.teamId,offer.club);
 assert.equal(squads.setProSquad(s,p,'second'),false);
});
