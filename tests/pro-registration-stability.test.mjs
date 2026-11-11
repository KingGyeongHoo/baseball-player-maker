import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),w=require('../.test-build/lib/sim/pro-world.js');
const base=pc.acknowledgeCareer(pc.createProfessionalDemo('stable-registration','안정검증','SS'));
function fixture(){const s=structuredClone(base),p=e.getPlayer(s);s.date='2028-05-01';s.proWorld.stage='regular';for(const q of s.players){q.fatigue=0;q.forcedRest=false;q.injury=null;delete q.professional.lastRegistration;}
 for(const q of s.players.filter(q=>q.teamId===0&&q.position==='SS'))q.teamId=10;p.teamId=0;p.proContract.status='regular';s.postSchool.pro.club=0;s.postSchool.pro.level='first';for(const k of Object.keys(p.stats))p.stats[k]=70;p.recentZ=0;
 while(s.players.filter(q=>q.teamId===0).length<29){const q=s.players.find(q=>q.teamId===10&&q.position!=='SS'&&!e.isPitcher(q.primaryRole));if(!q)break;q.teamId=0;}
 Object.assign(p.seasonByLevel.first.batting,{PA:110,AB:100,H:35});return s;
}
test('fatigue-only forced rest keeps a high-grade hitter in the first team instead of causing repeated demotion',()=>{
 const s=fixture(),p=e.getPlayer(s);for(const k of Object.keys(p.stats))p.stats[k]=90;p.fatigue=100;p.forcedRest=true;assert.ok(e.selectionScore(p)>=70);
 for(let i=0;i<3;i++){w.reviewLeagueRegistrations(s);assert.equal(p.teamId,0);s.date=e.addDays(s.date,14);}
});

