import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const evaluation=require('../.test-build/lib/sim/pro-evaluation.js'),life=require('../.test-build/lib/sim/pro-season.js'),ceremonies=require('../.test-build/lib/sim/pro-awards-ceremony.js'),save=require('../.test-build/lib/career-save.js');
const {GoldGloveAwards}=require('../.test-build/app/components/pro-awards.js'),{CareerNoticeDialog}=require('../.test-build/app/components/career-continuation.js');
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
function dismissSeasonAwards(s){
 s=pc.acknowledgeCareer(pc.acknowledgeCareer(s));
 return s.careerNotice?.code?.startsWith('club-award:')?pc.acknowledgeCareer(s):s;
}

test('season MVP applies crown tiers and the overall WAR gap within the selected league',()=>{
 const s=fixture(),pitcher=s.players.find(p=>p.id==='award-SP'),batter=e.getPlayer(s);
 s.players=[pitcher,batter];
 pitcher.seasonByLevel.first=e.emptyRecord();batter.seasonByLevel.first=e.emptyRecord();
 pitcher.seasonByLevel.first.pitching.BF=1;
 Object.assign(batter.seasonByLevel.first.batting,{PA:1,AB:1,H:1});
 const crowns=(p,field,count,level='first')=>Array.from({length:count},(_,i)=>({level,field,metric:String(i),winners:[{playerId:p.id}]}));
 const winner=(pitchCount,batCount)=>evaluation.seasonMvpAward(s,'first',[
  ...crowns(pitcher,'pitching',pitchCount),...crowns(batter,'batting',batCount),...crowns(pitcher,'pitching',6,'second'),
 ]).playerId;
 assert.equal(winner(1,1),batter.id);
 assert.equal(winner(2,2),pitcher.id);
 assert.equal(winner(2,3),batter.id);
 assert.equal(winner(3,3),pitcher.id);
 assert.equal(winner(3,4),batter.id);
 Object.assign(batter.seasonByLevel.first.batting,{PA:550,AB:500,BB:50,H:250,HR:65});
 assert.equal(winner(3,0),batter.id);
 assert.equal(winner(4,0),batter.id);
});

test('gold gloves select one unified pitcher and each of nine batting positions, plus one MVP, only from first-team records',()=>{
 const s=fixture(),awards=relevant(s),gold=awards.filter(row=>row.category==='goldGlove');assert.equal(gold.length,10);assert.equal(awards.filter(row=>row.category==='mvp').length,1);assert.deepEqual(gold.map(row=>row.position),evaluation.goldGlovePositions);assert.equal(gold.find(row=>row.position==='P').playerId,'award-SP');
 const before=JSON.stringify(awards);for(const p of s.players){for(const key of Object.keys(p.stats))p.stats[key]=p.id==='award-RP'?100:1;p.reputation=100;p.recentZ=50;p.fatigue=99;Object.assign(p.seasonByLevel.second.batting,{PA:900,H:800,HR:300});Object.assign(p.seasonPostseason.batting,{PA:100,H:100,HR:100});}for(const team of s.teams)team.wins=team.id===0?0:144;
 assert.equal(JSON.stringify(relevant(s).filter(row=>row.level!=='second')),before);
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
 s=dismissSeasonAwards(restored);while(s.careerNotice?.award||s.careerNotice?.individualTitles)s=pc.acknowledgeCareer(s);s=life.actOnProCareer(s,{type:'nextSeason'});assert.ok(s.careerNotice.stoveReport);s=pc.acknowledgeCareer(s);assert.equal(s.proWorld.stage,'camp');assert.equal(e.getPlayer(s).seasonByLevel.first.batting.PA,0);assert.deepEqual(s.proWorld.seasons[0].awards,awards);
});

