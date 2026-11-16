import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),n=require('../.test-build/lib/sim/national-teams.js'),nt=require('../.test-build/lib/sim/national-tournament.js');
const save=require('../.test-build/lib/career-save.js');
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('national-tournament','대표','SS'));
function fixture(kind,year){const s=structuredClone(template);s.date=`${year}-${n.nationalRules[kind].month}-01`;s.calendar.seasonYear=year;s.careerEvent=null;s.careerNotice=null;s.noticeQueue=[];delete s.nationalTeams;for(const p of s.players){p.fatigue=0;p.lastPitched=null;p.injury=null;p.age=24;p.proContract.status='regular';const r=e.emptyRecord();r.batting.PA=200;r.pitching.outs=150;p.seasonByLevel={first:r,second:e.emptyRecord()};}if(kind==='youth')for(const p of s.players){delete p.careerMode;delete p.professional;p.grade=2;p.reputation=60;}const roster=n.nationalRoster(s,p=>p.seasonByLevel.first,kind);const entry=n.rememberNational(s,kind,roster,year);entry.participated=false;entry.settled=true;entry.result='choice-2';return {s,entry};}
for(const [kind,year,count,stages] of [['wbc',2030,20,4],['premier12',2027,12,3],['olympics',2028,6,4],['apbc',2029,4,2],['youth',2027,12,3]])test(`${kind}: complete real-format rounds, isolated records and performance awards`,()=>{
  const {s,entry}=fixture(kind,year);delete entry.result;const before=structuredClone(s.players.map(p=>p.seasonByLevel));
  const t=nt.ensureNationalTournament(s,entry);assert.equal(t.countries.length,count);
  for(let i=0;i<40&&!t.finished;i++){assert.equal(nt.playNationalDay(s),false);s.date=e.addDays(s.date,1);}
  assert.ok(t.finished,`${kind} failed to finish`);assert.equal(t.stages.length,stages);assert.ok(t.games.every(g=>g.status==='completed'));assert.ok(t.games.every(g=>g.score[0]!==g.score[1]));assert.ok(t.awards.find(a=>a.title==='MVP'));assert.equal(t.awards[0].score,Math.max(...t.awards.map(a=>a.score)));assert.ok(t.countries.slice(1).every(country=>country.players.length===0),'foreign players are discarded after the awards');assert.ok(nt.validNationalTournament(t));
  if(kind==='premier12'){assert.deepEqual(t.stages.map(stage=>stage.id),['opening','super','medals']);assert.deepEqual(t.stages[0].groups.map(group=>group.length),[6,6]);assert.deepEqual(t.stages[1].groups,[t.stages[0].groups.flatMap(group=>nt.nationalTable(t,t.stages[0],group).slice(0,2).map(row=>row.id))]);assert.equal(t.games.filter(g=>g.national.stage==='medals').length,2);}
  assert.deepEqual(s.players.map(p=>p.seasonByLevel),before);
  if(kind!=='youth')assert.ok(t.games.filter(g=>[g.homeTeamId,g.awayTeamId].includes(0)&&!g.national.carried).every(g=>g.forfeitTeamId===undefined),'national quotas must field a playable team');
  for(const c of t.countries)for(const p of c.players){const total=e.emptyRecord();for(const g of t.games)if(g.boxScore[p.id])e.mergeRecord(total,g.boxScore[p.id]);assert.deepEqual(p.records,total,'carried games must not duplicate appearances');}
  const snapshot=structuredClone(t);nt.playNationalDay(s);assert.deepEqual(t,snapshot);
});
test('foreign national teams can field legal lineups when the user throws left-handed',()=>{
 const {s,entry}=fixture('wbc',2030);delete entry.result;e.getPlayer(s).throws='L';
 const t=nt.ensureNationalTournament(s,entry);s.date=t.games[0].date;nt.playNationalDay(s);
 const foreign=t.games.filter(game=>game.status==='completed'&&game.homeTeamId!==0&&game.awayTeamId!==0);
 assert.ok(foreign.length>0);assert.ok(foreign.every(game=>game.forfeitTeamId===undefined),'foreign fielders must not inherit the user’s left-handed throwing restriction');
});

