import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),{competitionRoundLabel,schoolCompetitionStatus}=require('../.test-build/lib/competition-progress.js'),View=require('../.test-build/app/components/competition-schedule.js').default;
function fixture(count=8){
 const rounds=Math.ceil(Math.log2(count)),competition={id:'spring',name:'황금사자기',kind:'tournament',initialized:true,startDate:'2027-05-01',endDate:'2027-05-15',participantTeamIds:Array.from({length:count},(_,i)=>i),roundDates:Array.from({length:rounds},(_,i)=>`2027-05-${String(i+1).padStart(2,'0')}`),round:1,byes:[],championTeamId:null,entryRule:'선발 학교 토너먼트'};
 return {date:'2027-05-01',playerId:'mine',players:[{id:'mine',teamId:0}],teams:Array.from({length:count},(_,id)=>({id,name:`학교 ${id}`})),calendar:{seasonYear:2027,competitions:[competition],events:[],sourceUrl:'https://example.com'}};
}
function loss(state,round,status='completed',score=[1,3]){state.calendar.events.push({id:'loss',competitionId:'spring',date:'2027-05-02',round,homeTeamId:0,awayTeamId:1,status,score,advancingTeamId:status==='inProgress'?undefined:1,forfeitTeamId:status==='forfeit'?0:undefined});}
test('school results name the actual elimination round, including byes, forfeits, drawn advancement and runner-up',()=>{
 for(const [count,round,label] of [[8,1,'8강 탈락'],[8,2,'4강 탈락'],[8,3,'준우승'],[100,2,'64강 탈락']]){
  const s=fixture(count),c=s.calendar.competitions[0];loss(s,round);assert.equal(schoolCompetitionStatus(s,c,0),label);
 }
 const s=fixture(),c=s.calendar.competitions[0];loss(s,1,'forfeit');assert.equal(schoolCompetitionStatus(s,c,0),'8강 탈락');s.calendar.events=[];loss(s,3,'completed',[2,2]);assert.equal(schoolCompetitionStatus(s,c,0),'준우승');c.championTeamId=0;assert.equal(schoolCompetitionStatus(s,c,0),'우승');
});
test('unfinished and unentered school competitions never claim an elimination',()=>{
 const s=fixture(),c=s.calendar.competitions[0];loss(s,1,'inProgress');assert.equal(schoolCompetitionStatus(s,c,0),'8강 진행 중');assert.equal(schoolCompetitionStatus(s,c,99),'미출전');c.initialized=false;assert.equal(schoolCompetitionStatus(s,c,0),'출전권 결정 대기');
});
test('school bracket shows round names, final waiting card and the school result on both list and detail',()=>{
 const s=fixture(),c=s.calendar.competitions[0];loss(s,1);const html=renderToStaticMarkup(createElement(View,{state:s}));assert.equal(competitionRoundLabel(c,1),'8강');assert.equal(competitionRoundLabel(c,2),'4강 · 준결승');assert.equal(competitionRoundLabel(c,3),'결승전');assert.equal((html.match(/8강 탈락/g)??[]).length,2);assert.ok(html.includes('ROUND 01'));assert.ok(html.includes('ROUND 03'));assert.ok(html.includes('medal-gold'));assert.ok(html.includes('우리 학교'));assert.ok(html.includes('진출 학교 미정'));
});