test('camp shortcut pauses for the December ceremony and confirming resumes directly to camp once',()=>{
 const source=closed(),before=JSON.stringify(source);let s=life.actOnProCareer(source,{type:'nextSeason'});assert.equal(JSON.stringify(source),before);assert.equal(s.date,'2028-12-06');assert.equal(s.careerNotice.code,'awards:2028');assert.equal(s.proWorld.resumeCampAfterAwards,true);const awards=structuredClone(s.proWorld.seasons[0].awards);
 const renderNotice=()=>renderToStaticMarkup(createElement(CareerNoticeDialog,{state:s,onChange(){}}));
 const gold=renderNotice();assert.ok(gold.includes('시즌 어워드로'));assert.ok(gold.includes('수상SS'));assert.ok(gold.includes('gold-glove-field'));assert.ok(gold.includes('180.0이닝'));assert.doesNotMatch(gold,/1군 MVP|신인상|타이틀홀더/);
 s=pc.acknowledgeCareer(s);assert.equal(s.careerNotice.code,'awards-summary:2028');
 s=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
 const summary=renderNotice(),labels=['1군 MVP','2군 MVP','신인상','투수 타이틀홀더','타자 타이틀홀더'];
 assert.deepEqual(labels.map(label=>summary.indexOf(label)),labels.map(label=>summary.indexOf(label)).sort((a,b)=>a-b));
 for(const label of labels)assert.ok(summary.includes(label));
 assert.doesNotMatch(summary,/골든글러브/);
 s=pc.acknowledgeCareer(s);if(s.careerNotice.code==='club-award:2028')s=pc.acknowledgeCareer(s);
 assert.equal(s.date,'2028-12-06');assert.ok(s.careerNotice.award);const celebrated=[];while(s.careerNotice?.award||s.careerNotice?.individualTitles){if(s.careerNotice.award)celebrated.push(s.careerNotice.award.title);s=pc.acknowledgeCareer(s);}assert.ok(celebrated.includes('유격수 골든글러브'));assert.ok(s.careerNotice.stoveReport);s=pc.acknowledgeCareer(s);assert.equal(s.date,'2029-02-01');assert.equal(s.proWorld.stage,'camp');assert.equal(s.proWorld.resumeCampAfterAwards,undefined);assert.equal(s.careerNotice.title,'2029 캠프 시작');assert.deepEqual(s.proWorld.seasons[0].awards,awards);assert.equal(s.proWorld.news.filter(row=>row.id==='2028:awards:2028').length,1);
});

test('winner presentation uses snapshotted season records even after an offseason position or club change',()=>{
 const s=closed();s.date='2028-12-06';ceremonies.presentAwardsCeremony(s);const season=s.proWorld.seasons[0],html=renderToStaticMarkup(createElement(GoldGloveAwards,{state:s,season}));assert.ok(html.includes('500타수'));assert.ok(html.includes('180.0이닝'));assert.ok(html.includes('나'));
 assert.equal((html.match(/class="gold-glove-player(?: |")/g)??[]).length,10);
 assert.match(html,/--field-x:18%;--field-y:88%[^>]*><span class="gold-glove-position">지명타자/);assert.doesNotMatch(html,/FIND YOUR PLACE/);
 for(const p of s.players){p.teamId=39;p.position='DH';p.seasonByLevel.first=e.emptyRecord();}assert.equal(renderToStaticMarkup(createElement(GoldGloveAwards,{state:s,season})),html);
});

test('one club award notice follows the season summary and includes both awards for the player',()=>{
 const s=fixture(),p=e.getPlayer(s);p.seasonByLevel.second=structuredClone(p.seasonByLevel.first);
 life.closeProfessionalSeason(s);let next=pc.acknowledgeCareer(s);
 next.date='2028-12-06';ceremonies.presentAwardsCeremony(next);
 next=pc.acknowledgeCareer(next);assert.equal(next.careerNotice.code,'awards-summary:2028');
 next=pc.acknowledgeCareer(next);assert.equal(next.careerNotice.code,'club-award:2028');
 next=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(next))).state;
 const html=renderToStaticMarkup(createElement(CareerNoticeDialog,{state:next,onChange(){}}));
 for(const label of ['구단 최우수 선수 선정','1군 최우수 선수','2군 최우수 선수','커리어 탭의 개인 수상에 기록됩니다.'])assert.ok(html.includes(label),label);
 next=pc.acknowledgeCareer(next);assert.notEqual(next.careerNotice?.code,'club-award:2028');
});