test('actual national match choices pause and survive serialization without replay',()=>{
  let {s,entry}=fixture('wbc',2030);delete entry.result;entry.participated=true;const p=e.getPlayer(s);
  if(!entry.roster.some(r=>r.id===p.id))entry.roster[entry.roster.findIndex(r=>r.position===p.position)]={id:p.id,name:p.name,position:p.position,field:'batting',team:'한국',roleScore:70};
  const t=nt.ensureNationalTournament(s,entry),first=t.games.find(g=>[g.homeTeamId,g.awayTeamId].includes(0));s.date=first.date;
  for(const country of t.countries)for(const row of country.players)for(const key of Object.keys(row.stats))row.stats[key]=70;
  const original=structuredClone(s);let paused;
  for(let i=0;i<200;i++){
    const candidate=structuredClone(original);candidate.seed=`national-checkpoint-${i}`;
    if(nt.nationalGameChoiceKind(candidate,first)!=='match')continue;
    if(nt.playNationalDay(candidate)){paused=candidate;break;}
  }
  assert.ok(paused,'a selected close game must pause at an actual personal match scene');assert.equal(paused.careerEvent.definitionId,'NT-CLUTCH');
  const saved=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(paused))).state;
  assert.deepEqual(saved.nationalTeams[0].tournament.progress,paused.nationalTeams[0].tournament.progress);
  const choice=paused.careerEvent.choices[0].id;s=e.answerCareerEvent(paused,choice);const restored=e.answerCareerEvent(saved,choice);
  assert.equal(nt.playNationalDay(s),false);assert.equal(nt.playNationalDay(restored),false);
  const game=restored.nationalTeams[0].tournament.games.find(g=>g.id===first.id);assert.equal(game.status,'completed');
  assert.deepEqual(game,s.nationalTeams[0].tournament.games.find(g=>g.id===first.id));
  const score=[...game.score];nt.playNationalDay(restored);assert.deepEqual(game.score,score);
});
test('November tournaments continue while the pro season is ended and retain monotonic dates',()=>{
  let {s,entry}=fixture('premier12',2027);delete entry.result;entry.participated=true;const mine=e.getPlayer(s),slot=entry.roster.findIndex(p=>p.position===mine.position);if(!entry.roster.some(p=>p.id===mine.id))entry.roster[slot]={id:mine.id,name:mine.name,position:mine.position,field:'batting',team:'한국',roleScore:80};s.phase='ended';s.proWorld.stage='summary';s.proWorld.seasonClosed=true;
  let previous=s.date,choices=0;
  for(let i=0;i<80&&!s.nationalTeams[0].tournament?.finished;i++){
    assert.equal(nt.advanceNationalOffseason(s),true);assert.ok(s.date>=previous);previous=s.date;
    if(s.careerEvent){s=e.answerCareerEvent(s,s.careerEvent.choices[0].id);choices++;}
  }
  assert.ok(s.nationalTeams[0].tournament.finished);assert.ok(choices>0);
});
test('declining a new invitation still plays the tournament, with a replacement and no user appearance',()=>{
  const {s,entry}=fixture('wbc',2030);entry.result='decline';const t=nt.ensureNationalTournament(s,entry);assert.ok(t);
  assert.ok(t.countries[0].players.every(p=>p.id!==s.playerId));
  for(let i=0;i<40&&!t.finished;i++){nt.playNationalDay(s);s.date=e.addDays(s.date,1);}
  assert.ok(t.finished);assert.ok(t.games.every(g=>!g.boxScore[s.playerId]));
});

