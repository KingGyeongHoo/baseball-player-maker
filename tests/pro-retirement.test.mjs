import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js'),pc=require('../.test-build/lib/sim/pro-career.js');
const life=require('../.test-build/lib/sim/pro-season.js'),market=require('../.test-build/lib/sim/pro-market.js');
const retirement=require('../.test-build/lib/sim/pro-retirement.js');
const jersey=require('../.test-build/lib/jersey-numbers.js'),save=require('../.test-build/lib/career-save.js');
const {careerHonors}=require('../.test-build/lib/career-summary.js');
const {BASE_SALARY}=require('../.test-build/lib/sim/pro-world.js');
const {ProContractPanel,ProRetirement}=require('../.test-build/app/components/pro-career-panels.js');
let template;
function clear(s){delete s.careerNotice;s.noticeQueue=[];s.careerEvent=null;return s;}
function fixture(ability=50){
 if(!template){const s=clear(pc.createProfessionalDemo('retirement-market','원클럽','SS'));s.date=s.proWorld.regularEnd;life.closeProfessionalSeason(s);template=clear(s);}
 const s=structuredClone(template),p=e.getPlayer(s);p.age=39;p.fatigue=0;p.injury=null;p.proContract.status='regular';p.professional.faEligible=true;p.professional.contract.endYear=s.proWorld.year;
 for(const key of Object.keys(p.stats))p.stats[key]=ability;
 for(const c of s.proWorld.clubs)c.budget=1e12;
 return s;
}
function scores(p,values){const row=p.professional.assessments.at(-1);p.professional.assessments=values.map((score,i)=>{const copy={...row,year:row.year-values.length+1+i,score,cumulative:score,grade:'S',cumulativeGrade:'S'};delete copy.war;return copy;});}

test('declining veteran without outside FA demand gets only a final one-year minimum-salary home offer',()=>{
 const s=fixture(),p=e.getPlayer(s),before=structuredClone(p.professional.contract),service=structuredClone(p.professional.service);
 market.openContractMarket(s);const m=s.proWorld.market,offer=m.offers[0];
 assert.equal(m.retentionOnly,true);assert.equal(m.offers.length,1);assert.equal(offer.club,before.club);assert.equal(offer.lastChance,true);assert.equal(offer.final,true);assert.equal(offer.years,1);assert.equal(offer.salary,BASE_SALARY);
 assert.deepEqual(p.professional.contract,before);assert.deepEqual(p.professional.service,service);assert.equal(p.professional.employment,'active');
 assert.throws(()=>market.negotiateOffer(s,offer.id),/재협상할 수 없습니다/);
 assert.throws(()=>life.actOnProCareer(s,{type:'unattached'}),/마지막 계약 제안/);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.deepEqual(restored.proWorld.market,m);
 const signed=life.actOnProCareer(restored,{type:'accept',id:offer.id}),q=e.getPlayer(signed);
 assert.equal(signed.proWorld.market.settled,true);assert.equal(q.professional.contract.salary,BASE_SALARY);assert.equal(q.professional.contract.startYear,offer.year);assert.equal(q.professional.contract.endYear,offer.year);
 assert.deepEqual(q.professional.service,service);assert.equal(q.professional.movements.at(-1).kind,'FA 잔류');assert.equal(life.canEnterNextProCamp(signed),true);
});

test('high-performing older players can still receive normal multi-club FA offers',()=>{
 const s=fixture(100),p=e.getPlayer(s);p.age=42;market.openContractMarket(s);
 assert.equal(s.proWorld.market.retentionOnly,undefined);assert.equal(s.proWorld.market.offers.length,3);assert(s.proWorld.market.offers.some(o=>o.club!==p.professional.contract.club));assert(s.proWorld.market.offers.every(o=>!o.lastChance));
});

test('a young FA without an offer retains the existing market and unattached retry rather than forced retirement',()=>{
 const s=fixture(1),p=e.getPlayer(s);p.age=25;for(const c of s.proWorld.clubs)c.budget=0;market.openContractMarket(s);
 assert.equal(s.proWorld.market.offers.length,0);assert.equal(s.proWorld.market.retentionOnly,undefined);assert.equal(s.proWorld.market.settled,false);assert.equal(s.proWorld.stage,'offseason');assert.equal(p.professional.employment,'active');
});

test('no home demand or no affordable home offer immediately retires the player through the public offseason action',()=>{
 for(const reason of ['ability','budget']){
  const s=fixture(reason==='ability'?1:50),p=e.getPlayer(s);if(reason==='budget')for(const c of s.proWorld.clubs)c.budget=0;
  const result=life.actOnProCareer(s,{type:'market'}),q=e.getPlayer(result);
  assert.equal(result.proWorld.stage,'retired',reason);assert.equal(result.phase,'ended');assert.equal(q.professional.employment,'retired');assert.equal(q.teamId,-1);assert.equal(q.professional.contract,null);assert.equal(result.proWorld.market.settled,true);assert.deepEqual(result.proWorld.market.offers,[]);
  assert(result.proWorld.retired.reason.includes('원소속팀'));assert.equal(life.canEnterNextProCamp(result),false);assert.equal(p.professional.employment,'active');
  clear(result);life.prepareOffseason(result);assert.equal(result.proWorld.stage,'retired');
 }
});

