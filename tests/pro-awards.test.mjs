import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const evaluation=require('../.test-build/lib/sim/pro-evaluation.js'),life=require('../.test-build/lib/sim/pro-season.js'),ceremonies=require('../.test-build/lib/sim/pro-awards-ceremony.js'),save=require('../.test-build/lib/career-save.js');
const {SeasonAwards}=require('../.test-build/app/components/pro-awards.js'),{CareerNoticeDialog}=require('../.test-build/app/components/career-continuation.js');
const {individualAwards}=require('../.test-build/lib/sim/pro-individual-awards.js'),{IndividualAwards,awardValueText}=require('../.test-build/app/components/pro-awards-hub.js'),AwardsHub=require('../.test-build/app/components/pro-awards-hub.js').default;
e.params['pro_events.enabled']=0;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('gold-glove-regression','황금선수','SS'));
function fixture(){
 const s=structuredClone(template),base=e.getPlayer(s);s.careerNotice=null;s.noticeQueue=[];s.careerEvent=null;delete s.weekProgress;delete s.matchProgress;s.players=[];s.calendar.events=[];s.date='2028-10-25';s.proWorld.year=2028;s.calendar.seasonYear=2028;s.proWorld.stage='regular';s.proWorld.seasonClosed=false;s.proWorld.seasons=[];
 for(const [i,position] of ['SP','RP','CP','C','1B','2B','3B','SS','LF','CF','RF','DH'].entries()){
  const p=structuredClone(base);p.id=`award-${position}`;p.name=`수상${position}`;p.position=position;p.primaryRole=e.roleFor(position);p.eligiblePositions=[position];p.teamId=i%10;p.professional.employment='active';p.professional.contract.endYear=2030;p.professional.contract.club=p.teamId;p.professional.firstClub=p.teamId;p.career=[];p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.seasonByClub={};p.seasonPostseason=e.emptyRecord();p.fatigue=0;p.injury=null;p.forcedRest=false;
  if(['SP','RP','CP'].includes(position))Object.assign(p.seasonByLevel.first.pitching,{outs:position==='SP'?540:180,BF:position==='SP'?730:245,SO:position==='SP'?180:70,ER:position==='SP'?50:22,BB:position==='SP'?35:20,H:position==='SP'?135:55,HR:position==='SP'?12:8});
  else Object.assign(p.seasonByLevel.first.batting,{PA:550,AB:500,H:170,'2B':30,'3B':3,HR:25,BB:50,RBI:85,R:75});
  p.seasonStats=structuredClone(p.seasonByLevel.first);s.players.push(p);
 }
 s.playerId='award-SS';return s;
}
const relevant=s=>evaluation.regularAwards(s).filter(row=>row.category);
function closed(){const s=fixture();life.closeProfessionalSeason(s);return pc.acknowledgeCareer(s);}

test('gold gloves select one unified pitcher and each of nine batting positions, plus one MVP, only from first-team records',()=>{
 const s=fixture(),awards=relevant(s),gold=awards.filter(row=>row.category==='goldGlove');assert.equal(gold.length,10);assert.equal(awards.filter(row=>row.category==='mvp').length,1);assert.deepEqual(gold.map(row=>row.position),evaluation.goldGlovePositions);assert.equal(gold.find(row=>row.position==='P').playerId,'award-SP');
 const before=JSON.stringify(awards);for(const p of s.players){for(const key of Object.keys(p.stats))p.stats[key]=p.id==='award-RP'?100:1;p.reputation=100;p.recentZ=50;p.fatigue=99;Object.assign(p.seasonByLevel.second.batting,{PA:900,H:800,HR:300});Object.assign(p.seasonPostseason.batting,{PA:100,H:100,HR:100});}for(const team of s.teams)team.wins=team.id===0?0:144;
 assert.equal(JSON.stringify(relevant(s)),before);assert.deepEqual(relevant(s),awards);
});

test('tiny samples cannot beat full seasons and position awards follow actual first-team starts rather than offseason positions',()=>{
 const s=fixture(),star=structuredClone(e.getPlayer(s));star.id='tiny-star';star.teamId=1;star.seasonByLevel.first=e.emptyRecord();Object.assign(star.seasonByLevel.first.batting,{PA:10,AB:10,H:10,HR:10});s.players.push(star);assert.ok(!relevant(s).some(row=>row.playerId===star.id));
 const p=e.getPlayer(s);p.position='LF';s.calendar.events=[{id:'actual-position',date:'2028-09-01',status:'completed',competitionId:'pro-first',proAppearances:{[p.id]:{level:'first',position:'SS',startedField:true}}}];assert.equal(evaluation.goldGloveAwards(s).find(row=>row.position==='SS').playerId,p.id);
 p.seasonByLevel.first.batting.PA=199;assert.equal(evaluation.goldGloveAwards(s).some(row=>row.position==='SS'),false);
});

