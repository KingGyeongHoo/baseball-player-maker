import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js'),awards=require('../.test-build/lib/sim/pro-evaluation.js');
const ceremony=require('../.test-build/lib/sim/pro-awards-ceremony.js'),bonuses=require('../.test-build/lib/sim/pro-award-bonuses.js');
const save=require('../.test-build/lib/career-save.js'),historical=require('../.test-build/lib/sim/pro-historical-awards.js');
const {recordRates}=require('../.test-build/lib/player-records.js'),{careerHonors}=require('../.test-build/lib/career-summary.js');
const {SeasonAwards}=require('../.test-build/app/components/pro-awards.js');
e.params['pro_events.enabled']=0;e.params['events.focus_chance']=0;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('rookie-and-compact','신인검증','1B'));
function fixture(){
 const s=structuredClone(template),p=e.getPlayer(s);s.players=[p];s.calendar.events=[];s.date='2028-10-25';s.calendar.seasonYear=2028;s.proWorld.year=2028;s.proWorld.stage='regular';s.proWorld.seasonClosed=false;s.proWorld.seasons=[];s.careerNotice=null;s.noticeQueue=[];
 p.teamId=0;p.position='1B';p.primaryRole='코너 야수';p.eligiblePositions=['1B'];p.professional.rookieYear=2024;p.professional.assessments=[];p.professional.firsts.debut='2025-04-01';p.career=[];p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.seasonStats=e.emptyRecord();delete p.twoWay;delete p.professional.awardBonuses;
 for(const key of Object.keys(p.stats))p.stats[key]=50;
 Object.assign(p.seasonByLevel.first.batting,{PA:550,AB:500,H:180,HR:30,RBI:100,BB:50});return s;
}
function prior(p,PA=0,outs=0){const first=e.emptyRecord(),second=e.emptyRecord();first.batting.PA=PA;first.pitching.outs=outs;p.career=[{year:2027,grade:0,careerMode:'pro',stats:{...p.stats},records:structuredClone(first),byLevel:{first,second},schoolId:0}];}
test('rookie eligibility includes exactly five entry seasons and prior first-team 60 PA or 30 innings, independent of debut year',()=>{
 const s=fixture(),p=e.getPlayer(s);prior(p,60,90);
 assert.equal(awards.rookieEligibility(p,2028,'batting'),true);assert.equal(awards.rookieEligibility(p,2028,'pitching'),true);
 p.professional.rookieYear=2023;assert.equal(awards.rookieEligibility(p,2028,'batting'),false);
 p.professional.rookieYear=2029;assert.equal(awards.rookieEligibility(p,2028,'batting'),false);
 p.professional.rookieYear=2024;prior(p,61,91);assert.equal(awards.rookieEligibility(p,2028,'batting'),false);assert.equal(awards.rookieEligibility(p,2028,'pitching'),false);
 prior(p,60,90);p.career[0].byLevel.second.batting.PA=9999;p.career[0].byLevel.second.pitching.outs=9999;assert.equal(awards.rookieEligibility(p,2028,'batting'),true);
 assert.equal(awards.rookieOfYearAward(s).playerId,p.id);
});
test('rookie candidates need 60 first-team PA or 30 first-team innings in any role',()=>{
 const s=fixture(),p=e.getPlayer(s);p.seasonByLevel.first=e.emptyRecord();p.seasonByLevel.second.batting.PA=1000;p.seasonPostseason.batting.PA=500;
 p.seasonByLevel.first.batting.PA=59;assert.equal(awards.rookieOfYearAward(s),undefined);p.seasonByLevel.first.batting.PA=60;assert.equal(awards.rookieOfYearAward(s).playerId,p.id);
 p.seasonByLevel.second.pitching.outs=360;p.seasonPostseason.pitching.outs=180;
 for(const position of ['SP','RP','CP']){p.position=position;p.primaryRole=e.roleFor(position);p.seasonByLevel.first=e.emptyRecord();Object.assign(p.seasonByLevel.first.pitching,{BF:120,SO:30,ER:10,outs:89});assert.equal(awards.rookieOfYearAward(s),undefined);p.seasonByLevel.first.pitching.outs=90;assert.equal(awards.rookieOfYearAward(s).field,'pitching');}
});
test('exactly one rookie wins on actual records rather than skills, and sits below MVP at the December ceremony',()=>{
 const s=fixture(),p=e.getPlayer(s),rival=structuredClone(p);rival.id='other-rookie';rival.name='다른신인';rival.seasonByLevel.first.batting.H=140;for(const key of Object.keys(rival.stats))rival.stats[key]=99;s.players.push(rival);
 const before=structuredClone(s),winner=awards.rookieOfYearAward(s);assert.equal(winner.playerId,p.id);assert.deepEqual(s,before);
 const rows=awards.regularAwards(s);assert.equal(rows.filter(r=>r.category==='rookie').length,1);
 const season={year:2028,awards:rows},html=renderToStaticMarkup(createElement(SeasonAwards,{state:s,season}));
 assert.ok(html.includes('1군 MVP')&&html.indexOf('1군 MVP')<html.indexOf('신인상'));assert.doesNotMatch(html,/골든글러브/);
});
test('MVP, gold glove and rookie bonuses take effect only when presented and never duplicate on repeated acknowledgments or reloads',()=>{
 const s=fixture(),p=e.getPlayer(s),rows=awards.regularAwards(s),season={year:2028,endDate:s.date,standings:[],farmStandings:[],champion:0,awards:rows,draft:[],rookieRulesVersion:1,awardsCeremony:{version:1,scheduledAt:'2028-12-06'}};
 s.proWorld.seasonClosed=true;s.proWorld.seasons=[season];const score=e.selectionScore(p),stats={...p.stats};
 bonuses.syncAwardBonuses(s);assert.equal(e.selectionScore(p),score);s.date='2028-12-06';assert.equal(ceremony.presentAwardsCeremony(s),true);
 const expected=Math.min(10,rows.filter(r=>r.playerId===p.id&&r.category).reduce((n,r)=>n+bonuses.awardBonusPoints[r.category],0));
 assert.ok(expected>=2);assert.equal(e.selectionScore(p),score+expected);assert.deepEqual(p.stats,stats);
 const ledger=structuredClone(p.professional.awardBonuses);assert.equal(ceremony.presentAwardsCeremony(s),false);bonuses.syncAwardBonuses(s);assert.deepEqual(p.professional.awardBonuses,ledger);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.deepEqual(e.getPlayer(restored).professional.awardBonuses,ledger);assert.equal(e.selectionScore(e.getPlayer(restored)),score+expected);
});
test('historical rookie and home-run titles use archived final records, preserve frozen MVPs and appear in career honors once',()=>{
 const s=fixture(),p=e.getPlayer(s),record=structuredClone(p.seasonByLevel);Object.assign(record.second.batting,{PA:100,AB:90,H:40,HR:26});
 p.career=[{year:2028,grade:0,careerMode:'pro',stats:{...p.stats},records:e.emptyRecord(),byLevel:record,schoolId:10}];p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.seasonByLevel.second.batting.HR=999;
 s.calendar.seasonYear=2029;s.proWorld.year=2029;s.date='2029-06-01';s.proWorld.seasons=[{year:2028,standings:[],farmStandings:[],champion:0,awards:[{year:2028,kind:'시즌 MVP',category:'mvp',playerId:'frozen-mvp',playerName:'기존MVP',club:0,value:99}],draft:[],awardsCeremony:{version:1,scheduledAt:'2028-12-06',presentedAt:'2028-12-06'}}];
 const report=historical.backfillSeasonHonors(s);assert.equal(report.rookies[0].playerId,p.id);assert.equal(report.homeRuns.find(r=>r.level==='second').value,26);
 assert.equal(s.proWorld.seasons[0].rookieRulesVersion,awards.rookieRulesVersion);
 assert.equal(s.proWorld.seasons[0].awards.find(r=>r.category==='mvp').playerId,'frozen-mvp');assert.ok(careerHonors(s).individual.some(r=>r.title==='2군 홈런왕'));
 const state=structuredClone(s);assert.equal(historical.backfillSeasonHonors(s).changed,false);assert.deepEqual(s,state);
});
test('sparse saves omit only unused opposite-field NPC records and retain my data, two-way data, actual former-role results and pending cursors',()=>{
 const s=fixture(),mine=e.getPlayer(s),npc=structuredClone(mine),pitcher=structuredClone(mine),twoWay=structuredClone(mine);
 npc.id='npc-batter';pitcher.id='npc-pitcher';pitcher.position='SP';pitcher.primaryRole='선발';pitcher.seasonByLevel.first=e.emptyRecord();pitcher.seasonByLevel.first.pitching.outs=12;
 twoWay.id='npc-two-way';twoWay.twoWay={pitchingPosition:'SP',battingPosition:'1B',nextAssignment:'batting',reputationBonus:0};
 npc.career=[{year:2027,grade:0,careerMode:'pro',stats:{...npc.stats},records:e.emptyRecord()}];npc.career[0].records.pitching.outs=9;
 s.players.push(npc,pitcher,twoWay);const before=structuredClone(s),file=save.encodeCareerSave(s),text=save.serializeCareerSave(file),wire=JSON.parse(text);
 assert.equal(wire.version,2);assert.equal(wire.state.players.find(p=>p.id===npc.id).seasonByLevel.first.pitching,undefined);
 assert.equal(wire.state.players.find(p=>p.id===pitcher.id).seasonByLevel.first.batting,undefined);
 assert.ok(wire.state.players.find(p=>p.id===twoWay.id).seasonByLevel.first.pitching);assert.ok(wire.state.players.find(p=>p.id===mine.id).seasonByLevel.first.pitching);
 assert.equal(wire.state.players.find(p=>p.id===npc.id).career[0].records.pitching.outs,9);
 const decoded=save.decodeCareerSave(text).state;assert.deepEqual(e.getPlayer(decoded).career,mine.career);assert.deepEqual(e.getPlayer(decoded).seasonByLevel,mine.seasonByLevel);assert.deepEqual(decoded.rngStates,s.rngStates);assert.equal(decoded.players.find(p=>p.id===npc.id).seasonByLevel.first.pitching.outs,0);assert.deepEqual(s,before);
 const corrupt=JSON.parse(text);corrupt.state.players[0].name='변조';assert.throws(()=>save.decodeCareerSave(JSON.stringify(corrupt)),/무결성/);
});
test('NPCs keep season final totals while my full history and reports remain unchanged',()=>{
 const s=fixture(),mine=e.getPlayer(s),npc=structuredClone(mine);npc.id='old-npc';
 for(const p of [mine,npc]){p.career=[{year:2027,grade:0,careerMode:'pro',stats:{...p.stats},records:e.emptyRecord(),byLevel:structuredClone(p.seasonByLevel),byClub:{},spring:e.emptyRecord(),schoolName:'이전 팀'}];p.professional.assessments=[{year:2027,date:'2027-10-31',score:75,cumulative:75,ability:50,role:p.primaryRole,squad:'first',developmental:false,reserveSeason:false,firstTeam:true,secondOnly:false,firstGames:40,source:'season-end'}];}
 npc.evaluationHistory=structuredClone(mine.evaluationHistory);s.players.push(npc);const before=structuredClone(s),packed=save.encodeCareerSave(s).state,own=packed.players[0],other=packed.players[1];
 assert.deepEqual(own.career,mine.career);assert.deepEqual(own.evaluationHistory,mine.evaluationHistory);assert.equal(other.evaluationHistory,undefined);assert.equal(other.career[0].stats,undefined);assert.equal(other.career[0].byClub,undefined);assert.equal(other.career[0].spring,undefined);assert.deepEqual(other.career[0].byLevel,npc.career[0].byLevel);assert.equal(other.career[0].schoolName,'이전 팀');assert.deepEqual(s,before);
});
test('compressed exports and legacy JSON import identically, and corrupted compressed files leave the original untouched',async()=>{
 const s=fixture(),before=structuredClone(s),result=await save.exportCareerSave(s);assert.equal(result.extension,'json.gz');
 const magic=new Uint8Array(await result.blob.slice(0,2).arrayBuffer());assert.deepEqual([...magic],[31,139]);
 const restored=await save.importCareerSave(result.blob),legacy=await save.importCareerSave(new Blob([JSON.stringify(save.encodeCareerSave(s))]));
 assert.deepEqual(restored.state.rngStates,legacy.state.rngStates);assert.deepEqual(e.getPlayer(restored.state).seasonByLevel,e.getPlayer(legacy.state).seasonByLevel);assert.deepEqual(s,before);
 await assert.rejects(save.importCareerSave(new Blob([new Uint8Array([31,139,1,2,3])])),/압축/);
});
test('home runs count once in hits and once in their home-run subcategory, never twice in batting average',()=>{
 const record=e.emptyRecord();Object.assign(record.batting,{PA:10,AB:10,H:3,HR:1});assert.equal(recordRates(record).average,.3);assert.equal(recordRates(record).slugging,.6);
});
test('each postseason series awards a real winner and applies a distinct immediate bonus exactly once',()=>{
 const s=fixture(),p=e.getPlayer(s),{settleSeriesMvp}=require('../.test-build/lib/sim/pro-series-awards.js'),{PostseasonAwards}=require('../.test-build/app/components/pro-awards-hub.js');s.proWorld.postseason={seeds:[0,1,2,3,4],series:[]};
 const before=e.selectionScore(p),stats={...p.stats},rng={...s.rngStates};
 for(const stage of ['wildcard','semi','playoff','final']){
  const series={id:stage,stage,clubs:[0,1],wins:[2,0],target:2,game:1,lastDate:s.date,winner:0,rosters:{0:[p.id],1:[]},excluded:[]};s.proWorld.postseason.series.push(series);
  const records=e.emptyRecord();Object.assign(records.batting,{PA:4,AB:4,H:3,HR:2,RBI:5,R:2});s.calendar.events.push({id:'series-'+stage,date:s.date,competitionId:'pro-playoffs-'+stage,homeTeamId:0,awayTeamId:1,status:'completed',score:[5,1],boxScore:{[p.id]:records},lineup:[],innings:[[],[]]});
  assert.equal(settleSeriesMvp(s,series),true);assert.equal(series.mvp.playerId,p.id);assert.equal(settleSeriesMvp(s,series),false);assert.deepEqual(series.mvp.records,records);
 }
 assert.equal(e.selectionScore(p),before+4);assert.equal(p.professional.awardBonuses.length,4);assert.equal(careerHonors(s).individual.filter(row=>row.title.endsWith('MVP')).length,4);
 const Bracket=require('../.test-build/app/components/postseason-bracket.js').default;s.proWorld.stage='postseason';const bracket=renderToStaticMarkup(createElement(Bracket,{state:s}));assert.match(bracket,new RegExp('class="postseason-format">시리즈 MVP <b>'+p.name));assert.ok(!bracket.includes('postseason-series-mvp'));assert.ok(!bracket.includes('2선승 · 4위 1승 선취'));
 const html=renderToStaticMarkup(createElement(PostseasonAwards,{state:s,year:2028,onRecords(){}}));for(const label of ['와일드카드','준플레이오프','플레이오프','한국시리즈'])assert.ok(html.includes(label));
 const loaded=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;assert.equal(e.selectionScore(e.getPlayer(loaded)),before+4);assert.equal(e.getPlayer(loaded).professional.awardBonuses.length,4);assert.deepEqual(p.stats,stats);assert.deepEqual(s.rngStates,rng);
 s.proWorld.seasons=[{year:2028,awards:s.proWorld.postseason.series.map(series=>series.mvp),draft:[],standings:[],farmStandings:[],champion:0,awardsCeremony:{version:1,scheduledAt:'2028-12-06'}}];delete s.proWorld.postseason;bonuses.syncAwardBonuses(s);assert.equal(e.selectionScore(p),before+4,'series awards remain active before the December ceremony and after next season');
});
test('forfeit-only series cannot invent an MVP or a bonus',()=>{
 const s=fixture(),p=e.getPlayer(s),series={id:'wildcard',stage:'wildcard',clubs:[0,1],wins:[2,0],target:2,game:1,lastDate:s.date,winner:0,rosters:{0:[p.id],1:[]},excluded:[]};assert.equal(require('../.test-build/lib/sim/pro-series-awards.js').settleSeriesMvp(s,series),false);assert.equal(series.mvp,undefined);assert.equal(p.professional.awardBonuses,undefined);
});
test('MVP, rookie and positional gold glove celebrations follow the ceremony one at a time and survive mid-queue reload',()=>{
 let s=fixture();const p=e.getPlayer(s),rows=awards.regularAwards(s);s.proWorld.seasonClosed=true;s.phase='ended';s.proWorld.stage='summary';s.proWorld.seasons=[{year:2028,endDate:s.date,standings:[],farmStandings:[],champion:0,awards:rows,draft:[],rookieRulesVersion:1,awardsCeremony:{version:1,scheduledAt:'2028-12-06'}}];
 s.date='2028-12-06';const before=e.selectionScore(p);ceremony.presentAwardsCeremony(s);const score=e.selectionScore(p),ledger=structuredClone(p.professional.awardBonuses);assert.equal(s.careerNotice.code,'awards:2028');assert.deepEqual(s.noticeQueue.filter(row=>row.award).map(row=>row.award.title),['MVP','신인왕','1루수 골든글러브']);
 s=pc.acknowledgeCareer(pc.acknowledgeCareer(s));if(s.careerNotice.code==='club-award:2028')s=pc.acknowledgeCareer(s);
 const {CareerNoticeDialog}=require('../.test-build/app/components/career-continuation.js'),html=renderToStaticMarkup(createElement(CareerNoticeDialog,{state:s,onChange(){}}));assert.ok(html.includes('2028년 <span class="award-celebration-title">MVP</span>를 획득했다!!'));assert.ok(html.includes('+3'));assert.equal(s.careerNotice.award.before,before);
 s=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;const titles=[];while(s.careerNotice?.award){titles.push(s.careerNotice.award.title);s=pc.acknowledgeCareer(s);}assert.deepEqual(titles,['MVP','신인왕','1루수 골든글러브']);assert.equal(s.careerNotice.title,'타이틀 획득!');s=pc.acknowledgeCareer(s);assert.deepEqual(e.getPlayer(s).professional.awardBonuses,ledger);assert.equal(e.selectionScore(e.getPlayer(s)),score);assert.equal(ceremony.presentAwardsCeremony(s),false);assert.equal(s.noticeQueue.length,0);
});


