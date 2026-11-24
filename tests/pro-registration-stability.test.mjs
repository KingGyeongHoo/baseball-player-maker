import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),w=require('../.test-build/lib/sim/pro-world.js');
const base=pc.acknowledgeCareer(pc.createProfessionalDemo('stable-registration','안정검증','SS'));
const balance=require('../.test-build/lib/sim/pro-balance.js');
function managedPair(position){
 const s=structuredClone(base),p=e.getPlayer(s),q=structuredClone(p);q.id='rest-backup';s.date='2028-05-01';s.proWorld.stage='regular';s.calendar.events=[];
 for(const [player,skill] of [[p,65],[q,60]]){
  player.teamId=0;player.position=position;player.primaryRole=e.roleFor(position);player.eligiblePositions=[position];delete player.twoWay;
  for(const key of Object.keys(player.stats))player.stats[key]=skill;
  player.fatigue=0;player.injury=null;player.forcedRest=false;player.lastPitched=null;player.career=[];player.recentAppearances=[];
  player.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};player.proContract.status='regular';
  delete player.professional.managedUntil;delete player.professional.contract.faTerms;
 }
 s.players=[p,q];return {s,p,q};
}
test('body management changes game selection but never the displayed evaluation and expires by date',()=>{
 const {s,p,q}=managedPair('SS'),score=e.selectionScore(p);
 assert.equal(e.lineup([p,q],s.date).field[0].id,p.id);
 p.professional.managedUntil='2028-05-14';
 assert.equal(e.selectionScore(p),score);assert.equal(e.gameSelectionScore(p,p.primaryRole,s.date),score-12);
 assert.equal(e.lineup([p,q],s.date).field[0].id,q.id);
 assert.ok(e.compareDesignatedHitters(p,q,s.date)>0);
 assert.equal(e.lineup([p,q],'2028-05-15').field[0].id,p.id);
 assert.equal(e.gameSelectionScore(p,p.primaryRole,'2028-05-15'),score);
 delete p.professional.managedUntil;assert.equal(e.selectionScore(p),score);
});
test('body management lowers rotation and bullpen usage priority without lowering evaluation',()=>{
 const {s,p,q}=managedPair('SP'),score=e.selectionScore(p);
 assert.equal(balance.proRotationStarter(s,[p,q],s.date).id,p.id);
 p.professional.managedUntil='2028-05-14';
 assert.equal(balance.proRotationStarter(s,[p,q],s.date).id,q.id);assert.equal(e.selectionScore(p),score);
 const relief=managedPair('RP'),before=balance.proReliefPriority(relief.p,relief.s.date,6,0),rating=e.selectionScore(relief.p);
 relief.p.professional.managedUntil='2028-05-14';
 assert.ok(balance.proReliefPriority(relief.p,relief.s.date,6,0)<before);
 assert.equal(e.selectionScore(relief.p),rating);
});
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
 Object.assign(p.seasonByLevel.first.batting,{PA:600,AB:550,H:220,HR:50,RBI:250,BB:50,SB:70});
 const seasonScore=e.selectionScore(p),slump=e.emptyRecord();Object.assign(slump.batting,{PA:50,AB:50});
 p.recentAppearances=[slump];assert.ok(Math.abs(seasonScore-e.selectionScore(p)-1)<1e-9);
 for(const k of Object.keys(up.stats))up.stats[k]=80;
 Object.assign(up.seasonByLevel.second.batting,{PA:400,AB:350,H:100,HR:10,BB:50});
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
 const notice=[s.careerNotice,...(s.noticeQueue??[])].find(row=>row?.code===`registration:${s.date}:${p.id}`);assert.ok(notice);
 for(const q of [farm[0],farm[1]])assert.ok(notice.message.includes(`[콜업] ${q.name}`));
 for(const q of [p,extra])assert.ok(notice.message.includes(`[말소] ${q.name}`));
 assert.ok(!/출전평가|승격 \d|조정 \d|등록을 교환/.test(notice.message));

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


test('legacy promotion and demotion dialogs show call-up/removal names instead of the stored score explanation',()=>{
 const {createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const {CareerNoticeDialog}=require('../.test-build/app/components/career-continuation.js');
 for(const promoted of [true,false]){
  const s=fixture(),p=e.getPlayer(s);s.careerNotice={id:'legacy-registration',date:s.date,kind:promoted?'promoted':'demoted',title:promoted?'1군 승격 통보':'2군 조정 통보',message:'현재 3B 포지션의 출전평가를 비교했습니다. 승격 78.6 / 조정 77.5 · 같은 포지션에서 더 높은 출전평가를 받은 선수를 1군에 등록했습니다. · 이이수 선수와 등록을 교환했습니다.'};
  const before=JSON.stringify(s),html=renderToStaticMarkup(createElement(CareerNoticeDialog,{state:s,onChange(){}}));
  const promotedColumn=html.split('aria-label="승격 선수"')[1].split('</section>')[0],removedColumn=html.split('aria-label="말소 선수"')[1].split('</section>')[0];
  assert.ok(promotedColumn.includes(promoted?p.name:'이이수'));assert.ok(removedColumn.includes(promoted?'이이수':p.name));assert.ok(html.includes('(유격수)'));assert.equal((html.match(/<svg /g)??[]).length,2);
  assert.ok(!/78.6|77.5|출전평가를 비교|등록을 교환/.test(html));assert.equal(JSON.stringify(s),before);
 }
});


test('single-sided changes keep both columns, while regular conversion has its own presentation',()=>{
 const {createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const {CareerNoticeDialog}=require('../.test-build/app/components/career-continuation.js');
 const s=fixture(),p=e.getPlayer(s);s.careerNotice={id:'single',date:s.date,kind:'promoted',title:'1군 승격 통보',message:`[콜업] ${p.name}`};
 let html=renderToStaticMarkup(createElement(CareerNoticeDialog,{state:s,onChange(){}}));assert.ok(html.includes('aria-label="승격 선수"'));assert.ok(html.includes('aria-label="말소 선수"'));assert.ok(html.includes('class="registration-empty">—'));
 s.careerNotice={id:'conversion',date:s.date,kind:'registered',title:'이전 정식 전환 제목',message:'성장 효율 100%라는 이전 설명'};
 html=renderToStaticMarkup(createElement(CareerNoticeDialog,{state:s,onChange(){}}));assert.ok(html.includes('정식 선수 전환!'));assert.ok(html.includes('정식 전환 요건을 충족하여'));assert.ok(html.includes('정식 선수로 전환되었습니다.'));assert.ok(!html.includes('registration-changes'));assert.ok(!html.includes('성장 효율'));
});
