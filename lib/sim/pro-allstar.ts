import {nationalAway} from "./national-teams";
import {available,clamp,emptyRecord,getPlayer,hash,isPitcher,params,roleFor,roleScore,selectionScore,simulateGame} from "./engine";
import {eventTrainingReward} from "./event-system";
import {clearProfessionalReputation} from "./pro-selection";
import {performanceValue} from "./pro-evaluation";
import {proNews,proNotice} from "./pro-world";
import {allstarDates} from "./pro-allstar-calendar";
import type {CareerEvent,Game,GameState,Player,Position} from "./types";
import type {AllstarCandidate,AllstarLeague,AllstarLevel,AllstarMember,AllstarSide,AllstarTeam,ProAllstarSeason} from "./pro-allstar-types";

export const allstarSlots:Position[]=["SP","RP","CP","C","1B","2B","3B","SS","LF","CF","RF","DH"];
export const allstarSides:AllstarSide[]=["blue","white"];
export const allstarLevels:AllstarLevel[]=["first","second"];
export const allstarSideLabels={blue:"BLUE Team",white:"WHITE Team"};
export const allstarRules={selectionGrowthWeeks:3,mvpGrowthWeeks:2,injuryMultiplier:1.5,injuryExtra:.015};
const blueClubs=new Set([0,9,7,3,4]);
export const allstarSide=(club:number):AllstarSide=>blueClubs.has(club%10)?"blue":"white";
const fieldPositions:Position[]=["C","SS","CF","2B","1B","3B","LF","RF","DH"];
const team=():AllstarTeam=>({ballots:{},roster:[],withdrawn:[]});
const league=():AllstarLeague=>({blue:team(),white:team()});
export function allstarSeasonView(s:GameState):ProAllstarSeason{
  const year=s.calendar.seasonYear;
  return s.proWorld?.allstar?.year===year?s.proWorld.allstar:{version:1,year,introducedAt:s.date,levels:{first:league(),second:league()}};
}
export function ensureAllstarSeason(s:GameState){
  if(s.careerMode!=="pro"||!s.proWorld)return undefined;
  if(s.proWorld.allstar?.year!==s.calendar.seasonYear){
    s.proWorld.allstar=allstarSeasonView(s);
    const dates=allstarDates(s.calendar.seasonYear);
    if(s.date>dates.second)s.proWorld.allstar.levels.second.cancelled="기능 적용 시점에 이번 시즌 2군 올스타 일정이 이미 지났습니다.";
    if(s.date>dates.first)s.proWorld.allstar.skipped=true;
  }
  return s.proWorld.allstar;
}
export const allstarVotingDates=(year:number)=>[`${year}-05-01`,`${year}-05-15`,`${year}-05-29`,`${year}-06-12`,`${year}-06-26`,`${year}-06-30`];
export function nextAllstarVoteDate(s:GameState){const season=allstarSeasonView(s);return allstarVotingDates(season.year).find(date=>date>(season.lastUpdated??""))??null;}
function currentLevel(p:Player,level:AllstarLevel){return level==="first"?p.teamId>=0&&p.teamId<10:p.teamId>=10&&p.teamId<20;}
function played(p:Player,level:AllstarLevel,pitching=isPitcher(p.primaryRole)){const r=p.seasonByLevel?.[level];return !!r&&(pitching?r.pitching.BF>0:r.batting.PA>0);}
function eligible(p:Player,level:AllstarLevel){return p.professional?.employment==="active"&&currentLevel(p,level)&&played(p,level);}
function fits(p:Player,slot:Position){
  if(["SP","RP","CP"].includes(slot))return isPitcher(p.primaryRole)&&p.position===slot;
  return !isPitcher(p.primaryRole)&&(slot==="DH"||p.position===slot);
}
export function allstarMerit(p:Player,level:AllstarLevel,slot=p.position){
  const role=roleFor(slot),records=p.seasonByLevel?.[level]??emptyRecord();
  return .45*roleScore(p,role)+.4*selectionScore(p,role)+.15*performanceValue({...p,primaryRole:role},records,level==="second");
}
const rankCandidates=(a:AllstarCandidate,b:AllstarCandidate)=>b.votes-a.votes||a.playerId.localeCompare(b.playerId);
export function allstarBallot(s:GameState,level:AllstarLevel,side:AllstarSide,slot:Position){
  const rows=allstarSeasonView(s).levels[level][side].ballots[slot]??[];
  return [...rows].sort(rankCandidates);
}
function pool(s:GameState,level:AllstarLevel,side:AllstarSide){return s.players.filter(p=>eligible(p,level)&&allstarSide(p.teamId)===side);}
export function updateAllstarVotes(s:GameState,includeFinal=false){
  const season=ensureAllstarSeason(s);if(!season||season.skipped||season.finalizedAt)return;
  for(const date of allstarVotingDates(season.year)){
    if(date>s.date||date<=(season.lastUpdated??"")||!includeFinal&&date.endsWith("06-30"))continue;
    const days=season.lastUpdated?Math.round((Date.parse(date)-Date.parse(season.lastUpdated))/86400000):1;
    for(const level of allstarLevels)for(const side of allstarSides){
      const target=season.levels[level][side],players=pool(s,level,side);
      for(const rows of Object.values(target.ballots))for(const row of rows)row.nominated=false;
      for(const club of [...new Set(players.map(p=>p.teamId%10))]){
        const used=new Set<string>();
        for(const slot of allstarSlots){
          const p=players.filter(p=>p.teamId%10===club&&!used.has(p.id)&&fits(p,slot)).sort((a,b)=>allstarMerit(b,level,slot)-allstarMerit(a,level,slot)||a.id.localeCompare(b.id))[0];
          if(!p)continue;used.add(p.id);
          const rows=target.ballots[slot]??=[],existing=rows.find(row=>row.playerId===p.id);
          const row=existing??{playerId:p.id,name:p.name,club,slot,votes:0,nominated:true};
          row.nominated=true;row.name=p.name;row.club=club;
          row.votes+=Math.max(1,Math.round(Math.max(1,allstarMerit(p,level,slot))**2*days*100));
          if(!existing)rows.push(row);
        }
      }
    }
    season.lastUpdated=date;
  }
}
function rewardSelection(s:GameState,member:AllstarMember,level:AllstarLevel,side:AllstarSide){
  const p=s.players.find(p=>p.id===member.playerId);if(!p?.professional)return;
  const pro=p.professional,history=pro.allstarHistory??=[];
  if(history.some(row=>row.year===s.calendar.seasonYear))return;
  history.push({year:s.calendar.seasonYear,level,side,slot:member.slot,method:member.method});
  p.stats.bq=clamp(p.stats.bq+eventTrainingReward(p,"bq",allstarRules.selectionGrowthWeeks),1);clearProfessionalReputation(p);
}
const member=(p:Player,slot:Position,method:AllstarMember["method"]):AllstarMember=>({playerId:p.id,name:p.name,club:p.teamId%10,slot,method});
export function finalizeAllstars(s:GameState){
  const season=ensureAllstarSeason(s);if(!season||season.skipped||season.finalizedAt||s.date<`${season.year}-06-30`)return false;
  updateAllstarVotes(s,true);
  const used=new Set<string>();
  for(const level of allstarLevels)for(const side of allstarSides){
    if(season.levels[level].cancelled)continue;
    const target=season.levels[level][side],players=pool(s,level,side).filter(p=>available(p,s.date)&&p.fatigue<85&&!nationalAway(s,p));
    for(const slot of allstarSlots){
      const candidates=allstarBallot(s,level,side,slot).map(row=>players.find(p=>p.id===row.playerId)).filter((p):p is Player=>!!p&&!used.has(p.id)&&fits(p,slot));
      const best=candidates[0]??players.filter(p=>!used.has(p.id)&&fits(p,slot)).sort((a,b)=>allstarMerit(b,level,slot)-allstarMerit(a,level,slot)||a.id.localeCompare(b.id))[0];
      if(best){target.roster.push(member(best,slot,"vote"));used.add(best.id);}
    }
    const take=(rows:Player[],count:number)=>{for(const p of rows.filter(p=>!used.has(p.id)).sort((a,b)=>allstarMerit(b,level)-allstarMerit(a,level)||a.id.localeCompare(b.id)).slice(0,count)){target.roster.push(member(p,p.position,"manager"));used.add(p.id);}};
    // Recommendation remains open to every position; retain enough pitching
    // and a second catcher to field a playable exhibition without inventing NPCs.
    take(players.filter(p=>p.position==="C"),Math.max(0,2-target.roster.filter(p=>p.slot==="C").length));
    take(players.filter(p=>isPitcher(p.primaryRole)),Math.max(0,6-target.roster.filter(p=>["SP","RP","CP"].includes(p.slot)).length));
    take(players,Math.max(0,Math.min(22-target.roster.length,10-target.roster.filter(row=>row.method==="manager").length)));
    for(const row of target.roster)rewardSelection(s,row,level,side);
  }
  season.finalizedAt=`${season.year}-06-30`;
  const mine=getPlayer(s),selected=mine.professional?.allstarHistory?.find(row=>row.year===season.year);
  proNews(s,`${season.year} 1·2군 올스타 최종 명단 확정`,`${season.year}:allstar-final`);
  if(selected)proNotice(s,`allstar-selected:${season.year}`,`${selected.level==="first"?"1군":"2군"} 올스타에 선발됐습니다`,`${allstarSideLabels[selected.side]} · ${selected.method==="vote"?"투표 선발":"감독 추천"}. 평판 보상이 반영됐습니다. 7월 올스타 무대를 준비합니다.`);
  return true;
}
function replaceUnavailable(s:GameState,level:AllstarLevel){
  const season=ensureAllstarSeason(s)!;
  const used=new Set(allstarLevels.flatMap(l=>allstarSides.flatMap(side=>[...season.levels[l][side].roster.map(row=>row.playerId),...season.levels[l][side].withdrawn])));
  for(const side of allstarSides){const target=season.levels[level][side];
    for(let i=target.roster.length-1;i>=0;i--){
      const row=target.roster[i],p=s.players.find(p=>p.id===row.playerId);
      if(p?.professional?.employment==="active"&&available(p,s.date)&&p.fatigue<85&&!nationalAway(s,p))continue;
      target.withdrawn.push(row.playerId);const history=p?.professional?.allstarHistory?.find(r=>r.year===season.year);if(history)history.withdrawn=true;
      const candidates=pool(s,level,side).filter(p=>!used.has(p.id)&&available(p,s.date)&&p.fatigue<85);
      const replacement=candidates.filter(p=>fits(p,row.slot)).sort((a,b)=>allstarMerit(b,level,row.slot)-allstarMerit(a,level,row.slot)||a.id.localeCompare(b.id))[0]??(row.method!=="vote"?candidates.sort((a,b)=>allstarMerit(b,level)-allstarMerit(a,level)||a.id.localeCompare(b.id))[0]:undefined);
      if(replacement){const next={...member(replacement,row.method==="vote"?row.slot:replacement.position,"replacement"),replacementFor:row.playerId};target.roster[i]=next;used.add(replacement.id);rewardSelection(s,next,level,side);proNews(s,`${level==="first"?"1군":"2군"} 올스타 대체 선발 · ${replacement.name}`);}
      else target.roster.splice(i,1);
    }
  }
}
function userEvent(s:GameState,id:string,title:string,description:string,choices:CareerEvent["choices"]){
  s.careerEvent={id:`${s.calendar.seasonYear}:${id}:${s.playerId}`,definitionId:id,rewardVersion:3,kind:"special",date:s.date,title,description,choices};
}
export function prepareAllstarDay(s:GameState){
  const season=ensureAllstarSeason(s);if(!season||season.skipped||s.careerEvent||s.careerNotice)return false;
  updateAllstarVotes(s);
  if(s.date>=`${season.year}-07-01`&&!season.finalizedAt)finalizeAllstars(s);
  if(s.careerNotice)return true;
  if(season.finalizedAt)for(const level of allstarLevels)if(allstarDates(season.year)[level]===s.date&&!season.levels[level].game)replaceUnavailable(s,level);
  const mine=getPlayer(s),selection=mine.professional?.allstarHistory?.find(r=>r.year===season.year&&!r.withdrawn);
  if(!selection||s.date<`${season.year}-07-01`||params["pro_events.enabled"]===0)return false;
  const level=season.levels[selection.level],date=allstarDates(season.year)[selection.level];
  if(!level.prepared&&s.date<=date){
    level.prepared=true;
    const keys=isPitcher(mine.primaryRole)?["velocity","control","movement"] as const:["contact","power","speed","defense"] as const;
    const weak=[...keys].sort((a,b)=>mine.stats[a]-mine.stats[b])[0];
    userEvent(s,`AS-PREP-${selection.level}`,"별들의 무대에 초대받았다",`${allstarSideLabels[selection.side]}의 ${selection.level==="first"?"1군":"2군"} 올스타. ${date} 경기를 앞두고 준비 방식을 정한다. 선발 경험의 능력 성장은 이미 반영됐으며 실제 출전 때 피로와 부상 위험이 생긴다.`,[
      {id:"routine",label:"평소 루틴과 회복에 집중한다",outcomes:[{weight:100,message:"새 무대에서도 내 페이스를 지키기로 했다.",fatigue:-3}]},
      {id:"team",label:"다른 구단 선수들과 호흡을 맞춘다",outcomes:[{weight:100,message:"낯선 동료들과 야구 이야기를 나누며 긴장을 풀었다.",fatigue:-1,reputation:.5}]},
      {id:"learn",label:"다른 올스타 선수에게 기술을 배운다",outcomes:[{weight:60,message:"상대의 시범을 따라 해보며 내 약점을 다듬을 감각을 찾았다.",weeks:{[weak]:3},fatigue:2},{weight:40,message:"당장 동작에 붙지는 않았지만 상황을 읽는 새로운 관점을 얻었다.",weeks:{bq:1},fatigue:1}]},
    ]);return true;
  }
  return false;
}
function simulateAllstar(s:GameState,level:AllstarLevel){
  const season=ensureAllstarSeason(s)!,entry=season.levels[level];
  if(entry.game||entry.cancelled)return;
  replaceUnavailable(s,level);
  const rosters=allstarSides.map((side,index)=>entry[side].roster.map(row=>{
    const p=structuredClone(s.players.find(p=>p.id===row.playerId)!);p.teamId=index;p.seasonStats=emptyRecord();p.recentAppearances=[];delete p.twoWay;
    p.eligiblePositions=[...new Set([...p.eligiblePositions,row.slot])];return p;
  }));
  const prepared=allstarSides.map((side,index)=>{
    const rows=entry[side].roster,used=new Set<string>();
    const field=fieldPositions.map(slot=>{const row=rows.find(row=>row.method==="vote"&&row.slot===slot&&!used.has(row.playerId))??rows.find(row=>!used.has(row.playerId)&&fits(rosters[index].find(p=>p.id===row.playerId)!,slot));if(row)used.add(row.playerId);return row?.playerId;});
    const pitchers=rows.filter(row=>isPitcher(rosters[index].find(p=>p.id===row.playerId)!.primaryRole)).map(row=>row.playerId),starter=rows.find(row=>row.slot==="SP")?.playerId??pitchers[0];
    return {field:field.filter((id):id is string=>!!id),order:field.filter((id):id is string=>!!id),pitchers,starter};
  });
  if(prepared.some(row=>row.field.length!==9||!row.starter)){entry.cancelled="출전 가능한 포지션의 선수가 부족하여 올스타 경기를 열지 못했습니다.";return;}
  const game:Game={id:`${season.year}:allstar:${level}`,date:s.date,homeTeamId:0,awayTeamId:1,competitionId:`allstar-${level}`,exhibition:"allstar",round:1,rulesetId:"pro-allstar-v1",status:"scheduled",score:[0,0],innings:[[],[]],lineup:[],boxScore:{},proPreparedLineup:prepared as NonNullable<Game["proPreparedLineup"]>};
  const sandbox:GameState={...s,careerMode:undefined,proWorld:undefined,proEvents:undefined,players:rosters.flat(),playerId:"allstar-observer",careerEvent:null,careerNotice:undefined,weekProgress:undefined,matchProgress:undefined,matchEffect:undefined,rngStates:{...s.rngStates,match:hash(`${s.seed}:allstar:${season.year}:${level}`)}};
  simulateGame(sandbox,game,rosters);entry.game=game;
  const winners=game.score[0]===game.score[1]?null:game.score[0]>game.score[1]?"blue":"white";
  const ranked=Object.entries(game.boxScore).filter(([,r])=>r.batting.PA>0||r.pitching.BF>0).map(([id,r])=>{
    const side:AllstarSide=entry.blue.roster.some(row=>row.playerId===id)?"blue":"white";
    return {id,side,score:r.batting.H+2*r.batting.HR+.8*r.batting.RBI+.4*r.batting.R+.3*r.batting.BB+.25*r.pitching.outs+.7*r.pitching.SO-r.pitching.ER*2-.5*r.pitching.H-.4*r.pitching.BB+(winners===side ? .5 : 0)};
  }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  for(const clone of sandbox.players){const r=game.boxScore[clone.id];if(!r||!r.batting.PA&&!r.pitching.BF)continue;
    const p=s.players.find(p=>p.id===clone.id)!;p.fatigue=clamp(clone.fatigue+2);if(r.pitching.BF)p.lastPitched=s.date;
    const history=p.professional?.allstarHistory?.find(row=>row.year===season.year);if(history)history.participated=true;
  }
  if(ranked[0]){const best=ranked[0],p=s.players.find(p=>p.id===best.id)!;entry.mvp={playerId:p.id,name:p.name,side:best.side,merit:best.score};
    if(p.professional){p.stats.bq=clamp(p.stats.bq+eventTrainingReward(p,"bq",allstarRules.mvpGrowthWeeks),1);const history=p.professional.allstarHistory?.find(row=>row.year===season.year);if(history)history.mvp=true;clearProfessionalReputation(p);}
  }
  proNews(s,`${level==="first"?"1군":"2군"} 올스타 · BLUE ${game.score[0]} : ${game.score[1]} WHITE${entry.mvp?` · 미스터 올스타 ${entry.mvp.name}`:""}`,`${season.year}:allstar-result:${level}`);
}
export function allstarGameOn(s:GameState,date=s.date){const season=s.proWorld?.allstar;if(!season)return undefined;return allstarLevels.map(level=>season.levels[level].game).find(game=>game?.date===date);}
export function playAllstarDay(s:GameState){
  const season=ensureAllstarSeason(s);if(!season||season.skipped||!season.finalizedAt||s.careerEvent||s.careerNotice)return false;
  const dates=allstarDates(season.year),level=allstarLevels.find(level=>dates[level]===s.date);if(!level)return false;
  const entry=season.levels[level];simulateAllstar(s,level);
  const mine=getPlayer(s),line=entry.game?.boxScore[mine.id];
  if(entry.resultShown||!line||!line.batting.PA&&!line.pitching.BF)return false;
  entry.resultShown=true;const mvp=entry.mvp?.playerId===mine.id;
  if(params["pro_events.enabled"]===0)return false;
  const precision=isPitcher(mine.primaryRole)?"control":"contact";
  userEvent(s,`AS-RESULT-${level}`,mvp?"미스터 올스타에 선정됐다":"올스타의 하루를 마쳤다",`BLUE ${entry.game!.score[0]} : ${entry.game!.score[1]} WHITE · ${mine.name} ${line.batting.AB}타수 ${line.batting.H}안타 ${line.batting.HR}홈런 / ${Math.floor(line.pitching.outs/3)}.${line.pitching.outs%3}이닝 ${line.pitching.SO}탈삼진. ${entry.mvp?`미스터 올스타: ${entry.mvp.name}.`:""} ${mvp?"추가 평판 보상이 반영됐다.":"정규 성적과 분리해 이 무대를 커리어에 남겼다."}`, [
    {id:"remember",label:mvp?"별들의 무대에서 받은 박수를 기억한다":"함께한 무대를 기억한다",outcomes:[{weight:100,message:"올스타전의 기록과 경험을 간직하고 후반기를 준비한다."}]},
    {id:"review",label:"교류하며 배운 기술을 짧게 복습한다",outcomes:[{weight:30,message:"동료의 조언이 실제 승부 장면과 연결되며 감각으로 남았다.",weeks:{[precision]:1},fatigue:1},{weight:70,message:"경험을 노트에 남기고 충분한 회복을 준비했다."}]},
  ]);
  return true;
}
export function finishAllstarDay(s:GameState){if(s.careerMode==="pro"&&s.date===`${s.calendar.seasonYear}-06-30`)finalizeAllstars(s);}