function farmAndFirstSeries(s,{awarded=false}={}){
 const p=e.getPlayer(s);p.teamId=10;s.proWorld.postseason={seeds:[0,1,2,3,4],series:[]};s.proWorld.farmPostseason={seeds:[10,11,12,13],series:[],champion:10};
 const {settleSeriesMvp}=require('../.test-build/lib/sim/pro-series-awards.js');
 for(const [level,id,stage,clubs] of [['second','semi-a','semi',[10,13]],['second','final','final',[10,11]],['first','final','final',[0,1]]]){
  const series={id,stage,clubs,wins:[3,0],target:3,game:1,lastDate:s.date,winner:clubs[0],rosters:{[clubs[0]]:[p.id],[clubs[1]]:[]},excluded:[]};
  s.proWorld[level==='second'?'farmPostseason':'postseason'].series.push(series);
  const records=e.emptyRecord();Object.assign(records.batting,{PA:4,AB:4,H:level==='first'?1:3,HR:level==='first'?0:2,RBI:3});
  s.calendar.events.push({id:`${level}-${id}`,date:s.date,competitionId:`${level==='second'?'pro-farm-playoffs':'pro-playoffs'}-${id}`,homeTeamId:clubs[0],awayTeamId:clubs[1],round:1,status:'completed',score:[7,1],boxScore:{[p.id]:records},lineup:[],innings:[[],[]]});
  if(awarded)assert.equal(settleSeriesMvp(s,series,true,{level}),true);
 }
 return p;
}
test('farm and first-team series with identical IDs keep independent records, career honors and bonuses',()=>{
 const s=fixture(),before=e.selectionScore(e.getPlayer(s)),stats={...e.getPlayer(s).stats},rng={...s.rngStates},p=farmAndFirstSeries(s,{awarded:true});
 assert.equal(e.selectionScore(p),before+3);assert.equal(p.professional.awardBonuses.length,3);
 assert.equal(s.proWorld.postseason.series[0].mvp.records.batting.H,1);assert.equal(s.proWorld.farmPostseason.series[1].mvp.records.batting.H,3);
 const titles=careerHonors(s).individual.map(row=>row.title);for(const title of ['한국시리즈 MVP','2군 준결승 1 MVP','2군 챔피언결정전 MVP'])assert.ok(titles.includes(title));
 const {PostseasonAwards}=require('../.test-build/app/components/pro-awards-hub.js');
 const farmHtml=renderToStaticMarkup(createElement(PostseasonAwards,{state:s,year:2028,onRecords(){}}));
 assert.ok(farmHtml.includes('2군 준결승 1'));assert.ok(farmHtml.includes('2군 준결승 2'));assert.ok(farmHtml.includes('2군 챔피언결정전'));assert.ok(!farmHtml.includes('<h3>한국시리즈</h3>'));assert.equal((farmHtml.match(/출전평가 \+1/g)??[]).length,0);
 const firstHtml=renderToStaticMarkup(createElement(PostseasonAwards,{state:s,year:2028,initialLevel:'first',onRecords(){}}));assert.ok(firstHtml.includes('<h3>한국시리즈</h3>'));assert.equal((firstHtml.match(/출전평가 \+1/g)??[]).length,0);
 const restored=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;assert.equal(e.selectionScore(e.getPlayer(restored)),before+3);assert.deepEqual(e.getPlayer(restored).professional.awardBonuses,p.professional.awardBonuses);
 assert.deepEqual(p.stats,stats);assert.deepEqual(s.rngStates,rng);
});
test('loading a completed farm postseason restores missing MVPs silently and never duplicates rewards or archived honors',()=>{
 const s=fixture(),p=farmAndFirstSeries(s),before=e.selectionScore(p),news=structuredClone(s.proWorld.news),rng={...s.rngStates};
 s.proWorld.seasons=[{year:2028,standings:[],farmStandings:[],champion:0,farmChampion:10,farmPostseason:structuredClone(s.proWorld.farmPostseason),awards:[],draft:[],rookieRulesVersion:1,individualAwards:[]}];
 const original=structuredClone(s),restored=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;
 assert.deepEqual(s,original);assert.equal(e.selectionScore(e.getPlayer(restored)),before+3);
 assert.equal(restored.proWorld.farmPostseason.series.filter(row=>row.mvp).length,2);
 assert.equal(restored.proWorld.seasons[0].awards.filter(row=>row.category==='seriesMvp').length,3);
 assert.equal(restored.proWorld.seasons[0].farmPostseason.series.filter(row=>row.mvp).length,2);
 assert.deepEqual(restored.proWorld.news,news);assert.deepEqual(restored.rngStates,rng);
 const once=structuredClone(restored);assert.equal(historical.backfillSeasonHonors(restored).changed,false);assert.deepEqual(restored,once);
 const twice=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(restored))).state;assert.equal(e.selectionScore(e.getPlayer(twice)),before+3);assert.equal(e.getPlayer(twice).professional.awardBonuses.length,3);
 const bad=structuredClone(restored);e.getPlayer(bad).professional.awardBonuses.push(structuredClone(e.getPlayer(bad).professional.awardBonuses.find(row=>row.level==='second')));assert.throws(()=>save.validateCareerState(bad),/수상 출전평가/);
 // A later campaign must not invent winners from regular-season totals or reuse another year's series games.
 const old=fixture();farmAndFirstSeries(old);old.proWorld.seasons=[{year:2027,standings:[],farmStandings:[],champion:0,farmPostseason:structuredClone(old.proWorld.farmPostseason),awards:[],draft:[],rookieRulesVersion:1,individualAwards:[]}];
 historical.backfillSeasonHonors(old);assert.ok(old.proWorld.seasons[0].farmPostseason.series.every(row=>!row.mvp));
});
test('farm series cannot award an MVP before completion or without actual eligible playing records',()=>{
 const s=fixture(),p=farmAndFirstSeries(s),series=s.proWorld.farmPostseason.series[0],{settleSeriesMvp}=require('../.test-build/lib/sim/pro-series-awards.js');
 delete series.winner;assert.equal(settleSeriesMvp(s,series,true,{level:'second'}),false);series.winner=10;
 const game=s.calendar.events.find(g=>g.competitionId==='pro-farm-playoffs-semi-a');game.status='forfeit';assert.equal(settleSeriesMvp(s,series,true,{level:'second'}),false);
 game.status='completed';series.rosters['10']=[];assert.equal(settleSeriesMvp(s,series,true,{level:'second'}),false);
 series.rosters['10']=[p.id];game.boxScore[p.id]=e.emptyRecord();assert.equal(settleSeriesMvp(s,series,true,{level:'second'}),false);assert.equal(series.mvp,undefined);assert.equal(p.professional.awardBonuses,undefined);
});