test('tournament save validation rejects missing country and duplicate athlete records',()=>{
  const {s,entry}=fixture('wbc',2030);delete entry.result;nt.ensureNationalTournament(s,entry);assert.ok(save.encodeCareerSave(s));
  const broken=structuredClone(s);broken.nationalTeams[0].tournament.countries[1].players[0].id=broken.nationalTeams[0].tournament.countries[0].players[0].id;assert.throws(()=>save.encodeCareerSave(broken),/국가대표 대회/);
});
test('opponent strength starts fresh at each tournament and senior tools never inherit old youth tools',()=>{
 const {s,entry}=fixture('premier12',2031);delete entry.result;
 const old={...entry,kind:'youth',year:2029,tournament:{countries:[{id:1,name:'일본',players:[{id:'nt:2029:1:0',position:'SP',stats:Object.fromEntries(Object.keys(e.getPlayer(s).stats).map(key=>[key,1])),age:17}]}]}};
 s.nationalTeams.unshift(old);const before=structuredClone(s.players),rng={...s.rngStates},t=nt.ensureNationalTournament(s,entry),japan=t.countries[1].players;
 assert.equal(t.strengthVersion,2);assert.ok(japan.filter(p=>['SP','RP','CP'].includes(p.position)).every(p=>p.stats.velocity>=74&&p.stats.velocity<=86));assert.ok(japan.filter(p=>!['SP','RP','CP'].includes(p.position)).every(p=>p.stats.contact>=74&&p.stats.contact<=86));assert.ok(japan.every(p=>p.id.includes(':premier12:')));assert.deepEqual(s.players,before);assert.deepEqual(s.rngStates,rng);
 assert.deepEqual(nt.nationalOpponentStats('일본','SP',123,false),nt.nationalOpponentStats('일본','SP',123,false));assert.ok(nt.nationalOpponentStats('일본','SP',123,false).velocity>nt.nationalOpponentStats('일본','SP',123,true).velocity);
});
test('completed foreign rosters compact on legacy import while active tournaments and Korean records stay intact',()=>{
 const {s,entry}=fixture('apbc',2029);delete entry.result;const t=nt.ensureNationalTournament(s,entry),{compactNationalTournament}=require('../.test-build/lib/sim/national-storage.js');
 assert.equal(compactNationalTournament(t),t);
 const own=structuredClone(t.countries[0]);t.finished='2029-11-20';t.champion=1;t.awards=[{title:'MVP',id:t.countries[1].players[0].id,name:'Sato Haruto',country:1,score:99,reason:'15탈삼진'}];
 const before=structuredClone(t),trimmed=compactNationalTournament(t);assert.deepEqual(t,before);assert.deepEqual(trimmed.countries[0],own);assert.ok(trimmed.countries.slice(1).every(c=>c.players.length===0));assert.deepEqual(trimmed.awards,t.awards);assert.deepEqual(trimmed.games.map(g=>g.score),t.games.map(g=>g.score));assert.ok(nt.validNationalTournament(trimmed));assert.equal(compactNationalTournament(trimmed),trimmed);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state.nationalTeams[0].tournament;assert.deepEqual(restored.countries[0],own);assert.ok(restored.countries.slice(1).every(c=>c.players.length===0));
});
for(const [kind,year] of [['premier12',2031],['apbc',2033]])test(`${kind} participation automatically finishes before stove opening and survives a saved winter`,()=>{
 const life=require('../.test-build/lib/sim/pro-season.js'),pn=require('../.test-build/lib/sim/pro-national-events.js'),{developmentCalendar}=require('../.test-build/lib/sim/pro-calendar.js');
 const previous=e.params['pro_events.enabled'];e.params['pro_events.enabled']=1;
 try{
  let {s,entry}=fixture(kind,year);s.calendar=developmentCalendar(year,true);s.date=`${year}-11-01`;s.phase='ended';s.proWorld.year=year;s.proWorld.stage='summary';s.proWorld.seasonClosed=true;delete s.proWorld.stove;delete s.proEvents;delete s.pendingEventOutcome;
  const p=e.getPlayer(s);p.professional.contract.endYear=year+2;entry.offered=false;entry.settled=false;delete entry.participated;delete entry.result;
  if(!entry.roster.some(row=>row.id===p.id)){const index=entry.roster.findIndex(row=>row.position===p.position);entry.roster[index]={id:p.id,name:p.name,position:p.position,field:'batting',team:'한국',roleScore:80};}
  s.proWorld.seasons=[{year,endDate:`${year}-10-25`,standings:[],farmStandings:[],champion:0,awards:[],draft:[],rookieRulesVersion:1}];pn.freezeProNational(s);
  assert.equal(life.canEnterNextProCamp(s),false);assert.throws(()=>life.actOnProCareer(s,{type:'market'}),/국제대회/);assert.throws(()=>life.actOnProCareer(s,{type:'nextSeason'}),/국제대회/);
  s.careerNotice={id:'season-finished',date:s.date,kind:'seasonComplete',title:'한국시리즈 우승!',message:'시즌 종료'};
  s=pc.acknowledgeCareer(s);assert.equal(s.careerEvent.proEvent.nationalKind,kind);assert.equal(s.careerEvent.choices.length,2);assert.equal(s.proWorld.offseasonContinuation,undefined);
  s=e.answerCareerEvent(s,s.careerEvent.choices[0].id);s.pendingEventOutcome=s.careerEventHistory.at(-1);assert.equal(life.resumeOffseasonProgress(s),s);delete s.pendingEventOutcome;
  s=life.resumeOffseasonProgress(s);assert.equal(s.nationalTeams.find(row=>row.kind===kind).tournament,undefined);assert.ok(nt.nationalOffseasonActionLabel(s).label.includes('참가'));
  s=life.actOnProCareer(s,{type:'national'});assert.ok(s.careerEvent.nationalContext);assert.equal(s.proWorld.offseasonContinuation,'national');assert.equal(s.nationalTeams.find(row=>row.kind===kind).participated,true);
  let choices=0,saved=false;const dates=[s.date];
  for(let guard=0;guard<100;guard++){
   if(s.careerNotice){s=pc.acknowledgeCareer(s);continue;}
   if(!s.careerEvent)break;
   s=e.answerCareerEvent(s,s.careerEvent.choices[0].id);s.pendingEventOutcome=s.careerEventHistory.at(-1);choices++;
   assert.equal(life.resumeOffseasonProgress(s),s,'a choice result must remain visible until acknowledged');
   if(!saved){s=save.decodeCareerSave(save.serializeCareerSave(save.encodeCareerSave(s))).state;assert.equal(s.proWorld.offseasonContinuation,'national');saved=true;}
   delete s.pendingEventOutcome;s=life.resumeOffseasonProgress(s);dates.push(s.date);
  }
  assert.ok(choices>=1);assert.ok(saved);assert.ok(s.nationalTeams.find(row=>row.kind===kind&&row.year===year).tournament.finished);assert.equal(s.proWorld.offseasonContinuation,undefined);assert.deepEqual(dates,[...dates].sort());
  const ownGames=s.nationalTeams.find(row=>row.kind===kind&&row.year===year).tournament.games.filter(g=>[g.homeTeamId,g.awayTeamId].includes(0)&&!g.national.carried);
  assert.ok(s.careerEventHistory.filter(event=>event.definitionId==='NT-CLUTCH').length<ownGames.length,'most games should continue without a choice');assert.ok(!s.careerEventHistory.some(event=>event.definitionId==='NT-PREP'));
  assert.equal(s.proWorld.stage,'summary');assert.equal(s.proWorld.stove,undefined);assert.equal(s.phase,'ended');assert.equal(life.canEnterNextProCamp(s),true);const snapshot=JSON.stringify(s);assert.equal(life.resumeOffseasonProgress(s),s);assert.equal(JSON.stringify(s),snapshot);
  s=life.actOnProCareer(s,{type:'market'});assert.equal(s.proWorld.stage,'offseason');assert.ok(s.proWorld.stove);
 }finally{e.params['pro_events.enabled']=previous;}
});