test('legacy winter adds new gold gloves without replacing its announced MVP or replaying old ceremonies',()=>{
 const s=closed(),season=s.proWorld.seasons[0];delete season.awardsCeremony;season.awards=season.awards.filter(row=>row.category!=='goldGlove');const mvp=season.awards.find(row=>row.kind==='시즌 MVP');delete mvp.category;const winner=mvp.playerId;s.date='2028-12-10';assert.equal(ceremonies.presentAwardsCeremony(s),true);assert.equal(season.awards.find(row=>row.kind==='시즌 MVP').playerId,winner);assert.equal(season.awards.filter(row=>row.category==='goldGlove').length,10);assert.equal(ceremonies.presentAwardsCeremony(s),false);
 const late=closed();delete late.proWorld.seasons[0].awardsCeremony;late.date='2029-01-01';assert.equal(ceremonies.presentAwardsCeremony(late),false);
});

test('individual awards freeze only category leaders, retain ties and separate first and second league records',()=>{
 assert.equal(awardValueText({format:'rate',value:.34}),'.340');assert.equal(awardValueText({format:'innings',value:17}),'5.2');
 const s=fixture(),p=e.getPlayer(s);p.seasonByLevel.first.batting.H=200;const tied=structuredClone(p);tied.id='tied-hits';tied.name='공동안타왕';s.players.push(tied);const farm=structuredClone(p);farm.id='farm-champion';farm.teamId=10;farm.seasonByLevel={first:e.emptyRecord(),second:structuredClone(p.seasonByLevel.first)};farm.seasonByLevel.second.batting.H=230;s.players.push(farm);
 const rows=individualAwards(s),home=rows.find(row=>row.level==='first'&&row.metric==='H'),second=rows.find(row=>row.level==='second'&&row.metric==='H');assert.equal(home.value,200);assert.deepEqual(home.winners.map(row=>row.playerId).sort(),[p.id,tied.id].sort());assert.equal(second.value,230);assert.equal(second.winners[0].playerId,farm.id);assert.ok(!home.winners.some(row=>row.playerId===farm.id));
 life.closeProfessionalSeason(s);assert.deepEqual(s.proWorld.seasons[0].individualAwards,rows);
 const html=renderToStaticMarkup(createElement(IndividualAwards,{state:s,season:s.proWorld.seasons[0],onRecords(){}}));assert.ok(html.includes('공동 1위'));assert.ok(html.includes('공동안타왕'));assert.ok(!html.includes('farm-champion'));assert.ok(!html.includes('2위'));
 const hub=renderToStaticMarkup(createElement(AwardsHub,{state:s,onRecords(){}}));for(const label of ['어워드','올스타','골든글러브','타이틀'])assert.ok(hub.includes(label));assert.ok(!hub.includes('<dialog'));
});