test('last-chance choices cannot reroll offers, wait or enter an unattached season, and retirement stays available',()=>{
 const s=fixture();life.prepareOffseason(s);clear(s);const before=structuredClone(s.proWorld.market.offers);market.refreshOffers(s);assert.deepEqual(s.proWorld.market.offers,before);
 assert.throws(()=>life.actOnProCareer(s,{type:'wait'}),/마지막 계약 제안/);assert.throws(()=>life.actOnProCareer(s,{type:'unattached'}),/마지막 계약 제안/);
 const html=renderToStaticMarkup(createElement(ProContractPanel,{state:s,disabled:false,onAction(){},onRetire(){}}));
 for(const text of ['마지막 제안','최저 연봉','은퇴 선택'])assert(html.includes(text));
 for(const text of ['재협상 1회','다음 주 스토브리그 →','무소속으로 다음 시즌 준비'])assert(!html.includes(text));
 const result=life.actOnProCareer(s,{type:'retire'});assert.equal(result.proWorld.stage,'retired');
});

test('one-club cumulative S retirement registers the last jersey, persists it and renders the honor',()=>{
 const s=fixture(),p=e.getPlayer(s),club=p.professional.contract.club;jersey.choosePlayerJersey(s,77);scores(p,[84,82]);
 const history=structuredClone(p.career);life.retireProfessional(s);
 const honor=s.proWorld.retiredNumbers[0];assert.equal(honor.club,club);assert.equal(honor.number,77);assert.equal(honor.score,83);assert.equal(honor.playerId,p.id);assert.equal(s.careerNotice.title,`${s.teams[club].name.replace(' 1군','')} 77번 영구결번`);assert.deepEqual(p.career,history);
 life.retireProfessional(s);assert.equal(s.proWorld.retiredNumbers.length,1);
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert.deepEqual(restored.proWorld.retiredNumbers,s.proWorld.retiredNumbers);
 assert(careerHonors(restored).individual.some(row=>row.title==='영구결번'&&row.detail.includes('77번')));
 const html=renderToStaticMarkup(createElement(ProRetirement,{state:restored,onRecords(){},onNew(){}}));assert(html.includes('77'));assert(html.includes('영구결번'));assert(html.includes('S등급'));
});

test('retired number eligibility uses the cumulative grade boundary and rejects any previous club',()=>{
 for(const [value,qualifies]of [[81,false],[81.04,false],[81.06,true],[100,true]]){
  const s=fixture(),p=e.getPlayer(s);scores(p,[value]);life.retireProfessional(s);assert.equal(!!s.proWorld.retiredNumbers?.length,qualifies,String(value));
 }
 const s=fixture(),p=e.getPlayer(s);scores(p,[100,62]);life.retireProfessional(s);assert.equal(s.proWorld.retiredNumbers,undefined);
 for(const source of ['service','movements']){
  const t=fixture(),q=e.getPlayer(t),other=(q.professional.firstClub+1)%10;scores(q,[90]);
  if(source==='service')q.professional.service.push({club:other,from:t.proWorld.year-1,to:t.proWorld.year-1});else q.professional.movements.push({date:t.date,from:other,to:q.professional.firstClub,kind:'트레이드',reason:'이전 소속'});
  life.retireProfessional(t);assert.equal(t.proWorld.retiredNumbers,undefined);
 }
});

test('a retired number is unavailable in all four squads, available in other clubs, and preserved after NPC removal',()=>{
 const s=fixture(),p=e.getPlayer(s),club=p.professional.contract.club;jersey.choosePlayerJersey(s,77);scores(p,[90]);life.retireProfessional(s);
 for(const offset of [0,10,20,30]){const teammate=s.players.find(q=>q.id!==p.id&&q.teamId===club);teammate.teamId=club+offset;teammate.jerseyNumber=77;jersey.syncJerseyNumbers(s);assert.notEqual(teammate.jerseyNumber,77);}
 const other=s.players.find(q=>q.teamId>=0&&q.teamId%10!==club);other.jerseyNumber=77;for(const q of s.players)if(q.id!==other.id&&q.teamId>=0&&q.teamId%10===other.teamId%10&&q.jerseyNumber===77)delete q.jerseyNumber;jersey.syncJerseyNumbers(s);assert.equal(other.jerseyNumber,77);
 const before=p.jerseyNumber;p.teamId=club+20;assert.throws(()=>jersey.choosePlayerJersey(s,77),/영구결번/);assert.equal(p.jerseyNumber,before);p.teamId=-1;
 const npc=s.players.find(q=>q.id!==p.id&&q.teamId>=0);scores(npc,[90]);npc.jerseyNumber=88;const npcHonor=retirement.registerRetiredNumber(s,npc);assert(npcHonor);npc.professional.employment='retired';npc.teamId=-1;
 const restored=save.decodeCareerSave(JSON.stringify(save.encodeCareerSave(s))).state;assert(!restored.players.some(q=>q.id===npc.id));assert(restored.proWorld.retiredNumbers.some(row=>row.playerId===npc.id));
});