test('season form is reflected in the displayed score, and a higher farm score needs no additional sample or ability hurdle',()=>{
 const s=fixture(),p=e.getPlayer(s),farm=s.players.filter(q=>q.teamId===10&&q.position==='SS'),up=farm[0];
 for(const q of farm){for(const k of Object.keys(q.stats))q.stats[k]=30;q.recentZ=0;q.seasonByLevel.second=e.emptyRecord();}
 for(const k of Object.keys(p.stats))p.stats[k]=90;
 Object.assign(p.seasonByLevel.first.batting,{PA:600,AB:550,H:220,HR:100,RBI:200,BB:50});
 p.recentZ=0;const seasonScore=e.selectionScore(p);p.recentZ=-3;assert.ok(seasonScore-e.selectionScore(p)<=1.05+1e-9);
 for(const k of Object.keys(up.stats))up.stats[k]=80;
 Object.assign(up.seasonByLevel.second.batting,{PA:400,AB:350,H:145,HR:40,BB:50});up.recentZ=3;
 assert.ok(e.selectionScore(p)>e.selectionScore(up));w.reviewLeagueRegistrations(s);assert.equal(p.teamId,0);
 // A higher displayed score is sufficient, even with only a few farm appearances.
 for(const k of Object.keys(p.stats))p.stats[k]=70;
 Object.assign(p.seasonByLevel.first.batting,{PA:400,AB:380,H:50,HR:2,RBI:10,BB:20});p.recentZ=0;
 for(const k of Object.keys(up.stats))up.stats[k]=75;
 up.seasonByLevel.second=e.emptyRecord();Object.assign(up.seasonByLevel.second.batting,{PA:4,AB:4,H:4,HR:4});
 assert.ok(e.selectionScore(up)>e.selectionScore(p));s.date=e.addDays(s.date,14);w.reviewLeagueRegistrations(s);assert.equal(up.teamId,0);assert.equal(p.teamId,10);
});
test('a higher farm selection score wins the same-position review even against an established first-team hitter',()=>{
 const s=fixture(),p=e.getPlayer(s);for(const q of s.players.filter(q=>q.teamId===10&&q.position==='SS')){for(const k of Object.keys(q.stats))q.stats[k]=76;q.recentZ=0;q.proContract.status='regular';}
 const rival=s.players.find(q=>q.teamId===10&&q.position==='SS');assert.ok(e.selectionScore(rival)>e.selectionScore(p));w.reviewLeagueRegistrations(s);assert.equal(p.teamId,10);
});
test('one review fills all earned places at a position instead of promoting only one farm candidate',()=>{
 const s=fixture(),p=e.getPlayer(s),farm=s.players.filter(q=>q.teamId===10&&q.position==='SS');assert.ok(farm.length>=3);
 for(const q of s.players)for(const key of Object.keys(q.stats))q.stats[key]=q.teamId===0?80:30;
 p.seasonByLevel.first=e.emptyRecord();for(const key of Object.keys(p.stats))p.stats[key]=50;
 const extra=farm.shift();extra.teamId=0;for(const key of Object.keys(extra.stats))extra.stats[key]=55;
 const bench=s.players.find(q=>q.teamId===0&&q.id!==p.id&&q.id!==extra.id&&!e.isPitcher(q.primaryRole)&&s.players.filter(r=>r.teamId===0&&r.position===q.position).length>1);assert.ok(bench);bench.teamId=10;
 farm.forEach((q,i)=>{q.proContract.status='regular';q.seasonByLevel.second=e.emptyRecord();for(const key of Object.keys(q.stats))q.stats[key]=90-i;});
 w.reviewLeagueRegistrations(s);
 assert.equal(p.teamId,10);assert.equal(extra.teamId,10);assert.equal(farm[0].teamId,0);assert.equal(farm[1].teamId,0);assert.equal(s.players.filter(q=>q.teamId===0).length,29);
});
test('a sustained large ability gap or a long injury can still justify a real registration change',()=>{
 for(const injury of [false,true]){const s=fixture(),p=e.getPlayer(s);for(const q of s.players.filter(q=>q.teamId===10&&q.position==='SS')){for(const k of Object.keys(q.stats))q.stats[k]=injury?60:85;q.recentZ=0;q.proContract.status='regular';}
 if(injury)p.injury={startDate:s.date,unavailableUntil:e.addDays(s.date,30),penaltyRemaining:5};w.reviewLeagueRegistrations(s);assert.equal(p.teamId,10);assert.equal(s.careerNotice.kind,'demoted');}
});
const assessment=require('../.test-build/lib/sim/pro-assessment.js');
function history(p,score){p.professional.assessments=[{year:2027,score,grade:'',cumulative:score,cumulativeGrade:'',ability:score,role:p.primaryRole,squad:'first',developmental:false,reserveSeason:false,source:'season-end',date:'2027-10-31'}];}
test('higher cumulative ratings require increasingly larger gaps and do not change the actual selection score',()=>{
 const s=fixture(),p=e.getPlayer(s),score=e.selectionScore(p);let previous=0;
 for(const value of [60,71,73,75,77,79,82]){history(p,value);const bonus=assessment.firstTeamRetention(p,2028).bonus;assert.ok(bonus>=previous);previous=bonus;assert.equal(e.selectionScore(p),score);}
 history(p,82);assert.equal(assessment.firstTeamRetention(p,2026).bonus,0);p.professional.assessments[0].score=null;assert.equal(assessment.firstTeamRetention(p,2028).bonus,0);
});
test('past cumulative ratings do not hide an additional hurdle when the current farm score is higher',()=>{
 for(const [past,rival] of [[60,80],[82,80],[82,95]]){
  const s=fixture(),p=e.getPlayer(s);p.seasonByLevel.first=e.emptyRecord();history(p,past);
  for(const q of s.players.filter(q=>q.teamId===10&&q.position==='SS')){for(const k of Object.keys(q.stats))q.stats[k]=rival;q.recentZ=0;q.proContract.status='regular';}
  w.reviewLeagueRegistrations(s);assert.equal(p.teamId,10);
 }
});
test('elite history cannot block long-injury replacement and does not make a farm player automatically displace an incumbent',()=>{
 const s=fixture(),p=e.getPlayer(s);history(p,90);p.injury={startDate:s.date,unavailableUntil:e.addDays(s.date,30),penaltyRemaining:5};
 w.reviewLeagueRegistrations(s);assert.equal(p.teamId,10);
 const fresh=fixture(),mine=e.getPlayer(fresh);mine.teamId=10;history(mine,90);
 const incumbent=fresh.players.find(q=>q.id!==mine.id&&q.teamId===10&&q.position==='SS');incumbent.teamId=0;for(const k of Object.keys(incumbent.stats))incumbent.stats[k]=75;
 w.reviewLeagueRegistrations(fresh);assert.equal(mine.teamId,10);
});