function titleCelebration(level='first',field='batting'){
 const s=closed(),p=e.getPlayer(s),season=s.proWorld.seasons[0],assessment=p.professional.assessments.find(row=>row.year===2028);
 assessment.squad=level;assessment.role=field==='pitching'?'선발':'센터라인';
 const winner={playerId:p.id,playerName:p.name,club:0},other={playerId:'other-winner',playerName:'다른수상자',club:1};
 season.individualAwards=[
  {level,field,metric:field==='batting'?'HR':'wins',label:'타이틀',value:30,winners:[winner,other]},
  {level,field,metric:field==='batting'?'H':'saves',label:'다른타이틀',value:200,winners:[winner]},
  {level,field,metric:field==='batting'?'RBI':'holds',label:'동료타이틀',value:100,winners:[other]},
  {level:level==='first'?'second':'first',field,metric:field==='batting'?'HR':'wins',label:'다른군',value:88,winners:[{...winner,playerName:'다른군수상자'}]},
  {level,field:field==='batting'?'pitching':'batting',metric:field==='batting'?'wins':'HR',label:'다른분야',value:77,winners:[{...winner,playerName:'다른분야수상자'}]},
 ];
 s.date='2028-12-06';return s;
}
test('the season summary contains title holders once and queues no separate title table',()=>{
 let s=titleCelebration();ceremonies.presentAwardsCeremony(s);
 assert.ok(!s.noticeQueue.some(n=>n.individualTitles));s=pc.acknowledgeCareer(s);assert.equal(s.careerNotice.code,'awards-summary:2028');
 const html=renderToStaticMarkup(createElement(CareerNoticeDialog,{state:s,onChange(){}}));for(const text of ['시즌 어워드','홈런왕','안타왕','타점왕','공동 1위'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('타이틀 획득!'));const bonuses=structuredClone(e.getPlayer(s).professional.awardBonuses);
 s=pc.acknowledgeCareer(s);if(s.careerNotice?.code?.startsWith('club-award:'))s=pc.acknowledgeCareer(s);
 while(s.careerNotice?.award)s=pc.acknowledgeCareer(s);
 assert.ok(!s.careerNotice?.individualTitles);assert.ok(!s.noticeQueue.some(n=>n.individualTitles));assert.deepEqual(e.getPlayer(s).professional.awardBonuses,bonuses);
});
test('winning only titles finishes after the season summary instead of opening another table',()=>{
 let s=titleCelebration('second','pitching');s.proWorld.seasons[0].awards=[];ceremonies.presentAwardsCeremony(s);
 assert.ok(!s.noticeQueue.some(n=>n.award||n.individualTitles));s=pc.acknowledgeCareer(s);assert.equal(s.careerNotice.code,'awards-summary:2028');
 s=pc.acknowledgeCareer(s);assert.ok(!s.careerNotice?.individualTitles);assert.ok(!s.noticeQueue.some(n=>n.individualTitles));
});
test('acknowledging an older saved award queue drops duplicate title tables and preserves the next career notice',()=>{
 let s=titleCelebration();ceremonies.presentAwardsCeremony(s);
 s.noticeQueue.push({id:'individual-titles:2028',code:'individual-titles:2028',date:s.date,kind:'pro',title:'타이틀 획득!',message:'',individualTitles:{year:2028,level:'first',field:'batting'}},{id:'after-awards',date:s.date,kind:'pro',title:'다음 안내',message:'보존'});
 s=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;const before=structuredClone(s);
 const next=pc.acknowledgeCareer(s);assert.deepEqual(s,before);s=next;
 assert.ok(!s.noticeQueue.some(n=>n.individualTitles));assert.ok(s.noticeQueue.some(n=>n.id==='after-awards'));
 s=pc.acknowledgeCareer(s);if(s.careerNotice?.code?.startsWith('club-award:'))s=pc.acknowledgeCareer(s);while(s.careerNotice?.award)s=pc.acknowledgeCareer(s);
 assert.equal(s.careerNotice.id,'after-awards');
});

test('only the ERA title requires pitching innings, using separate starter and relief minimums',()=>{
 const s=fixture();s.players=[];
 for(const [level,games] of [['first',144],['second',117]])for(const [role,multiple] of [['선발',3],['중간계투',1],['마무리',1]])for(const short of [false,true]){
  const p=structuredClone(template.players.find(p=>p.id===template.playerId));p.id=`${level}-${role}-${short}`;p.primaryRole=role;p.teamId=level==='first'?0:10;p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};
  const r=p.seasonByLevel[level];Object.assign(r.pitching,{outs:games*multiple-Number(short),BF:700,SO:100,ER:1,H:10,BB:2});r.games={...r.games,holds:short?999:5,saves:short?999:5};s.players.push(p);
 }
 const awards=individualAwards(s);
 for(const level of ['first','second'])for(const metric of ['era','holds','saves']){
  const award=awards.find(row=>row.level===level&&row.metric===metric);assert.ok(award,`${level} ${metric}`);
  assert.ok(award.winners.every(p=>p.playerId.endsWith(metric==='era'?'-false':'-true')));
  if(metric==='holds'||metric==='saves'){assert.equal(award.value,999);assert.equal(award.winners.length,3);}
 }
});

