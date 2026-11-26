import {needsCareerHonorUpgrade,upgradeCareerHonors} from './career-honor-upgrade';
import {showStoveReport} from './stove-report';
import {buyShopItems,settleShopItems,type OffseasonShopAction} from './offseason-shop';
import {syncTrainingDiary} from './pro-selection';
import {advanceInjuryRecovery} from './injury-system';
import {settleInjuryRetirements} from './injury-career';
import {settleFaService} from './fa-service';
import {advanceNationalOffseason,pendingNationalOffseason} from "./national-tournament";
import {nationalInvitation,needsNationalInvitationUpgrade,upgradeNationalInvitation} from './national-teams';
import {ensureProEvents,recordProChoice} from './pro-event-ledger';
import {firstTeamAppearances,recordSeasonAssessment,requiresDevelopmentalOffer,seasonExit} from "./pro-assessment";
import {createProWarContext} from "./pro-war";
import {freezeSeasonRankings} from './pro-season-ranking';
import {ensurePlayableFarmRosters} from "./pro-farm";
import {canAssignProSquad} from "./pro-positions";
import {canPromoteToFirst} from "./pro-squads";
import {syncJerseyNumbers} from "../jersey-numbers";
import {seededPlayerName} from "./player-names";
import {captureEvaluationChange,capturePlayerEvaluations} from "./evaluation-lifecycle";
import {discardRetiredPlayers} from "./retired-records";
import {addDays,available,clamp,draftClubs,draftPlayers,emptyRecord,generatedTalentCohort,getPlayer,hash,params,previewPlayer,random,recovery,reputationScore,roleScore,train,updateReputation} from "./engine";
import {positionCohort} from './position-generation';
import {reviewDevelopmentContract} from './pro-career';
import {developmentCalendar,careerLeagueTable} from "./pro-calendar";
import {applyAging} from "./pro-growth";
import {regularAwards,contractValue,rookieRulesVersion} from "./pro-evaluation";
import {firstTeamRosterCapacity,postseasonTeamCapacity} from './pro-roster';
import {expandPostseasonRosters,needsPostseasonRosterUpgrade} from './pro-postseason-roster';
import {BASE_SALARY,clubName,contractFor,ensureProWorld,initializeProfessional,prepareOpeningRegistrations,proNews,proNotice} from "./pro-world";
import {MIN_PRO_SALARY} from './pro-contract-rules';
import {upgradeContractRules,needsContractUpgrade,applySeasonExitPolicies,offerFor,careerRequest,clubRoster,negotiateOffer,openContractMarket,refreshOffers,releasePlayer,renewNPCs,reviewNPCTrades,reviewStoveReleases,signContract,trimForRookies} from "./pro-market";
import {type GameState,type Game,type Player,type Position} from "./types";
import type {ProSeries} from "./pro-types";
import {freezeProNational} from "./pro-national-events";
import {postseasonRound,postseasonRounds,regularSeasonFinishNotice,professionalSeasonFinishNotice} from "../pro-postseason";
import {advanceLeagueTiebreakers} from "./league-standings";
import {needsProScheduleUpgrade,upgradeProSchedule} from "./pro-schedule";
import {needsProSquadUpgrade,normalizeFirstTeamRoster,rookieDevelopmentalIds} from "./pro-squads";
import {needsAllstarScheduleUpgrade,upgradeAllstarSchedule} from "./pro-allstar-calendar";
import {ensureAllstarSeason} from "./pro-allstar";
import {awardsDate,ensureAwardsCeremony,presentAwardsCeremony} from "./pro-awards-ceremony";
import {individualAwards} from "./pro-individual-awards";
import {syncClubAwardCounts} from './pro-career-evaluation';
import {seasonEndHonorStatus} from './retirement-honor-status';
import {needsNpcFaHistoryUpgrade} from './npc-fa-history';
import {farmPostseasonActive,reviewFarmPostseason,needsFarmPostseasonDateUpgrade,upgradeFarmPostseasonDates} from './pro-farm-postseason';
import {settleSeriesMvp} from './pro-series-awards';
import {archiveProfessionalSeason,registerRetiredNumber,registerRetirementFarewell,retireProfessional,veteranRetirementReason} from "./pro-retirement";
export {archiveProfessionalSeason,retireProfessional} from "./pro-retirement";