test('November participation asks for approval and declining returns to winter without a personal appearance',()=>{
 const life=require('../.test-build/lib/sim/pro-season.js');
 let {s,entry}=fixture('premier12',2031);s.proWorld.year=2031;s.phase='ended';s.proWorld.stage='summary';s.proWorld.seasonClosed=true;s.date='2031-11-01';
 delete entry.participated;delete entry.result;entry.offered=false;entry.settled=false;
 const p=e.getPlayer(s);if(!entry.roster.some(row=>row.id===p.id))entry.roster[entry.roster.findIndex(row=>row.position===p.position)]={id:p.id,name:p.name,position:p.position,field:'batting',team:'한국',roleScore:80};
 const records=structuredClone(p.seasonByLevel);
 s=life.actOnProCareer(s,{type:'national'});assert.equal(s.careerEvent.definitionId,'PE27');assert.equal(s.careerEvent.choices.length,2);assert.equal(s.nationalTeams[0].participated,undefined);assert.equal(s.nationalTeams[0].tournament,undefined);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.equal(restored.careerEvent.choices.length,2);assert.equal(restored.proWorld.offseasonContinuation,'national');
 s=e.answerCareerEvent(restored,restored.careerEvent.choices[1].id);s.pendingEventOutcome=s.careerEventHistory.at(-1);
 assert.equal(life.resumeOffseasonProgress(s),s);delete s.pendingEventOutcome;s=life.resumeOffseasonProgress(s);
 const finished=s.nationalTeams[0];assert.equal(finished.participated,false);assert.ok(finished.tournament.finished);assert.ok(finished.tournament.countries[0].players.every(row=>row.id!==p.id));assert.ok(finished.tournament.games.every(game=>!game.boxScore[p.id]));
 assert.deepEqual(e.getPlayer(s).seasonByLevel,records);assert.equal(s.proWorld.stove,undefined);assert.equal(s.proWorld.offseasonContinuation,undefined);assert.equal(nt.pendingNationalOffseason(s),undefined);
});