test('eight batting and six pitching titles are awarded in both leagues',()=>{
 const s=fixture();
 for(const p of s.players){p.seasonByLevel.first.batting.SB=20;p.seasonByLevel.first.games={wins:20,losses:5,holds:10,saves:15};p.seasonByLevel.second=structuredClone(p.seasonByLevel.first);}
 const awards=individualAwards(s);
 for(const level of ['first','second']){
  assert.deepEqual(awards.filter(row=>row.level===level&&row.field==='batting').map(row=>row.metric),['avg','H','HR','RBI','R','SB','obp','slg']);
  assert.deepEqual(awards.filter(row=>row.level===level&&row.field==='pitching').map(row=>row.metric),['wins','era','SO','winRate','holds','saves']);
  assert.equal(awards.find(row=>row.level===level&&row.metric==='winRate').value,.8);
 }
 const {leaderMetrics}=require('../.test-build/lib/league-leaders.js');
 for(const id of ['HR','2B','3B','ops'])assert.ok(leaderMetrics.batting.some(row=>row.id===id));
 for(const id of ['whip','kRate','SO','outs'])assert.ok(leaderMetrics.pitching.some(row=>row.id===id));
 const regular=evaluation.regularAwards(s);assert.ok(regular.some(row=>row.kind==='도루왕'));assert.ok(regular.some(row=>row.kind==='홈런왕'));
 assert.ok(!regular.some(row=>['홈런','탈삼진','WHIP','OPS'].includes(row.kind)));
 const season={individualAwards:[...awards,{level:'first',field:'batting',metric:'HR',label:'홈런',value:99,winners:[{playerId:'hidden',playerName:'기록전용선수',club:0}]}]};
 const html=renderToStaticMarkup(createElement(IndividualAwards,{state:s,season,onRecords(){}}));assert.ok(html.includes('도루왕'));assert.ok(html.includes('홈런왕'));assert.ok(html.includes('기록전용선수'));
 const {IndividualAwardsTable}=require('../.test-build/app/components/individual-awards-table.js');
 for(const level of ['first','second']){
  const titles=renderToStaticMarkup(createElement(IndividualAwardsTable,{state:s,season,level,field:'pitching',compact:true}));
  assert.ok(titles.includes('탈삼진왕'));assert.ok(titles.includes('180탈삼진'));
 }
});

test('win rate rankings and titles require ten wins without an innings minimum',()=>{
 const s=fixture(),pitchers=s.players.filter(p=>['SP','RP','CP'].includes(p.position));
 const {leagueLeaders}=require('../.test-build/lib/league-leaders.js');
 for(const [i,[wins,losses]] of [[9,0],[10,1],[12,3]].entries()){
  const p=pitchers[i];
  for(const level of ['first','second']){
   const record=p.seasonByLevel[level]=e.emptyRecord();
   Object.assign(record.pitching,{outs:3,BF:3});record.games={wins,losses};
  }
 }
 for(const level of ['first','second']){
  const board=leagueLeaders(s,`pro-${level}`,'pitching').find(row=>row.metric.id==='winRate');
  assert.deepEqual(board.rows.map(row=>row.player.id),[pitchers[1].id,pitchers[2].id]);
  const title=individualAwards(s).find(row=>row.level===level&&row.metric==='winRate');
  assert.equal(title.winners[0].playerId,pitchers[1].id);
  assert.equal(title.value,10/11);
 }
});

test('batting rate titles use the rounded-down plate appearance minimum for each league',()=>{
 const s=fixture(),p=e.getPlayer(s);
 s.players=[p];
 for(const [level,minimum] of [['first',446],['second',315]]){
  const record=p.seasonByLevel[level];
  Object.assign(record.batting,{PA:minimum-1,AB:minimum-20,H:120});
  for(const metric of ['avg','obp','slg'])assert.equal(individualAwards(s).some(row=>row.level===level&&row.metric===metric),false);
  record.batting.PA=minimum;
  for(const metric of ['avg','obp','slg'])assert.equal(individualAwards(s).some(row=>row.level===level&&row.metric===metric),true);
 }
});
test('legacy seasons recover a missing strikeout title without replacing an existing winner',()=>{
 const s=closed(),season=s.proWorld.seasons[0],existing=season.individualAwards.find(row=>row.metric==='SO');
 season.individualAwards=season.individualAwards.filter(row=>row!==existing);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state.proWorld.seasons[0];
 assert.deepEqual(restored.individualAwards.filter(row=>row.metric==='SO'),[existing]);
});

