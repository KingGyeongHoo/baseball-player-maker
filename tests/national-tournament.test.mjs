import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js'),n=require('../.test-build/lib/sim/national-teams.js'),nt=require('../.test-build/lib/sim/national-tournament.js');
const save=require('../.test-build/lib/career-save.js');
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('national-tournament','대표','SS'));
function fixture(kind,year){const s=structuredClone(template);s.date=`${year}-${n.nationalRules[kind].month}-01`;s.calendar.seasonYear=year;s.careerEvent=null;s.careerNotice=null;s.noticeQueue=[];delete s.nationalTeams;for(const p of s.players){p.fatigue=0;p.lastPitched=null;p.injury=null;p.age=24;p.proContract.status='regular';const r=e.emptyRecord();r.batting.PA=200;r.pitching.outs=150;p.seasonByLevel={first:r,second:e.emptyRecord()};}if(kind==='youth')for(const p of s.players){delete p.careerMode;delete p.professional;p.grade=2;p.reputation=60;}const roster=n.nationalRoster(s,p=>p.seasonByLevel.first,kind);const entry=n.rememberNational(s,kind,roster,year);entry.participated=false;entry.settled=true;entry.result='choice-2';return {s,entry};}
for(const [kind,year,count,stages] of [['wbc',2030,20,4],['premier12',2027,16,4],['olympics',2028,6,4],['apbc',2029,4,2],['youth',2027,12,3]])test(`${kind}: complete real-format rounds, isolated records and performance awards`,()=>{
  const {s,entry}=fixture(kind,year);delete entry.result;const before=structuredClone(s.players.map(p=>p.seasonByLevel));
  const t=nt.ensureNationalTournament(s,entry);assert.equal(t.countries.length,count);
  for(let i=0;i<40&&!t.finished;i++){assert.equal(nt.playNationalDay(s),false);s.date=e.addDays(s.date,1);}
  assert.ok(t.finished,`${kind} failed to finish`);assert.equal(t.stages.length,stages);assert.ok(t.games.every(g=>g.status==='completed'));assert.ok(t.games.every(g=>g.score[0]!==g.score[1]));assert.ok(t.awards.find(a=>a.title==='MVP'));assert.equal(t.awards[0].id,nt.nationalCandidates(t)[0].p.id);
  assert.deepEqual(s.players.map(p=>p.seasonByLevel),before);
  if(kind!=='youth')assert.ok(t.games.filter(g=>[g.homeTeamId,g.awayTeamId].includes(0)&&!g.national.carried).every(g=>g.forfeitTeamId===undefined),'national quotas must field a playable team');
  for(const c of t.countries)for(const p of c.players){const total=e.emptyRecord();for(const g of t.games)if(g.boxScore[p.id])e.mergeRecord(total,g.boxScore[p.id]);assert.deepEqual(p.records,total,'carried games must not duplicate appearances');}
  const snapshot=structuredClone(t);nt.playNationalDay(s);assert.deepEqual(t,snapshot);
});
test('national preparation and actual clutch choices pause and survive serialization without replay',()=>{
  let {s,entry}=fixture('wbc',2030);delete entry.result;entry.participated=true;const p=e.getPlayer(s);if(!entry.roster.some(r=>r.id===p.id))entry.roster[entry.roster.findIndex(r=>r.position===p.position)]={id:p.id,name:p.name,position:p.position,field:'batting',team:'한국',roleScore:90};
  const t=nt.ensureNationalTournament(s,entry),first=t.games.find(g=>[g.homeTeamId,g.awayTeamId].includes(0));s.date=first.date;
  assert.equal(nt.playNationalDay(s),true);assert.equal(s.careerEvent.definitionId,'NT-PREP');s=e.answerCareerEvent(s,'recover');const saved=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.equal(saved.nationalTeams[0].tournament.prepared.length,1);
  let pauses=0;while(nt.playNationalDay(saved)){assert.ok(saved.careerEvent);pauses++;Object.assign(saved,e.answerCareerEvent(saved,saved.careerEvent.choices[0].id));assert.ok(pauses<10);}
  const game=saved.nationalTeams[0].tournament.games.find(g=>g.id===first.id);assert.equal(game.status,'completed');const score=[...game.score];nt.playNationalDay(saved);assert.deepEqual(game.score,score);
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