test('international choices are sparse, stable across reloads and independent of match RNG',()=>{
 const s={seed:'national-frequency',playerId:'me',rngStates:{match:123,events:456}},before=JSON.stringify(s),counts={match:0,quiet:0};
 for(let i=0;i<2000;i++){
  const game={id:`national:2031:premier12:opening:${i}:0`},kind=nt.nationalGameChoiceKind(s,game);
  counts[kind??'quiet']++;
  assert.equal(nt.nationalGameChoiceKind(JSON.parse(JSON.stringify(s)),game),kind);
 }
 assert.ok(counts.match>=320&&counts.match<=480,JSON.stringify(counts));
 assert.ok(counts.quiet>1500,JSON.stringify(counts));assert.equal(JSON.stringify(s),before);
});

test('only a selected late close-game scene interrupts play and never more than once per game',()=>{
 const s={seed:'clutch-frequency',playerId:'me',date:'2031-11-10',matchProgress:{inning:7,outs:1}},batter={id:'me'},pitcher={id:'opponent'};
 const byKind={};
 for(let i=0;Object.keys(byKind).length<2;i++){assert.ok(i<1000);const game={id:`national:clutch:${i}`,score:[1,1],national:{}};byKind[nt.nationalGameChoiceKind(s,game)??'quiet']??=game;}
 assert.equal(nt.openNationalMatchChoice(s,byKind.quiet,batter,pitcher),false);
 const game=byKind.match;s.matchProgress.inning=6;assert.equal(nt.openNationalMatchChoice(s,game,batter,pitcher),false);
 s.matchProgress.inning=7;game.score=[5,1];assert.equal(nt.openNationalMatchChoice(s,game,batter,pitcher),false);
 game.score=[1,1];assert.equal(nt.openNationalMatchChoice(s,game,{id:'teammate'},pitcher),false);
 assert.equal(nt.openNationalMatchChoice(s,game,batter,pitcher),true);assert.equal(s.careerEvent.definitionId,'NT-CLUTCH');
 s.careerEvent=null;assert.equal(nt.openNationalMatchChoice(s,game,batter,pitcher),false);assert.equal(s.careerEvent,null);
});

test('an uneventful November schedule runs all matches to the tournament result in one advance',()=>{
 const {s,entry}=fixture('apbc',2029);delete entry.result;entry.participated=true;s.phase='ended';s.proWorld.stage='summary';s.proWorld.seasonClosed=true;
 const p=e.getPlayer(s);if(!entry.roster.some(row=>row.id===p.id))entry.roster[entry.roster.findIndex(row=>row.position===p.position)]={id:p.id,name:p.name,position:p.position,field:'batting',team:'한국',roleScore:80};
 const t=nt.ensureNationalTournament(s,entry),ids=[...t.games.filter(g=>[g.homeTeamId,g.awayTeamId].includes(0)).map(g=>g.id),...Array.from({length:3},(_,i)=>i+1).flatMap(i=>[`national:2029:apbc:medals:0:${i}`,`national:2029:apbc:medals:${i}:0`])];
 for(let i=0;ids.some(id=>nt.nationalGameChoiceKind(s,{id})!==undefined);i++){assert.ok(i<10000);s.seed=`quiet-international-${i}`;}
 assert.equal(nt.advanceNationalOffseason(s),true);if(s.careerEvent.definitionId==='FINAL-GAME'){Object.assign(s,e.answerCareerEvent(s,s.careerEvent.choices[0].id));nt.advanceNationalOffseason(s);}
 const finished=s.nationalTeams[0].tournament;assert.ok(finished.finished);assert.equal(s.careerEvent.definitionId,'NT-RESULT');
 assert.ok(finished.games.every(g=>g.status==='completed'));assert.ok(finished.games.filter(g=>g.national.eventOpened).every(g=>g.national.stage==='medals'&&g.national.group===0));
});