function payroll(s:GameState,p:Player){
  const pro=p.professional!,year=s.calendar.seasonYear;if(pro.salaries.some(row=>row.year===year))return;
  const contract=pro.contract;
  const guaranteed=pro.guarantees?.filter(g=>g.year===year)??[];
  for(const g of guaranteed){pro.salaries.push({year,club:g.club,amount:g.amount,salary:g.amount});pro.earnings+=g.amount;}
  if(!contract||contract.startYear>year||contract.endYear<year)return;
  const from=`${year}-01-01`,end=`${year+1}-01-01`,days=(Date.parse(end)-Date.parse(from))/86400000;
  const salaryAt=(date:string)=>[...contract.segments].filter(v=>v.from<=date).at(-1)?.salary??contract.salary;
  const segments=[from,...contract.segments.filter(v=>v.from>from&&v.from<end).map(v=>v.from),...pro.movements.filter(v=>v.date>from&&v.date<end).map(v=>v.date),end].sort();
  const byClub=new Map<number,number>();
  for(let i=0;i<segments.length-1;i++){const date=segments[i],next=segments[i+1],move=[...pro.movements].filter(v=>v.date<=date).at(-1),club=move?move.to??contract.club:pro.service.find(stint=>stint.from<=year&&stint.to>=year)?.club??pro.firstClub;
    byClub.set(club,(byClub.get(club)??0)+salaryAt(date)*(Date.parse(next)-Date.parse(date))/86400000/days);}
  for(const [club,amount] of byClub){const value=Math.trunc(amount);pro.salaries.push({year,club,amount:value,salary:contract.salary});pro.earnings+=value;}
}
function playoffRoster(s:GameState,club:number){
  return s.players.filter(p=>p.teamId===club&&p.proContract?.status!=="developmental").slice(0,postseasonTeamCapacity).map(p=>p.id);
}
function scheduleSeriesGame(s:GameState,series:ProSeries,date:string){
  const number=series.game++,round=postseasonRound(series.stage);
  const home=number<round.games?series.clubs[round.home[number]]:series.drawHomes?.shift()??series.clubs[0],away=series.clubs[1-series.clubs.indexOf(home)];
  const game:Game={id:`${s.calendar.seasonYear}:${series.id}:${number}`,date,homeTeamId:home,awayTeamId:away,competitionId:`pro-playoffs-${series.id}`,round:number+1,rulesetId:"pro-playoffs-v1",status:"scheduled",score:[0,0],innings:[[],[]],lineup:[],boxScore:{}};
  s.calendar.events.push(game);s.calendar.events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));if(date>s.calendar.seasonEnd)s.calendar.seasonEnd=date;series.lastDate=date;
  let competition=s.calendar.competitions.find(c=>c.id===game.competitionId);
  if(!competition){competition={id:game.competitionId,name:round.label,kind:"league",startDate:date,endDate:date,entryRule:"정식 선수 최대 32명 · 포스트시즌 특별 엔트리 · 시리즈별 고정 명단",participantTeamIds:[...series.clubs],initialized:true,round:0,roundDates:[],byes:[],championTeamId:null};s.calendar.competitions.push(competition);}competition.endDate=date;
}
function makeSeries(s:GameState,id:string,stage:ProSeries["stage"],clubs:[number,number],date:string){
  const series:ProSeries={id,stage,clubs,wins:stage==="wildcard"?[1,0]:[0,0],target:postseasonRound(stage).target,game:0,lastDate:date,rosters:Object.fromEntries(clubs.map(club=>[String(club),playoffRoster(s,club)])),excluded:[]};
  s.proWorld!.postseason!.series.push(series);scheduleSeriesGame(s,series,date);return series;
}
export function preparePlayoffReplacements(s:GameState){
  const w=s.proWorld;if(w?.stage!=="postseason")return;
  expandPostseasonRosters(s);
  for(const series of w.postseason!.series.filter(v=>v.winner===undefined))for(const club of series.clubs){
    const ids=series.rosters[String(club)];
    for(let i=0;i<ids.length;i++){const old=s.players.find(p=>p.id===ids[i]);if(!old?.injury||s.date>=old.injury.unavailableUntil)continue;
      const replacement=s.players.filter(p=>(p.teamId===club||canPromoteToFirst(s,p))&&p.teamId%10===club&&!ids.includes(p.id)&&!series.excluded.includes(p.id)&&p.proContract?.status!=="developmental"&&p.position===old.position&&available(p,s.date)).sort((a,b)=>roleScore(b)-roleScore(a)||a.id.localeCompare(b.id))[0];
      if(replacement){
        if(replacement.teamId>=10){
          const first=s.players.filter(p=>p.teamId===club),down=canAssignProSquad(old,'second',s.date)?old:first.length<firstTeamRosterCapacity(s,club)?undefined:
            first.filter(p=>!ids.includes(p.id)&&canAssignProSquad(p,'second',s.date)).sort((a,b)=>roleScore(a)-roleScore(b)||a.id.localeCompare(b.id))[0];
          if(!down&&first.length>=firstTeamRosterCapacity(s,club))continue;
          if(down)down.teamId=replacement.teamId;replacement.teamId=club;
        }
        series.excluded.push(old.id);ids[i]=replacement.id;proNews(s,`${clubName(s,club)} · 포스트시즌 부상 대체 ${old.name} → ${replacement.name}`);
      }
    }
  }
}
export function playoffRosterFor(s:GameState,game:Game,roster:Player[]){
  if(!game.competitionId.startsWith("pro-playoffs-"))return roster;
  const series=s.proWorld?.postseason?.series.find(v=>game.competitionId===`pro-playoffs-${v.id}`);
  return series?roster.filter(p=>series.rosters[String(p.teamId)]?.includes(p.id)):roster;
}
export function needsPostseasonUpgrade(s:GameState){return s.careerMode==="pro"&&s.proWorld?.stage==="postseason"&&!s.proWorld.seasonClosed&&s.proWorld.postseason?.format!=="kbo-v1";}
export function migrateActivePostseason(s:GameState){
  if(!needsPostseasonUpgrade(s))return false;
  const w=s.proWorld!,old=w.postseason??{seeds:[],series:[]};
  const games=s.calendar.events.filter(g=>g.competitionId.startsWith("pro-playoffs-")),ids=new Set(games.map(g=>g.id));
  const appearances=new Map<string,number>();
  for(const g of games)if(g.status==="completed")for(const [id,r] of Object.entries(g.boxScore))appearances.set(id,(appearances.get(id)??0)+r.batting.PA+r.pitching.BF);
  w.replacedPostseason={year:w.year,date:s.date,postseason:structuredClone(old),games:structuredClone(games),competitions:structuredClone(s.calendar.competitions.filter(c=>c.id.startsWith("pro-playoffs-"))),records:[]};
  s.calendar.events=s.calendar.events.filter(g=>!ids.has(g.id));
  s.calendar.competitions=s.calendar.competitions.filter(c=>!c.id.startsWith("pro-playoffs-"));
  const hasRecord=(r:Player["seasonPostseason"])=>!!r&&(r.batting.PA>0||r.pitching.BF>0||!!r.games?.batting||!!r.games?.pitching);
  for(const p of s.players){
    const byClub=Object.fromEntries(Object.entries(p.seasonByClub??{}).filter(([,r])=>hasRecord(r.postseason)).map(([club,r])=>[club,structuredClone(r.postseason)]));
    if(hasRecord(p.seasonPostseason)||Object.keys(byClub).length)w.replacedPostseason.records.push({playerId:p.id,records:structuredClone(p.seasonPostseason??emptyRecord()),byClub});
    p.seasonPostseason=emptyRecord();for(const r of Object.values(p.seasonByClub??{}))r.postseason=emptyRecord();
    const count=appearances.get(p.id)??0;if(count)p.recentAppearances=p.recentAppearances.slice(0,Math.max(0,p.recentAppearances.length-count));
    if(games.some(g=>g.date===p.lastPitched&&(g.boxScore[p.id]?.pitching.BF??0)>0))p.lastPitched=[...s.calendar.events].reverse().find(g=>g.status==="completed"&&(g.boxScore[p.id]?.pitching.BF??0)>0)?.date??null;
    if(p.professional&&games.some(g=>g.date===p.professional?.lastAppearance&&g.boxScore[p.id]))p.professional.lastAppearance=[...s.calendar.events].reverse().find(g=>g.status==="completed"&&((g.boxScore[p.id]?.batting.PA??0)+(g.boxScore[p.id]?.pitching.BF??0)>0))?.date;
  }
  if(s.weekProgress||s.matchProgress)s.date=addDays(s.date,1);
  delete s.weekProgress;delete s.matchProgress;delete s.matchEffect;s.phase="weekStart";s.report=null;
  if(s.careerEvent?.proEvent?.seriesId||s.careerEvent?.scene&&ids.has(s.careerEvent.scene.gameId))s.careerEvent=null;
  if(s.pendingEventOutcome?.scene&&ids.has(s.pendingEventOutcome.scene.gameId))delete s.pendingEventOutcome;
  if(s.proEvents){s.proEvents.history=s.proEvents.history.filter(r=>!r.seriesId);if(s.proEvents.reservation?.context.seriesId)delete s.proEvents.reservation;}
  const seeds=careerLeagueTable(s.calendar,"pro-first").slice(0,5).map(r=>r.teamId);
  w.postseason={format:"kbo-v1",seeds,series:[]};
  expandPostseasonRosters(s);
  s.calendar.seasonEnd=s.calendar.events.at(-1)?.date??w.regularEnd;
  makeSeries(s,"wildcard","wildcard",[seeds[3],seeds[4]],addDays(s.date,1));
  updateReputation(s);
  proNotice(s,`postseason-format:${w.year}`,"포스트시즌 대진을 변경했습니다","현재 시즌도 4위–5위 와일드카드부터 시작합니다. 기존 대진과 포스트시즌 경기·기록은 저장 안에 별도로 보관했으며 새 대진 기록에 합산하지 않습니다. 정규 기록·능력·계약·과거 커리어는 유지됩니다.");
  return true;
}
export function finishProfessionalDay(s:GameState){
  ensureProWorld(s);const w=s.proWorld!;
  if(s.phase==="ended")return true;
  if(migrateActivePostseason(s))return false;
  reviewFarmPostseason(s);
  if(w.stage==="camp"&&s.date>=s.calendar.competitions.find(c=>c.id==="pro-first")!.startDate){prepareOpeningRegistrations(s);w.stage="regular";}
  if(w.stage==='regular')reviewNPCTrades(s);
  if(w.stage==="regular"&&s.date>=w.regularEnd){
    const tiePending=advanceLeagueTiebreakers(s.calendar,'pro-first',s.date);
    if(tiePending)return false;
    for(const id of ["pro-first","pro-second"]){const competition=s.calendar.competitions.find(c=>c.id===id);if(competition)competition.championTeamId=careerLeagueTable(s.calendar,id)[0]?.teamId??null;}
    w.stage="postseason";const standings=careerLeagueTable(s.calendar,"pro-first"),seeds=standings.slice(0,5).map(v=>v.teamId);w.postseason={format:"kbo-v1",seeds,series:[]};
    expandPostseasonRosters(s);
    makeSeries(s,"wildcard","wildcard",[seeds[3],seeds[4]],addDays(s.date,2));
    const notice=regularSeasonFinishNotice(s);
    if(getPlayer(s).teamId>=0&&getPlayer(s).teamId<10)proNotice(s,`PRO10:postseason:${w.year}`,notice.title,notice.message);return false;
  }
  if(w.stage==="postseason"){
    for(const series of w.postseason!.series){if(series.winner!==undefined||series.lastDate!==s.date)continue;
      const game=s.calendar.events.find(g=>g.id===`${w.year}:${series.id}:${series.game-1}`);if(!game||!["completed","forfeit"].includes(game.status)||series.processedGame===series.game-1)continue;
      series.processedGame=series.game-1;
      const winner=game.status==="forfeit"?(game.forfeitTeamId===game.homeTeamId?game.awayTeamId:game.homeTeamId):game.score[0]===game.score[1]?undefined:game.score[0]>game.score[1]?game.homeTeamId:game.awayTeamId;
      if(winner!==undefined)series.wins[series.clubs.indexOf(winner)]++;
      if(series.stage==="wildcard"&&winner===undefined)series.winner=series.clubs[0];
      if(series.wins.some(n=>n>=series.target))series.winner=series.clubs[series.wins[0]>=series.target?0:1];
      if(series.winner!==undefined){s.calendar.competitions.find(c=>c.id===game.competitionId)!.championTeamId=series.winner;settleSeriesMvp(s,series);}
      else {
        if(winner===undefined)(series.drawHomes??=[]).push(game.homeTeamId);
        const round=postseasonRound(series.stage),nextHome=series.game<round.games?series.clubs[round.home[series.game]]:series.drawHomes?.[0]??series.clubs[0];
        scheduleSeriesGame(s,series,addDays(s.date,nextHome===game.homeTeamId?1:2));
      }
    }
    if(w.postseason!.format==="kbo-v1"){
      for(const round of postseasonRounds){if(!round.from||w.postseason!.series.some(v=>v.id===round.id))continue;
        const previous=w.postseason!.series.find(v=>v.id===round.from);
        if(previous?.winner!==undefined)makeSeries(s,round.id,round.stage,[w.postseason!.seeds[round.seed],previous.winner],addDays(s.date,2));
      }
    }else {
      // Finish a saved four-team postseason without erasing games already played.
      const semis=w.postseason!.series.filter(v=>v.stage==="semi");
      if(semis.length===2&&semis.every(v=>v.winner!==undefined)&&!w.postseason!.series.some(v=>v.stage==="final")){
        const seed=(club:number)=>w.postseason!.seeds.indexOf(club),clubs=semis.map(v=>v.winner!).sort((a,b)=>seed(a)-seed(b)) as [number,number];makeSeries(s,"final","final",clubs,addDays(s.date,2));
      }
    }
    const final=w.postseason!.series.find(v=>v.stage==="final");if(final?.winner!==undefined){
      w.postseason!.champion=final.winner;
      if(farmPostseasonActive(s)||s.calendar.events.some(g=>g.competitionId==='pro-second'&&['scheduled','inProgress'].includes(g.status)))return false;
      closeProfessionalSeason(s);return true;
    }
  }return false;
}
export function closeProfessionalSeason(s:GameState){
  const w=s.proWorld!;if(w.seasonClosed)return;
  w.seasonClosed=true;w.stage="summary";s.phase="ended";
  const appearances=firstTeamAppearances(s),warContext=createProWarContext(s);
  for(const p of s.players){if(!p.professional)continue;recordSeasonAssessment(s,p,appearances,warContext);settleFaService(p.professional,w.year);archiveProfessionalSeason(s,p);payroll(s,p);}
  freezeSeasonRankings(s,warContext);
  for(const p of s.players){if(!p.professional)continue;p.professional.proBonus=0;if(p.professional.employment==="freeAgent")p.professional.unattachedYears++;}
  const titles=individualAwards(s);
  const awards=[...regularAwards(s,titles,warContext),...[...(w.postseason?.series??[]),...(w.farmPostseason?.series??[])].flatMap(series=>series.mvp?[structuredClone(series.mvp)]:[])];w.seasons.push({year:w.year,endDate:s.date,standings:careerLeagueTable(s.calendar,"pro-first"),farmStandings:careerLeagueTable(s.calendar,"pro-second"),champion:w.postseason?.champion??null,farmChampion:w.farmPostseason?.champion??null,...(w.farmPostseason?{farmPostseason:structuredClone(w.farmPostseason)}:{}),awards,draft:[],individualAwards:titles,rookieRulesVersion,...(w.allstar?{allstar:structuredClone(w.allstar)}:{})});
  const archived=w.seasons.at(-1)!;if(awards.length||titles.length)archived.awardsCeremony={version:1,scheduledAt:awardsDate(w.year)};
  syncClubAwardCounts(s);
  const p=getPlayer(s),notice=professionalSeasonFinishNotice(s);
  if(p.professional)p.professional.retirementHonorStatus=seasonEndHonorStatus(s,p);
  settleShopItems(p,w.year);
  proNotice(s,`season:${w.year}`,notice.title,notice.message,"seasonComplete");
  settleInjuryRetirements(s);
  if(!w.retired&&!w.pendingRetirement)freezeProNational(s);
}
export function addRookieClass(s:GameState,year:number){
  const w=s.proWorld!;if(w.draftedYears.includes(year))return;
  const candidates:Player[]=[];
  const source={rngStates:{...s.rngStates,generation:hash(`${s.seed}:graduate-positions:${year}`)}},intake=positionCohort(1000,()=>random(source,'generation'));
  for(let i=0;i<1000;i++){const p=previewPlayer(`${s.seed}:graduates:${year}:${i}`,"",intake[i]);p.id=`pro-rookie-${year}-${i}`;
    p.name=seededPlayerName(`${s.seed}:player-name:${p.id}`);
    p.grade=3;p.teamId=i%100;candidates.push(p);
  }
  const talents=generatedTalentCohort(candidates,`${s.seed}:graduates:${year}`);
  for(const p of candidates){p.talent=talents.get(p.id)!;for(let week=0;week<70;week++)train(p,params["training.days"]);p.reputation=reputationScore(p);}
  const state={...s,calendar:{...s.calendar,seasonYear:year},players:candidates,teams:Array.from({length:100},(_,id)=>({id,name:`가상고교 ${id+1}`,shortName:`고교 ${id+1}`,wins:0,losses:0,draws:0}))};
  const order=[...(w.seasons.at(-1)?.standings??[])].reverse().map(r=>r.teamId);
  for(let club=0;club<10;club++)if(!order.includes(club))order.push(club);
  const picks=draftPlayers(state,{order,roster:s.players.filter(p=>!seasonExit(p,w.year))});
  s.rngStates.draft=state.rngStates.draft;
  const developmentalIds=rookieDevelopmentalIds(s.seed,year,picks.map(p=>p.playerId));
  for(const pick of picks){const p=candidates.find(p=>p.id===pick.playerId)!,club=draftClubs.indexOf(pick.club),developmental=developmentalIds.has(p.id);p.grade=0;p.age=19;p.teamId=club+(developmental?30:20);p.careerMode="pro";p.seasonStats=emptyRecord();p.recentAppearances=[];p.proContract={status:developmental?"developmental":"regular",joinedDate:`${year}-03-01`};
    initializeProfessional(s,p,club,developmental?"developmental":"draft");p.professional!.rookieYear=year;p.professional!.agedYear=year;p.professional!.contract=contractFor(club,year,developmental?MIN_PRO_SALARY:BASE_SALARY);p.professional!.service=[{club,from:year,to:year}];s.players.push(p);
  }
  // Assess the completed intake, not an empty place reserved for an unknown
  // prospect. New rookies count when deciding which old positions are surplus.
  for(let club=0;club<10;club++)trimForRookies(s,club,0,year);
  w.draftedYears.push(year);if(w.seasons.at(-1))w.seasons.at(-1)!.draft=picks;
  proNews(s,`${year} 신인 ${picks.length}명 · 잔류군 ${picks.length-developmentalIds.size}명 / 육성선수 ${developmentalIds.size}명 · 직전 정규 시즌 하위 구단 우선`,`${year}:rookie-class`);
}
function retireNPC(s:GameState,p:Player,reason:string){
  const eligibility=registerRetirementFarewell(s,p);
  registerRetiredNumber(s,p,eligibility);
  if(p.teamId>=0)p.professional!.movements.push({date:s.date,from:p.teamId%10,to:null,kind:"은퇴",reason});
  p.professional!.employment="retired";p.professional!.contract=null;p.teamId=-1;
  proNews(s,`${p.name} 은퇴 · ${reason}`,`retirement:${p.id}`);
}
function retireAtSeasonEnd(s:GameState){
  for(const p of s.players){
    if(!p.professional||p.professional.employment==='retired')continue;
    const reason=veteranRetirementReason(p,s.proWorld!.year)??(p.professional.unattachedYears>=2?'무소속으로 두 시즌을 마쳐 도전을 마무리했습니다.':undefined);
    if(!reason)continue;
    if(p.id===s.playerId)s.proWorld!.pendingRetirement??={year:s.proWorld!.year,reason};
    else retireNPC(s,p,reason);
  }
}
export function prepareOffseason(s:GameState){
  const w=s.proWorld!,year=w.year+1;
  settleInjuryRetirements(s);
  if(w.stage==="retired")return;
  if(!w.seasonClosed)throw new Error("시즌 결산 후 스토브리그를 시작할 수 있습니다.");
  if(w.pendingRetirement){
    presentAwardsCeremony(s,true);
    if(!s.careerNotice&&!s.careerEvent)retireProfessional(s,w.pendingRetirement.reason);
    return;
  }
  freezeProNational(s);
  if(pendingNationalOffseason(s))throw new Error('11월 국제대회를 먼저 마친 뒤 스토브리그를 시작할 수 있습니다.');
  // Complete the season's presentations before contracts can end the career.
  if(presentAwardsCeremony(s,true))return;
  ensureAwardsCeremony(s);if(w.stove?.year===year){presentAwardsCeremony(s);return;}
  const legacy=w.market?.year===year,opening=`${w.year}-11-01`,closing=`${year}-01-01`;
  const before=s.date;s.date=[s.date,opening].sort().at(-1)!;
  for(const p of s.players)recoverOffseason(p,before,s.date);
  w.stove={version:1,year,openedAt:s.date,closesAt:closing,nextUpdate:[addDays(s.date,7),closing].sort()[0],round:0,closed:s.date>=closing,movedIds:[]};
  w.stage="offseason";
  // Adopt an already opened market without repeating signings, the rookie
  // class or a pending negotiation from an older save.
  if(legacy){presentAwardsCeremony(s);return;}
  for(const player of s.players){
    if(player.professional&&!player.professional.faSeasons)settleFaService(player.professional,w.year);
  }
  capturePlayerEvaluations(s,"season-end");
  reviewDevelopmentContract(s);
  for(const club of w.clubs){const rank=w.seasons.at(-1)?.standings.findIndex(r=>r.teamId===club.id)??5;club.direction=rank<3?"contend":rank>6?"rebuild":"balanced";}
  retireAtSeasonEnd(s);
  const retirement=s.proWorld!.pendingRetirement;
  if(retirement){
    presentAwardsCeremony(s,true);
    if(!s.careerNotice&&!s.careerEvent)retireProfessional(s,retirement.reason);
    return;
  }
  if(w.retired)return;
  discardRetiredPlayers(s);addRookieClass(s,year);applySeasonExitPolicies(s);openContractMarket(s);if(w.retired)return;processStoveRound(s);if(w.retired)return;w.stage="offseason";
  presentAwardsCeremony(s);
}
function processStoveRound(s:GameState){
  const w=s.proWorld!,stove=w.stove!;
  reviewStoveReleases(s,stove.year);renewNPCs(s,stove.year,stove.closed?9:stove.round);
  // The player's offers get priority over NPC free-agent signings in this
  // round. An offer is revalidated on acceptance against actual capacity.
  if(w.market&&!w.market.settled)refreshOffers(s);
  if(w.retired)return;
  settleNPCFreeAgents(s,stove.year);
  reviewNPCTrades(s);
  if(w.market&&!w.market.settled)refreshOffers(s);
  if(w.retired)return;
  for(let club=0;club<10;club++)normalizeFirstTeamRoster(s,club);
}
export function advanceStoveLeague(s:GameState){
  prepareOffseason(s);const w=s.proWorld!,stove=w.stove!;
  if(w.stage==="retired")return;
  if(s.careerNotice||s.careerEvent)return;
  if(w.market?.retentionOnly&&!w.market.settled)throw new Error("원소속팀의 마지막 계약 제안 또는 은퇴를 선택해 주세요.");
  if(stove.closed)throw new Error("스토브리그가 마감됐습니다. 최종 계약을 결정한 뒤 2월 캠프로 이동하세요.");
  const before=s.date;s.date=[s.date,stove.nextUpdate].sort().at(-1)!;
  for(const p of s.players)recoverOffseason(p,before,s.date);
  stove.round++;stove.closed=s.date>=stove.closesAt;stove.nextUpdate=[addDays(s.date,7),stove.closesAt].sort()[0];
  if(w.market)w.market.round=stove.round;
  processStoveRound(s);
  if(w.retired)return;
  presentAwardsCeremony(s);
  if(stove.closed&&w.market?.settled)presentFinalStoveReport(s);
}
function presentFinalStoveReport(s:GameState){
  const w=s.proWorld!,p=getPlayer(s);
  if(w.stove?.reported)return;
  const club=p.teamId>=0?p.teamId%10:p.professional!.service.at(-1)?.club??s.postSchool?.pro?.club??0;
  const moves=showStoveReport(s,'final',club);
  const released=moves.find(m=>m.id===p.id&&m.direction==='released'&&m.reason!=='FA');
  if(released&&p.professional!.nonRenewal?.year!==w.year)proNotice(s,`winter-release:${w.year}`,"방출되었습니다",`${clubName(s,released.club)} · ${released.reason}`);
  if(w.stove)w.stove.reported=true;
}
export function settleNPCFreeAgents(s:GameState,year:number){
  const agents=s.players.filter(p=>p.id!==s.playerId&&p.professional?.employment==="freeAgent").sort((a,b)=>contractValue(b,year-1)-contractValue(a,year-1)||a.id.localeCompare(b.id));
  for(const p of agents){const value=contractValue(p,year-1);if(value<43&&!requiresDevelopmentalOffer(p,year-1))continue;
    const clubs=s.proWorld!.clubs.map(c=>({id:c.id,count:clubRoster(s,c.id).filter(q=>q.position===p.position).length})).sort((a,b)=>a.count-b.count||a.id-b.id);
    for(const club of clubs){
      const pending=s.proWorld!.market;
      if(pending&&!pending.settled&&pending.offers.some(offer=>offer.club===club.id))continue;
      const offer=offerFor(s,p,club.id,year,"released");if(!offer)continue;
      signContract(s,p,offer);break;
    }
  }
  delete s.proWorld!.rookieCandidates;
}
function recoverOffseason(p:Player,from:string,to:string){
  const days=Math.max(0,(Date.parse(to)-Date.parse(from))/86400000);p.fatigue=clamp(p.fatigue*Math.max(0,1-params["fatigue.recovery_policy"]*recovery(p.stats.recovery))**days);
  advanceInjuryRecovery(p,to);
  if(p.fatigue<params["fatigue.ready_return"])p.forcedRest=false;
}
export function canEnterNextProCamp(s:GameState){
  const w=s.proWorld,p=getPlayer(s),pro=p.professional,contract=pro?.contract,year=(w?.year??0)+1;
  return !!(s.careerMode==="pro"&&w?.seasonClosed&&!w.pendingRetirement&&!pendingNationalOffseason(s)&&w.stage!=="retired"&&p.teamId>=0&&pro?.employment==="active"&&contract&&contract.startYear<=year&&contract.endYear>=year);
}
export function continueToNextProCamp(s:GameState){
  const w=s.proWorld!;prepareOffseason(s);
  if(w.retired||w.pendingRetirement){delete w.resumeCampAfterAwards;return;}
  while(!s.careerNotice&&!s.careerEvent&&w.stove&&!w.stove.closed)advanceStoveLeague(s);
  if(s.careerNotice||s.careerEvent){w.resumeCampAfterAwards=true;if(s.careerEvent?.nationalContext||s.careerEvent?.proEvent?.nationalKind)w.offseasonContinuation='nextSeason';return;}
  delete w.resumeCampAfterAwards;startNextProSeason(s);
}
export function startNextProSeason(s:GameState,unattached=false){
  const w=s.proWorld!,p=getPlayer(s),year=w.year+1;if(w.stage==="retired")throw new Error("은퇴한 커리어입니다.");
  if(p.injuryRetirement||w.pendingRetirement)throw new Error('시즌 시상을 마친 뒤 은퇴를 마무리해야 합니다.');
  if(!w.seasonClosed)throw new Error("시즌 결산을 먼저 완료해야 합니다.");
  if(w.stove&&!w.stove.closed)throw new Error("스토브리그를 1월 마감까지 진행한 뒤 스프링캠프에 참가할 수 있습니다.");
  if(!unattached&&(!p.professional!.contract||p.professional!.contract!.endYear<year||p.professional!.employment!=="active"))throw new Error("다음 시즌 계약을 먼저 선택해 주세요.");
  if(unattached&&p.professional!.employment==="active")releasePlayer(s,p,"원소속 구단과 계약 종료 후 개인 훈련",year);
  settleNPCFreeAgents(s,year);const oldDate=w.stove?s.date:w.seasons.at(-1)?.endDate??s.date;
  presentFinalStoveReport(s);
  delete w.departedStoveMoves;
  const campDate=[s.date,`${year}-02-01`].sort().at(-1)!;
  for(const q of s.players){const pro=q.professional!;recoverOffseason(q,oldDate,campDate);
    if(pro.agedYear<year){q.age=(q.age??19)+1;applyAging(q,year);}
    q.seasonStats=emptyRecord();q.seasonByLevel={first:emptyRecord(),second:emptyRecord()};q.seasonPostseason=emptyRecord();q.seasonFarmPostseason=emptyRecord();q.seasonSpring=emptyRecord();q.seasonByClub={};q.lastPitched=null;q.recentAppearances=[];q.recentZ=0;
    pro.registration={year,days:0};if(pro.twoWayReview){pro.twoWayReview.qualifiedDays=pro.twoWayReview.belowDays=0;delete pro.twoWayReview.lastDate;}const stint=pro.service.at(-1);if(stint&&pro.employment==="active")stint.to=year;
  }
  for(const club of w.clubs){club.nextReview=campDate;const rank=w.seasons.at(-1)?.standings.findIndex(r=>r.teamId===club.id)??5;club.direction=rank<3?"contend":rank>6?"rebuild":"balanced";}
  s.calendar=developmentCalendar(year,true);s.date=campDate;s.phase="weekStart";s.report=null;s.records=emptyRecord();delete s.weekProgress;delete s.matchProgress;delete s.matchEffect;s.careerEvent=null;delete s.pendingEventOutcome;s.pendingEvents=[];
  for(const team of s.teams){team.wins=0;team.losses=0;team.draws=0;}
  w.year=year;w.stage="camp";w.regularEnd=s.calendar.competitions.find(c=>c.id==="pro-first")!.endDate;w.seasonClosed=false;delete w.postseason;delete w.farmPostseason;delete w.market;
  syncTrainingDiary(p);
  for(let club=0;club<10;club++)normalizeFirstTeamRoster(s,club);
  ensurePlayableFarmRosters(s);
  delete w.monthly;delete w.lastMonthly;delete w.allstar;delete w.stove;
  w.goal=p.proContract?.status==="developmental"?"정식 선수 전환":p.teamId<0?"새 구단 계약":p.teamId>=10?"1군 승격":"1군 정착과 시즌 성과";w.longGoal=(p.age??19)>=33?"몸 관리와 통산 기록":p.professional!.faEligible?"우승과 좋은 계약":"1군 등록 150일씩 8시즌";
  capturePlayerEvaluations(s,"season-start");
  proNotice(s,`camp:${year}`,`${year} 캠프 시작`,`${p.age}세 · ${clubName(s,p.teamId<0?null:p.teamId%10)} · 지난 시즌 기록과 계약을 유지합니다. 노화는 이번 시즌 나이에 따라 한 번 적용했습니다.${unattached?" 무소속 훈련은 성장 60%, 공식 경기와 FA 공헌일은 없습니다.":" 개막 등록은 경쟁·컨디션에 따라 평가합니다."}`);
}
export type ProAction=OffseasonShopAction|{type:"awards"|"national"|"market"|"nextSeason"|"unattached"|"retire"|"wait"}|{type:"accept"|"negotiate";id:string}|{type:"request";kind:"chance"|"position"|"manage"|"trade"|"release";position?:Position}|{type:"goal";goal:string};
export function tradeRequestProgressBlock(s:GameState):string|undefined{
  if(s.careerNotice)return '통보 확인 후 요청 가능';
  if(s.careerEvent||s.pendingEventOutcome)return '선택 결과 확인 후 요청 가능';
  if(s.matchProgress||s.weekProgress?.day&&s.weekProgress.day.phase!=='beforeGames')return '오늘 일정 완료 후 요청 가능';
}
export function actOnProCareer(input:GameState,action:ProAction):GameState{
  const tradeRequest=action.type==='request'&&action.kind==='trade';
  const blocked=tradeRequest?tradeRequestProgressBlock(input):input.careerNotice||input.careerEvent||input.weekProgress||input.matchProgress?'진행 중인 경기·선택·통보를 먼저 마쳐 주세요.':undefined;
  if(blocked)throw new Error(blocked);
  const s=structuredClone(input);ensureProWorld(s);const w=s.proWorld!,p=getPlayer(s);const finish=()=>{syncJerseyNumbers(s);if(["market","negotiate","accept"].includes(action.type))capturePlayerEvaluations(s,"contract",[p.id]);return captureEvaluationChange(s,getPlayer(input));};
  if(w.stage==="retired")throw new Error("은퇴한 커리어입니다.");
  if(w.pendingRetirement&&['market','wait','nextSeason','unattached','retire'].includes(action.type)){
    prepareOffseason(s);return finish();
  }
  if(action.type==='buyOffseasonItems'){
    buyShopItems(s,p,action.items);
    return s;
  }
  if(w.seasonClosed)freezeProNational(s);
  const national=pendingNationalOffseason(s);
  if(action.type==='national'){
    if(!w.seasonClosed)throw new Error('시즌 결산 후 국제대회에 참가할 수 있습니다.');
    delete w.resumeCampAfterAwards;
    if(!national){delete w.offseasonContinuation;return finish();}
    s.proWorld!.offseasonContinuation='national';
    if(national.roster.some(row=>row.id===s.playerId)&&national.participated===undefined){
      s.date=[s.date,national.start].sort().at(-1)!;national.offered=true;
      const legacy=ensureProEvents(s).national[String(national.year)];if(legacy){legacy.offered=true;legacy.settled=false;}
      s.careerEvent=nationalInvitation(s,national);
      recordProChoice(s,s.careerEvent);return finish();
    }
    advanceNationalOffseason(s);
    if(!s.careerEvent&&!pendingNationalOffseason(s))delete s.proWorld!.offseasonContinuation;
    return finish();
  }
  if(national&&['awards','market','wait','nextSeason','unattached','accept','negotiate'].includes(action.type))throw new Error('11월 국제대회를 먼저 마친 뒤 스토브리그를 진행해 주세요.');
  delete w.offseasonContinuation;
  if(action.type==="goal"){if(action.goal)w.customGoal=action.goal;else delete w.customGoal;return finish();}
  if(action.type==="request"){careerRequest(s,action.kind,action.position);return finish();}
  if(!w.seasonClosed)throw new Error("시즌 결산 후 선택할 수 있습니다.");
  if(action.type==='awards'){delete w.resumeCampAfterAwards;presentAwardsCeremony(s,true);return finish();}
  if(action.type==="retire"){
    if(presentAwardsCeremony(s,true)){w.pendingRetirement={year:w.year,reason:"시즌 결산에서 은퇴를 선택했습니다."};return finish();}
    retireProfessional(s);return finish();
  }
  if(action.type==="market"){prepareOffseason(s);return finish();}
  if(action.type==="negotiate"){negotiateOffer(s,action.id);return finish();}
  if(action.type==="wait"){advanceStoveLeague(s);return finish();}
  if(action.type==="accept"){
    const offer=w.market?.offers.find(v=>v.id===action.id);if(!offer||w.market!.settled)throw new Error("유효한 계약 제안이 아닙니다.");
    signContract(s,p,offer);w.market!.settled=true;proNotice(s,`contract:${offer.id}`,"계약을 체결했습니다",`${clubName(s,offer.club)} · ${offer.years}년 · 연봉 ${Math.trunc(offer.salary/10_000).toLocaleString()}만 원. 예상 역할은 계획이며 출전 보장은 아닙니다.`);return finish();
  }
  if(action.type==="unattached"){prepareOffseason(s);if(w.retired||s.careerNotice||s.careerEvent)return finish();if(w.market?.retentionOnly)throw new Error("원소속팀의 마지막 계약 제안 또는 은퇴를 선택해 주세요.");if(w.market?.kind==="renewal"&&p.professional!.employment==="active")throw new Error("FA 전에는 구단 동의 없이 계약을 해제할 수 없습니다.");startNextProSeason(s,true);return finish();}
  if(action.type==="nextSeason"){
    if(!canEnterNextProCamp(s))throw new Error("다음 시즌 계약을 먼저 선택해 주세요.");
    continueToNextProCamp(s);return finish();
  }
  return finish();
}
// A national-team choice interrupts the requested winter action. Resume it
// only after the user has acknowledged that choice's result, retaining the
// intent across every preparation/match/result checkpoint and saved game.
export function resumeOffseasonProgress(s:GameState){
  const action=s.proWorld?.offseasonContinuation??(s.proWorld?.resumeCampAfterAwards?'nextSeason':undefined);
  if(!action||s.careerMode!=='pro'||s.phase!=='ended'||s.proWorld?.stage==='retired'||s.careerNotice||s.careerEvent||s.pendingEventOutcome)return s;
  // Older saves may have interrupted a market/camp request. The international
  // stage now ends before reopening those winter actions.
  if(action==='national'||pendingNationalOffseason(s))return actOnProCareer(s,{type:'national'});
  if(s.proWorld?.offseasonContinuation){const next={...s,proWorld:{...s.proWorld}};delete next.proWorld.offseasonContinuation;delete next.proWorld.resumeCampAfterAwards;return next;}
  return actOnProCareer(s,{type:action});
}
export function advanceUnattachedMonth(input:GameState,advance:(s:GameState)=>GameState){
  let s=input;const month=input.date.slice(0,7);
  for(let i=0;i<5&&s.date.slice(0,7)===month&&s.phase!=="ended";i++){
    const before=getPlayer(s),injuryDate=before.injury?.startDate,forcedRest=before.forcedRest;s=advance(s);const p=getPlayer(s);
    if(s.careerNotice||s.careerEvent||p.injury&&p.injury.startDate!==injuryDate||p.forcedRest&&!forcedRest)break;
  }return s;
}
export function upgradeProfessionalState(input:GameState){
  if(input.careerMode!=="pro"||input.proWorld&&input.proClubNamesVersion===2&&!needsPostseasonUpgrade(input)&&!needsPostseasonRosterUpgrade(input)&&!needsProScheduleUpgrade(input)&&!needsProSquadUpgrade(input)&&!needsContractUpgrade(input)&&!needsAllstarScheduleUpgrade(input)&&!needsNationalInvitationUpgrade(input)&&!needsCareerHonorUpgrade(input)&&!needsNpcFaHistoryUpgrade(input)&&!needsFarmPostseasonDateUpgrade(input))return input;
  const s=structuredClone(input);ensureProWorld(s);upgradeContractRules(s);upgradeNationalInvitation(s);upgradeCareerHonors(s);
  if(getPlayer(input).professional?.employment==="freeAgent"&&getPlayer(s).professional?.employment==="active")openContractMarket(s);
  migrateActivePostseason(s);
  if(expandPostseasonRosters(s)){
    for(const notice of [s.careerNotice,...s.noticeQueue??[]])if(notice?.code===`PRO10:postseason:${s.proWorld!.year}`)Object.assign(notice,regularSeasonFinishNotice(s));
  }
  upgradeProSchedule(s);
  upgradeFarmPostseasonDates(s);
  upgradeAllstarSchedule(s);ensureAllstarSeason(s);
  if(!input.proWorld&&s.phase==="ended"){s.proWorld!.stage="regular";s.phase="weekStart";finishProfessionalDay(s);s.date=addDays(s.date,1);}
  return s;
}

export {needsContractUpgrade} from "./pro-market";