test('legacy saves restore missing runs, win rate, on-base and slugging titles in both leagues',()=>{
 const s=fixture(),metrics=['winRate','obp','slg','R'],player=e.getPlayer(s);
 player.seasonByLevel.first.batting.R=112;
 for(const p of s.players){
  const record=p.seasonByLevel.first;
  if(record.pitching.BF>0)record.games={wins:p.position==='SP'?10:9,losses:p.position==='SP'?2:0};
  p.seasonByLevel.second=structuredClone(record);
 }
 life.closeProfessionalSeason(s);
 const season=s.proWorld.seasons[0],expected=season.individualAwards.filter(row=>metrics.includes(row.metric));
 assert.equal(expected.length,8);
 assert.ok(expected.filter(row=>row.metric==='R').every(row=>row.value===112&&row.winners[0].playerId===player.id));
 season.individualAwards=season.individualAwards.filter(row=>!metrics.includes(row.metric));
 season.individualAwards.push({level:'first',field:'batting',metric:'R',label:'득점왕',value:0,winners:[]});
 const openHtml=renderToStaticMarkup(createElement(IndividualAwards,{state:s,season,onRecords(){}}));
 assert.ok(openHtml.includes('112득점'));
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;
 const restoredSeason=restored.proWorld.seasons[0];
 for(const award of expected)assert.deepEqual(restoredSeason.individualAwards.filter(row=>row.level===award.level&&row.metric===award.metric),JSON.parse(JSON.stringify([award])));
 assert.deepEqual(restoredSeason.awards,season.awards);
 const html=renderToStaticMarkup(createElement(IndividualAwards,{state:restored,season:restoredSeason,onRecords(){}}));
 for(const label of ['승률왕','출루율왕','장타율왕','득점왕','83.3%','112득점'])assert.ok(html.includes(label),label);
});

test('runs leaders and the runs title count runs even without a plate appearance',()=>{
 const s=fixture(),p=e.getPlayer(s);
 const {leagueLeaders}=require('../.test-build/lib/league-leaders.js');
 p.seasonByLevel.first.batting=e.emptyRecord().batting;
 p.seasonByLevel.first.batting.R=100;
 assert.equal(leagueLeaders(s,'pro-first','batting').find(board=>board.metric.id==='R').rows[0].player.id,p.id);
 const winner=individualAwards(s).find(row=>row.level==='first'&&row.metric==='R');
 assert.equal(winner.value,100);
 assert.equal(winner.winners[0].playerId,p.id);
});

test('club farm award uses the new name for current and legacy career honors',()=>{
 const s=fixture(),p=e.getPlayer(s),{careerHonors}=require('../.test-build/lib/career-summary.js');
 p.seasonByLevel.second=structuredClone(p.seasonByLevel.first);
 life.closeProfessionalSeason(s);
 const award=s.proWorld.seasons[0].awards.find(row=>row.playerId===p.id&&row.kind==='2군 최우수 선수');
 assert.ok(award);
 assert.ok(careerHonors(s).individual.some(row=>row.title==='2군 최우수 선수'));
 award.kind='구단 육성 우수 선수';
 assert.ok(careerHonors(s).individual.some(row=>row.title==='2군 최우수 선수'));
});

test('each club picks a first-team winner by its own WAR even after a trade',()=>{
 const s=fixture(),p=e.getPlayer(s),peer=s.players.find(row=>row.id==='award-1B'),farm=s.players.find(row=>row.id==='award-C');
 const origin=0,destination=1;
 const clubRecord=first=>({first,second:e.emptyRecord(),postseason:e.emptyRecord()});
 const originLine=structuredClone(p.seasonByLevel.first),destinationLine=e.emptyRecord();
 originLine.batting.H=240;
 Object.assign(destinationLine.batting,{PA:100,AB:100,H:1});
 p.seasonByLevel.first=structuredClone(originLine);e.mergeRecord(p.seasonByLevel.first,destinationLine);
 p.teamId=destination;p.seasonByClub={0:clubRecord(originLine),1:clubRecord(destinationLine)};
 p.professional.movements.push({kind:'트레이드',from:origin,to:destination,date:'2028-06-01'});
 peer.teamId=destination;farm.teamId=origin;farm.seasonByLevel.second=structuredClone(originLine);farm.seasonByLevel.first=e.emptyRecord();
 s.players=[p,peer,farm];
 life.closeProfessionalSeason(s);
 const {awards}=s.proWorld.seasons[0],first=awards.filter(row=>row.kind==='1군 최우수 선수');
 assert.deepEqual(first.map(row=>[row.club,row.playerId]),[[origin,p.id],[destination,peer.id]]);
 assert.equal(awards.find(row=>row.kind==='2군 최우수 선수').playerId,farm.id);
 assert.equal(p.professional.assessments[0].clubAwardCounts.first,1);
});