test('national selection preserves two-way eligibility and the same international game records pitching and batting',()=>{
 let {s,entry}=fixture('wbc',2030);delete entry.result;entry.participated=true;const p=e.getPlayer(s);
 p.throws='R';p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};p.eligiblePositions=['SP','RP','CP','SS','DH'];
 for(const key of Object.keys(p.stats))p.stats[key]=95;
 if(!entry.roster.some(row=>row.id===p.id))entry.roster[entry.roster.findIndex(row=>row.position===p.position)]={id:p.id,name:p.name,position:p.position,field:'batting',team:'한국',roleScore:95};
 const domestic=structuredClone(p.seasonStats),t=nt.ensureNationalTournament(s,entry),first=t.games.find(g=>[g.homeTeamId,g.awayTeamId].includes(0));s.date=first.date;
 for(let guard=0;nt.playNationalDay(s);guard++){
  assert.ok(guard<5);assert.ok(s.careerEvent);s=e.answerCareerEvent(s,s.careerEvent.choices[0].id);
 }
 const game=s.nationalTeams[0].tournament.games.find(g=>g.id===first.id),record=game.boxScore[p.id],side=game.homeTeamId===0?0:1;
 assert.equal(game.status,'completed');assert.ok(record.batting.PA>0);assert.ok(record.pitching.BF>0);assert.equal(game.lineup[side][9],p.id);assert.ok(game.lineup[side].slice(0,9).includes(p.id));
 assert.deepEqual(e.getPlayer(s).seasonStats,domestic);assert.equal(e.getPlayer(s).twoWay.nextAssignment,'batting');
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.deepEqual(restored.nationalTeams[0].tournament.games.find(g=>g.id===first.id).boxScore[p.id],record);
});

test('Premier12, Olympic, APBC and youth invitations offer a field choice only to two-way players',()=>{
 const events=require('../.test-build/lib/sim/event-system.js');
 for(const [kind,year] of [['premier12',2031],['olympics',2032],['apbc',2033],['youth',2027]]){
  let {s,entry}=fixture(kind,year);delete entry.participated;delete entry.result;entry.offered=false;entry.settled=false;
  const p=e.getPlayer(s);p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'pitching',reputationBonus:0};p.eligiblePositions=['SP','RP','CP','SS','DH'];
  for(const key of Object.keys(p.stats))p.stats[key]=95;
  if(!entry.roster.some(row=>row.id===p.id))entry.roster[entry.roster.findIndex(row=>row.position===p.position)]={id:p.id,name:p.name,position:p.position,field:'batting',team:'한국',roleScore:95};
  if(kind==='youth'){delete s.careerMode;assert.equal(events.tryNationalEvent(s),true);}else s.careerEvent=n.nationalInvitation(s,entry);
  assert.equal(s.careerEvent.choices.length,3);const before=structuredClone(p.twoWay);s=e.answerCareerEvent(s,'participate-batting');
  assert.equal(s.nationalTeams[0].participated,true);assert.equal(s.nationalTeams[0].participationField,'batting');assert.deepEqual(e.getPlayer(s).twoWay,before);
 }
});

test('an international gold-medal final always pauses before play and its choice resumes once after loading',()=>{
 const {s,entry}=fixture('apbc',2029);delete entry.result;entry.participated=true;s.phase='ended';s.proWorld.stage='summary';s.proWorld.seasonClosed=true;
 const p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=95;
 if(!entry.roster.some(row=>row.id===p.id))entry.roster[entry.roster.findIndex(row=>row.position===p.position)]={id:p.id,name:p.name,position:p.position,field:'batting',team:'한국',roleScore:95};
 const t=nt.ensureNationalTournament(s,entry);
 // Set up qualification; only the final itself is simulated in this regression.
 for(const game of t.games){game.status='completed';game.advancingTeamId=[game.homeTeamId,game.awayTeamId].includes(0)?0:game.homeTeamId;game.score=game.advancingTeamId===game.homeTeamId?[4,1]:[1,4];}
 s.date=t.games.map(game=>game.date).sort().at(-1);assert.equal(nt.playNationalDay(s),false);
 assert.equal(nt.advanceNationalOffseason(s),true);assert.equal(s.careerEvent.definitionId,'FINAL-GAME');assert.equal(s.careerEvent.nationalContext.phase,'match');
 const gameId=s.careerEvent.finalGameId;assert.equal(t.games.find(game=>game.id===gameId).status,'scheduled');assert.equal(t.progress,undefined);
 const loaded=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;let reference;
 for(const input of [s,loaded]){
  const next=e.answerCareerEvent(input,input.careerEvent.choices[0].id);assert.equal(nt.advanceNationalOffseason(next),true);
  const finished=next.nationalTeams[0].tournament,game=finished.games.find(game=>game.id===gameId);
  assert.ok(finished.finished);assert.equal(next.careerEvent.definitionId,'NT-RESULT');assert.equal(game.status,'completed');assert.equal(game.finalFocus.playerId,p.id);assert.equal(game.finalFocus.field,'batting');assert.ok(game.boxScore[p.id].batting.PA>0);
  assert.equal(next.careerEventHistory.filter(event=>event.definitionId==='FINAL-GAME').length,1);
  if(!reference)reference=structuredClone(game);else assert.deepEqual(game,reference);
 }
});