test('December awards preserve frozen winners and records through contracts, reset and save/load',()=>{
 let s=closed();const season=s.proWorld.seasons[0],awards=structuredClone(season.awards),skills=s.players.map(p=>({...p.stats}));assert.equal(season.awardsCeremony.scheduledAt,'2028-12-06');assert.equal(ceremonies.presentAwardsCeremony(s),false);
 s.date='2028-12-06';assert.equal(ceremonies.presentAwardsCeremony(s),true);assert.equal(s.careerNotice.code,'awards:2028');assert.deepEqual(season.awards,awards);assert.deepEqual(s.players.map(p=>p.stats),skills);assert.equal(ceremonies.presentAwardsCeremony(s),false);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.deepEqual(restored.proWorld.seasons[0].awards,awards);assert.equal(restored.careerNotice.code,'awards:2028');
 s=pc.acknowledgeCareer(restored);s=life.actOnProCareer(s,{type:'nextSeason'});assert.equal(s.proWorld.stage,'camp');assert.equal(e.getPlayer(s).seasonByLevel.first.batting.PA,0);assert.deepEqual(s.proWorld.seasons[0].awards,awards);
});

test('camp shortcut pauses for the December ceremony and confirming resumes directly to camp once',()=>{
 const source=closed(),before=JSON.stringify(source);let s=life.actOnProCareer(source,{type:'nextSeason'});assert.equal(JSON.stringify(source),before);assert.equal(s.date,'2028-12-06');assert.equal(s.careerNotice.code,'awards:2028');assert.equal(s.proWorld.resumeCampAfterAwards,true);const awards=structuredClone(s.proWorld.seasons[0].awards);
 const html=renderToStaticMarkup(createElement(CareerNoticeDialog,{state:s,onChange(){}}));assert.ok(html.includes('시상식 마치고 캠프로'));assert.ok(html.includes('수상SS'));assert.ok(html.includes('시즌 기록'));
 s=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;s=pc.acknowledgeCareer(s);assert.equal(s.date,'2029-02-01');assert.equal(s.proWorld.stage,'camp');assert.equal(s.proWorld.resumeCampAfterAwards,undefined);assert.equal(s.careerNotice.title,'2029 캠프 시작');assert.deepEqual(s.proWorld.seasons[0].awards,awards);assert.equal(s.proWorld.news.filter(row=>row.id==='2028:awards:2028').length,1);
});

test('winner presentation uses snapshotted season records even after an offseason position or club change',()=>{
 const s=closed();s.date='2028-12-06';ceremonies.presentAwardsCeremony(s);const season=s.proWorld.seasons[0],html=renderToStaticMarkup(createElement(SeasonAwards,{state:s,season}));assert.ok(html.includes('550타석'));assert.ok(html.includes('180.0이닝'));assert.ok(html.includes('나'));
 for(const p of s.players){p.teamId=39;p.position='DH';p.seasonByLevel.first=e.emptyRecord();}assert.equal(renderToStaticMarkup(createElement(SeasonAwards,{state:s,season})),html);
});

test('legacy winter adds new gold gloves without replacing its announced MVP or replaying old ceremonies',()=>{
 const s=closed(),season=s.proWorld.seasons[0];delete season.awardsCeremony;season.awards=season.awards.filter(row=>row.category!=='goldGlove');const mvp=season.awards.find(row=>row.kind==='시즌 MVP');delete mvp.category;const winner=mvp.playerId;s.date='2028-12-10';assert.equal(ceremonies.presentAwardsCeremony(s),true);assert.equal(season.awards.find(row=>row.kind==='시즌 MVP').playerId,winner);assert.equal(season.awards.filter(row=>row.category==='goldGlove').length,10);assert.equal(ceremonies.presentAwardsCeremony(s),false);
 const late=closed();delete late.proWorld.seasons[0].awardsCeremony;late.date='2029-01-01';assert.equal(ceremonies.presentAwardsCeremony(late),false);
});

test('individual awards freeze only category leaders, retain ties and separate first and second league records',()=>{
 assert.equal(awardValueText({format:'rate',value:.34}),'.340');assert.equal(awardValueText({format:'innings',value:17}),'5.2');
 const s=fixture(),p=e.getPlayer(s);p.seasonByLevel.first.batting.HR=50;const tied=structuredClone(p);tied.id='tied-home-run';tied.name='공동홈런왕';s.players.push(tied);const farm=structuredClone(p);farm.id='farm-champion';farm.teamId=10;farm.seasonByLevel={first:e.emptyRecord(),second:structuredClone(p.seasonByLevel.first)};farm.seasonByLevel.second.batting.HR=70;s.players.push(farm);
 const rows=individualAwards(s),home=rows.find(row=>row.level==='first'&&row.metric==='HR'),second=rows.find(row=>row.level==='second'&&row.metric==='HR');assert.equal(home.value,50);assert.deepEqual(home.winners.map(row=>row.playerId).sort(),[p.id,tied.id].sort());assert.equal(second.value,70);assert.equal(second.winners[0].playerId,farm.id);assert.ok(!home.winners.some(row=>row.playerId===farm.id));
 life.closeProfessionalSeason(s);assert.deepEqual(s.proWorld.seasons[0].individualAwards,rows);
 const html=renderToStaticMarkup(createElement(IndividualAwards,{state:s,season:s.proWorld.seasons[0],onRecords(){}}));assert.ok(html.includes('공동 1위'));assert.ok(html.includes('공동홈런왕'));assert.ok(!html.includes('farm-champion'));assert.ok(!html.includes('2위'));
 const hub=renderToStaticMarkup(createElement(AwardsHub,{state:s,onRecords(){}}));for(const label of ['어워드','올스타','골든글러브','개인 수상'])assert.ok(hub.includes(label));assert.ok(!hub.includes('<dialog'));
});
