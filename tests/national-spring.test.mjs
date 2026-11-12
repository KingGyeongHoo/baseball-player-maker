import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const n=require('../.test-build/lib/sim/national-teams.js'),spring=require('../.test-build/lib/sim/pro-spring.js'),wbc=require('../.test-build/lib/sim/pro-wbc.js');
const {developmentCalendar}=require('../.test-build/lib/sim/pro-calendar.js'),{tryNationalEvent}=require('../.test-build/lib/sim/event-system.js');
const {tryProNationalInvitation,freezeProNational}=require('../.test-build/lib/sim/pro-national-events.js');
const save=require('../.test-build/lib/career-save.js');
const NationalRosters=require('../.test-build/app/components/national-rosters.js').default;
const template=pc.acknowledgeCareer(pc.createProfessionalDemo('national-spring-test','대표','SS'));
function fixture(year=2030){
  const s=structuredClone(template);s.calendar=developmentCalendar(year,true);s.proWorld.year=year;s.date=`${year}-03-01`;s.proWorld.stage='camp';s.proWorld.seasonClosed=false;s.careerNotice=null;s.noticeQueue=[];s.careerEvent=null;delete s.proEvents;delete s.nationalTeams;delete s.weekProgress;delete s.matchProgress;
  for(const p of s.players){p.age=24;p.fatigue=0;p.forcedRest=false;p.injury=null;p.lastPitched=null;p.professional.employment='active';p.proContract.status='regular';p.trainingPolicy=e.defaultPolicy(p.primaryRole);p.professional.nationalBonus=undefined;delete p.twoWay;
    for(const key of Object.keys(p.stats))p.stats[key]=60;
    const r=e.emptyRecord();if(e.isPitcher(p.primaryRole))Object.assign(r.pitching,{outs:150,BF:210,SO:45,ER:15,BB:15});else Object.assign(r.batting,{PA:200,AB:180,H:60,BB:20});
    p.career=[{year:year-1,grade:0,careerMode:'pro',records:structuredClone(r),stats:{...p.stats},byLevel:{first:structuredClone(r),second:e.emptyRecord()}}];p.seasonByLevel={first:structuredClone(r),second:e.emptyRecord()};p.seasonStats=structuredClone(r);
  }return s;
}
test('national calendars follow the requested four-year anchors and September youth team is annual',()=>{
  for(const [kind,first,month] of [['premier12',2027,'11'],['apbc',2029,'11'],['olympics',2028,'07'],['wbc',2030,'03']]){
    for(let year=2026;year<=2042;year++)assert.equal(n.nationalInYear(kind,year),year>=first&&(year-first)%4===0,`${kind} ${year}`);
    assert.equal(n.nationalWindow(kind,first).start,`${first}-${month}-01`);
  }for(let year=2027;year<2035;year++){assert.ok(n.nationalInYear('youth',year));assert.equal(n.nationalWindow('youth',year).start,`${year}-09-01`);}
});
test('adult national teams have 30 unique members with fifteen per field and position quotas',()=>{
  const s=fixture(),rng=structuredClone(s.rngStates),roster=n.nationalRoster(s,p=>p.seasonByLevel.first,'wbc');
  const count=positions=>roster.filter(row=>positions.includes(row.position)).length;
  assert.equal(roster.length,30);assert.equal(new Set(roster.map(row=>row.id)).size,30);assert.equal(count(['SP']),5);assert.equal(count(['RP']),8);assert.equal(count(['CP']),2);assert.equal(count(['C']),2);assert.equal(count(['1B','2B','3B','SS']),7);assert.equal(count(['LF','CF','RF']),5);assert.equal(count(['DH']),1);assert.deepEqual(s.rngStates,rng);
  const byId=new Map(s.players.map(p=>[p.id,p]));for(const row of roster.filter(row=>['SP','RP','CP'].includes(row.position)))byId.get(row.id).age=26;
  const young=n.nationalRoster(s,p=>p.seasonByLevel.first,'olympics');assert.ok(young.every(row=>byId.get(row.id).age<=25));assert.ok(n.nationalRoster(s,p=>p.seasonByLevel.first,'premier12').some(row=>byId.get(row.id).age===26));
});
test('two-way players compete only in their stronger field, for both professional and youth teams',()=>{
  for(const pitching of [false,true]){
    const s=fixture(),p=e.getPlayer(s);p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'pitching',reputationBonus:0};p.position='SP';p.primaryRole=e.roleFor('SP');
    for(const key of ['contact','power','speed','defense','arm'])p.stats[key]=pitching?88:91;
    for(const key of ['velocity','control','movement','stamina','recovery'])p.stats[key]=pitching?91:88;
    assert.equal(n.nationalRole(p).pitching,pitching);
    Object.assign(p.seasonByLevel.first.batting,{PA:300,AB:250,H:100});Object.assign(p.seasonByLevel.first.pitching,{outs:300,BF:420});
    const roster=n.nationalRoster(s,q=>q.seasonByLevel.first,'wbc');const row=roster.find(row=>row.id===p.id);assert.ok(row);assert.equal(row.position,pitching?'SP':'SS');assert.equal(roster.filter(row=>row.id===p.id).length,1);
    for(const q of s.players){delete q.careerMode;delete q.professional;q.grade=2;q.reputation=60;}
    const youth=n.nationalRoster(s,q=>q.seasonStats,'youth');assert.equal(youth.find(row=>row.id===p.id).position,pitching?'SP':'SS');
  }
});
test('selection bonuses respect prestige, never stack on repeat, and do not alter official records',()=>{
  let previous=0;
  for(const kind of ['apbc','olympics','premier12','wbc']){
    const s=fixture(),p=e.getPlayer(s),before=structuredClone(p.seasonByLevel),score=e.proSelectionScore(p),member={id:p.id,position:p.position,roleScore:e.roleScore(p),selectionScore:score};
    const entry=n.rememberNational(s,kind,[member]);assert.equal(e.proSelectionScore(p)-score,n.nationalRules[kind].bonus);assert.ok(n.nationalRules[kind].bonus>previous);previous=n.nationalRules[kind].bonus;
    assert.equal(n.rememberNational(s,kind,[member]),entry);assert.equal(e.proSelectionScore(p)-score,n.nationalRules[kind].bonus);assert.deepEqual(p.seasonByLevel,before);
    const html=renderToStaticMarkup(createElement(NationalRosters,{state:s,onRecords(){}}));assert.ok(html.includes(n.nationalRules[kind].name));assert.ok(html.includes('대한민국 대표팀'));
  }
});
test('Olympic invitation opens during July, can be declined, and uses the selected field and named options',()=>{
  const s=fixture(2028);s.date='2028-07-01';s.proWorld.stage='regular';const p=e.getPlayer(s);for(const key of Object.keys(p.stats))p.stats[key]=95;
  assert.equal(n.tryScheduledNational(s),true);assert.match(s.careerEvent.title,/올림픽 대표/);assert.match(s.careerEvent.choices[1].label,/차출을 거부/);assert.ok(s.nationalTeams[0].roster.some(row=>row.id===p.id));
  const next=e.answerCareerEvent(s,'choice-2');assert.equal(next.nationalTeams[0].participated,false);assert.equal(n.tryScheduledNational(next),false);
  const a=fixture(2029);a.date='2029-07-01';assert.equal(n.tryScheduledNational(a),false);a.date='2029-11-01';a.proWorld.stage='summary';a.proWorld.seasonClosed=true;a.phase='ended';for(const key of Object.keys(e.getPlayer(a).stats))e.getPlayer(a).stats[key]=95;
  freezeProNational(a);assert.ok(tryProNationalInvitation(a));assert.match(a.careerEvent.title,/APBC 국가대표/);assert.ok(e.answerCareerEvent(a,'choice-1').nationalTeams[0].settled);
});
test('spring schedule has one game per opponent, nine per club, every two days in early-to-mid March',()=>{
  for(const year of [2027,2028,2030]){
    const games=spring.springSchedule(year);assert.equal(games.length,45);
    for(let club=0;club<10;club++){
      const mine=games.filter(g=>[g.homeTeamId,g.awayTeamId].includes(club));assert.equal(mine.length,9);assert.equal(new Set(mine.map(g=>g.homeTeamId===club?g.awayTeamId:g.homeTeamId)).size,9);
      assert.equal(mine[0].date,`${year}-03-04`);assert.equal(mine.at(-1).date,`${year}-03-20`);for(let i=1;i<mine.length;i++)assert.equal(mine[i].date,e.addDays(mine[i-1].date,2));
    }
  }
});
test('spring lineup priority is second, third/developmental together, then the lower first-team group',()=>{
  const s=fixture(),source=s.players.find(p=>p.teamId===10&&p.position==='SS');assert.ok(source);s.date='2030-03-04';
  const group=[10,20,30,0].map((team,i)=>{const p=structuredClone(source);p.id='priority-'+i;p.teamId=team;return p;});s.players.push(...group);
  assert.equal(spring.springPriority(s,group[0]),0);assert.equal(spring.springPriority(s,group[1]),1);assert.equal(spring.springPriority(s,group[2]),1);assert.ok(spring.springPriority(s,group[3])>=2);
  const roster=spring.springRoster(s,0).filter(p=>!p.eligiblePositions.includes('SS')||group.includes(p));
  assert.equal(spring.springLineup(s,roster,s.date).field[1].id,group[0].id);group[0].trainingPolicy.mode='rest';assert.ok([group[1].id,group[2].id].includes(spring.springLineup(s,roster,s.date).field[1].id));
});
test('all selected WBC players are absent from spring rosters, not just the user',()=>{
  const s=fixture();const entry=wbc.freezeWbcRoster(s);assert.equal(entry.roster.length,30);s.date='2030-03-04';
  const ids=new Set(entry.roster.map(row=>row.id));for(let club=0;club<10;club++)assert.ok(spring.springRoster(s,club).every(p=>!ids.has(p.id)));
  const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.deepEqual(restored.nationalTeams,s.nationalTeams);assert.ok(spring.springRoster(restored,0).every(p=>!ids.has(p.id)));
});
test('a pending WBC invitation retains the two-way field frozen at selection',()=>{
  const s=fixture(),p=e.getPlayer(s);p.twoWay={pitchingPosition:'SP',battingPosition:'SS',nextAssignment:'batting',reputationBonus:0};
  for(const key of ['contact','power','speed','defense'])p.stats[key]=91;
  for(const key of ['velocity','control','movement'])p.stats[key]=88;
  Object.assign(p.career[0].byLevel.first.pitching,{outs:300,BF:420});
  const entry=wbc.freezeWbcRoster(s);assert.equal(entry.roster.find(row=>row.id===p.id).position,'SS');
  for(const key of ['velocity','control','movement'])p.stats[key]=99;
  assert.ok(wbc.tryWbcInvitation(s));assert.equal(s.careerEvent.proEvent.field,'batting');
});
test('all forty-five spring games remain playable during WBC without using any called-up player',()=>{
  const s=fixture(),entry=wbc.freezeWbcRoster(s),selected=new Set(entry.roster.map(row=>row.id)),enabled=e.params['pro_events.enabled'];
  try{
    e.params['pro_events.enabled']=0;
    for(const game of spring.springSchedule(2030)){
      s.date=game.date;for(const p of s.players){p.fatigue=0;p.forcedRest=false;}
      assert.equal(e.simulateGame(s,game,[]),true);assert.equal(game.status,'completed',game.id);
      assert.ok(game.lineup.flat().every(id=>!selected.has(id)),game.id);assert.ok(Object.keys(game.boxScore).every(id=>!selected.has(id)),game.id);
    }
  }finally{e.params['pro_events.enabled']=enabled;}
});
test('a real spring game commits only spring stats and good spring results increase selection',()=>{
  const s=fixture(2027);for(const p of s.players){p.seasonByLevel={first:e.emptyRecord(),second:e.emptyRecord()};p.seasonStats=e.emptyRecord();}
  const g=spring.springSchedule(2027)[0];s.calendar.events=[g];s.date=g.date;
  const before=new Map(s.players.map(p=>[p.id,structuredClone({regular:p.seasonStats,levels:p.seasonByLevel})]));
  const enabled=e.params['pro_events.enabled'];try{e.params['pro_events.enabled']=0;assert.equal(e.simulateGame(s,g,[]),true);}finally{e.params['pro_events.enabled']=enabled;}
  assert.equal(g.status,'completed');assert.ok(Object.values(g.boxScore).some(r=>r.batting.PA));
  assert.ok(g.evaluationEnvironment.teams.every(team=>team.batting>0&&team.pitching>0));
  for(const id of Object.keys(g.boxScore)){const p=s.players.find(p=>p.id===id);assert.deepEqual(p.seasonStats,before.get(id).regular);assert.deepEqual(p.seasonByLevel,before.get(id).levels);assert.ok(p.seasonSpring);}
  const p=e.getPlayer(s);p.seasonSpring=e.emptyRecord();const score=e.proSelectionScore(p);Object.assign(p.seasonSpring.batting,{PA:35,AB:30,H:20,HR:5,BB:5});assert.ok(e.proSelectionScore(p)>score);
});
test('youth roster freezes fifteen pitchers and fifteen hitters in September, never before',()=>{
  const s=fixture(2027);for(const p of s.players){delete p.careerMode;delete p.professional;p.grade=1;p.reputation=60;}
  delete s.careerMode;s.proWorld=undefined;const p=e.getPlayer(s);p.position='SS';p.primaryRole=e.roleFor('SS');for(const key of Object.keys(p.stats))p.stats[key]=99;
  s.date='2027-08-31';assert.equal(tryNationalEvent(s),false);assert.equal(s.nationalTeams,undefined);s.date='2027-09-01';assert.equal(tryNationalEvent(s),true);
  const entry=s.nationalTeams[0];assert.equal(entry.roster.length,30);assert.equal(entry.roster.filter(row=>row.field==='pitching').length,15);assert.equal(entry.roster.filter(row=>row.field==='batting').length,15);assert.equal(s.careerEvent.definitionId,'P08');
  const roster=structuredClone(entry.roster);s.careerEvent=null;assert.equal(tryNationalEvent(s),false);assert.deepEqual(entry.roster,roster);
});
