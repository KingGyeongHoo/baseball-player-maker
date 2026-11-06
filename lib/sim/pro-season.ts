import {syncJerseyNumbers} from "../jersey-numbers";
import {captureEvaluationChange,capturePlayerEvaluations} from "./evaluation-lifecycle";
import {addDays,available,clamp,draftClubs,draftPlayers,emptyRecord,getPlayer,hash,params,previewPlayer,recovery,reputationScore,roleScore,train} from "./engine";
import {developmentCalendar,careerLeagueTable} from "./pro-calendar";
import {applyAging} from "./pro-growth";
import {regularAwards,contractValue} from "./pro-evaluation";
import {BASE_SALARY,clubName,contractFor,ensureProWorld,initializeProfessional,proNews,proNotice} from "./pro-world";
import {canAfford,canRemove,careerRequest,clubRoster,negotiateOffer,openContractMarket,releasePlayer,renewNPCs,reviewNPCTrades,signContract,trimForRookies,waitForOffers} from "./pro-market";
import {statKeys,type GameState,type Game,type Player,type Position} from "./types";
import type {ProSeries} from "./pro-types";
import {draftAssessment} from "./draft";
import {freezeProNational,tryProNationalInvitation} from "./pro-national-events";

export function archiveProfessionalSeason(s:GameState,p:Player){
  const year=s.calendar.seasonYear;if(p.career.some(r=>r.year===year))return;
  p.career.push({year,grade:p.grade,careerMode:"pro",age:p.age,records:structuredClone(p.seasonStats),stats:{...p.stats},schoolId:p.teamId,
    schoolName:p.teamId<0?"무소속":clubName(s,p.teamId%10),byLevel:structuredClone(p.seasonByLevel!),postseason:structuredClone(p.seasonPostseason??emptyRecord()),byClub:structuredClone(p.seasonByClub??{})});
}
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
  return s.players.filter(p=>p.teamId===club&&p.proContract?.status!=="developmental").slice(0,30).map(p=>p.id);
}
function scheduleSeriesGame(s:GameState,series:ProSeries,date:string){
  const number=series.game++,homeSlots=series.stage==="semi"?[0,0,1,1,0]:[0,0,1,1,1,0,0],homeIndex=homeSlots[(series.wins[0]+series.wins[1])%homeSlots.length],home=series.clubs[homeIndex],away=series.clubs[1-homeIndex];
  const game:Game={id:`${s.calendar.seasonYear}:${series.id}:${number}`,date,homeTeamId:home,awayTeamId:away,competitionId:`pro-playoffs-${series.id}`,round:number+1,rulesetId:"pro-playoffs-v1",status:"scheduled",score:[0,0],innings:[[],[]],lineup:[],boxScore:{}};
  s.calendar.events.push(game);s.calendar.events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));if(date>s.calendar.seasonEnd)s.calendar.seasonEnd=date;series.lastDate=date;
  let competition=s.calendar.competitions.find(c=>c.id===game.competitionId);
  if(!competition){competition={id:game.competitionId,name:series.stage==="semi"?"프로 포스트시즌 준결승":"프로 챔피언십 결승",kind:"league",startDate:date,endDate:date,entryRule:"정식 선수 30명 이하의 고정 시리즈 명단",participantTeamIds:[...series.clubs],initialized:true,round:0,roundDates:[],byes:[],championTeamId:null};s.calendar.competitions.push(competition);}competition.endDate=date;
}
function makeSeries(s:GameState,id:string,stage:ProSeries["stage"],clubs:[number,number],date:string){
  const series:ProSeries={id,stage,clubs,wins:[0,0],target:stage==="semi"?3:4,game:0,lastDate:date,rosters:Object.fromEntries(clubs.map(club=>[String(club),playoffRoster(s,club)])),excluded:[]};
  s.proWorld!.postseason!.series.push(series);scheduleSeriesGame(s,series,date);return series;
}
export function preparePlayoffReplacements(s:GameState){
  const w=s.proWorld;if(w?.stage!=="postseason")return;
  for(const series of w.postseason!.series.filter(v=>v.winner===undefined))for(const club of series.clubs){
    const ids=series.rosters[String(club)];
    for(let i=0;i<ids.length;i++){const old=s.players.find(p=>p.id===ids[i]);if(!old?.injury||s.date>=old.injury.unavailableUntil)continue;
      const replacement=s.players.filter(p=>p.teamId>=0&&p.teamId%10===club&&!ids.includes(p.id)&&!series.excluded.includes(p.id)&&p.proContract?.status!=="developmental"&&p.position===old.position&&available(p,s.date)).sort((a,b)=>roleScore(b)-roleScore(a)||a.id.localeCompare(b.id))[0];
      if(replacement){series.excluded.push(old.id);ids[i]=replacement.id;if(replacement.teamId>=10){const team=old.teamId;old.teamId=replacement.teamId;replacement.teamId=team;}proNews(s,`${clubName(s,club)} · 포스트시즌 부상 대체 ${old.name} → ${replacement.name}`);}
    }
  }
}
export function playoffRosterFor(s:GameState,game:Game,roster:Player[]){
  if(!game.competitionId.startsWith("pro-playoffs-"))return roster;
  const series=s.proWorld?.postseason?.series.find(v=>game.competitionId===`pro-playoffs-${v.id}`);
  return series?roster.filter(p=>series.rosters[String(p.teamId)]?.includes(p.id)):roster;
}
export function finishProfessionalDay(s:GameState){
  ensureProWorld(s);const w=s.proWorld!;
  if(s.phase==="ended")return true;
  if(w.stage==="camp"&&s.date>=s.calendar.competitions.find(c=>c.id==="pro-first")!.startDate)w.stage="regular";
  if(w.stage==="regular"&&s.date>=w.regularEnd){
    for(const id of ["pro-first","pro-second"]){const competition=s.calendar.competitions.find(c=>c.id===id);if(competition)competition.championTeamId=careerLeagueTable(s.calendar,id)[0]?.teamId??null;}
    w.stage="postseason";const seeds=careerLeagueTable(s.calendar,"pro-first").slice(0,4).map(v=>v.teamId);w.postseason={seeds,series:[]};
    const date=addDays(s.date,2);makeSeries(s,"semi-1","semi",[seeds[0],seeds[3]],date);makeSeries(s,"semi-2","semi",[seeds[1],seeds[2]],date);
    const p=getPlayer(s);proNotice(s,`PRO10:postseason:${w.year}`,"정규 시즌 종료·포스트시즌 개막",w.postseason.series.some(series=>Object.values(series.rosters).some(ids=>ids.includes(p.id)))?"상위 4팀 포스트시즌 명단에 등록됐습니다. 정규 기록과 분리해 우승에 도전합니다.":"나의 정규 시즌을 마쳤습니다. 포스트시즌에는 등록되지 않았으며, 다른 선수·구단의 우승 결과도 리그 이력에 보관됩니다.");return false;
  }
  if(w.stage==="postseason"){
    for(const series of w.postseason!.series){if(series.winner!==undefined||series.lastDate!==s.date)continue;
      const game=s.calendar.events.find(g=>g.id===`${w.year}:${series.id}:${series.game-1}`);if(!game||!["completed","forfeit"].includes(game.status))continue;
      const winner=game.status==="forfeit"?(game.forfeitTeamId===game.homeTeamId?game.awayTeamId:game.homeTeamId):game.score[0]===game.score[1]?undefined:game.score[0]>game.score[1]?game.homeTeamId:game.awayTeamId;
      if(winner!==undefined)series.wins[series.clubs.indexOf(winner)]++;
      if(series.wins.some(n=>n>=series.target)){series.winner=series.clubs[series.wins[0]>=series.target?0:1];s.calendar.competitions.find(c=>c.id===game.competitionId)!.championTeamId=series.winner;}
      else scheduleSeriesGame(s,series,addDays(s.date,series.game===2||series.game===5?2:1));
    }
    const semis=w.postseason!.series.filter(v=>v.stage==="semi");
    if(semis.every(v=>v.winner!==undefined)&&!w.postseason!.series.some(v=>v.stage==="final")){
      const seed=(club:number)=>w.postseason!.seeds.indexOf(club),clubs=semis.map(v=>v.winner!).sort((a,b)=>seed(a)-seed(b)) as [number,number];makeSeries(s,"final","final",clubs,addDays(s.date,2));
    }
    const final=w.postseason!.series.find(v=>v.stage==="final");if(final?.winner!==undefined){w.postseason!.champion=final.winner;closeProfessionalSeason(s);return true;}
  }return false;
}
export function closeProfessionalSeason(s:GameState){
  const w=s.proWorld!;if(w.seasonClosed)return;
  w.seasonClosed=true;w.stage="summary";s.phase="ended";
  for(const p of s.players){if(!p.professional)continue;archiveProfessionalSeason(s,p);payroll(s,p);}
  freezeProNational(s);
  for(const p of s.players){if(!p.professional)continue;p.professional.proBonus*=.8;if(p.professional.employment==="freeAgent")p.professional.unattachedYears++;}
  const awards=regularAwards(s);w.seasons.push({year:w.year,endDate:s.date,standings:careerLeagueTable(s.calendar,"pro-first"),farmStandings:careerLeagueTable(s.calendar,"pro-second"),champion:w.postseason?.champion??null,awards,draft:[]});
  const p=getPlayer(s),mine=awards.filter(a=>a.playerId===p.id).map(a=>a.kind).join(" · ");
  proNotice(s,`season:${w.year}`,`${w.year} 프로 시즌 결산`,`${clubName(s,w.postseason?.champion??null)} 우승 · 정규·2군·포스트시즌 기록을 보관했습니다.${mine?` 수상: ${mine}.`:""} 계약과 다음 시즌, 은퇴를 선택할 수 있습니다.`,"seasonComplete");
  if((p.age??19)>=45||p.professional!.unattachedYears>=2)retireProfessional(s,(p.age??19)>=45?"45세 시즌을 마쳐 장기 커리어를 마무리했습니다.":"무소속으로 두 시즌을 마쳐 도전을 마무리했습니다.");
}
const rookieSlots:Position[]=["C","1B","2B","3B","SS","LF","CF","RF","DH","SP","SP","RP","CP"];
export function addRookieClass(s:GameState,year:number){
  const w=s.proWorld!;if(w.draftedYears.includes(year))return;
  const candidates:Player[]=[];
  for(let i=0;i<1000;i++){const p=previewPlayer(`${s.seed}:graduates:${year}:${i}`,"",rookieSlots[i%rookieSlots.length]);p.id=`pro-rookie-${year}-${i}`;p.name=previewPlayer(`${s.seed}:rookie-name:${year}:${i}`,"신인",p.position).name;
    const names=["김","이","박","최","정","강","윤","장"],given=["도윤","서진","우현","준서","민호","현준","시우","지한","정민","재현"];p.name=names[hash(p.id)%names.length]+given[hash(`${p.id}:given`)%given.length];
    p.grade=3;p.teamId=i%100;for(let week=0;week<70;week++)train(p,params["training.days"]);p.reputation=reputationScore(p);candidates.push(p);
  }
  const state={...s,calendar:{...s.calendar,seasonYear:year},players:candidates,teams:Array.from({length:100},(_,id)=>({id,name:`가상고교 ${id+1}`,shortName:`고교 ${id+1}`,wins:0,losses:0,draws:0}))};
  const order=[...(w.seasons.at(-1)?.standings??[])].reverse().map(r=>r.teamId),picks=draftPlayers(state).map(pick=>{const club=order[draftClubs.indexOf(pick.club)]??draftClubs.indexOf(pick.club);return {...pick,club:draftClubs[club],slot:club+1};});
  const selected=new Set(picks.map(p=>p.playerId)),byId=new Map(candidates.map(p=>[p.id,p])),cutoff=Math.min(...picks.map(pick=>draftAssessment(byId.get(pick.playerId)!)));
  const fifth=Object.fromEntries(statKeys.map(key=>[key,[...candidates].sort((a,b)=>b.stats[key]-a.stats[key])[4].stats[key]]));
  w.rookieCandidates=candidates.filter(p=>!selected.has(p.id)&&(draftAssessment(p)>=cutoff-2||statKeys.some(key=>p.stats[key]>=fifth[key]))).sort((a,b)=>draftAssessment(b)-draftAssessment(a)||a.id.localeCompare(b.id)).slice(0,10);
  s.rngStates.draft=state.rngStates.draft;
  for(let club=0;club<10;club++)trimForRookies(s,club,picks.filter(p=>p.club===draftClubs[club]).length+1,year);
  for(const pick of picks){const p=candidates.find(p=>p.id===pick.playerId)!,club=draftClubs.indexOf(pick.club);p.grade=0;p.age=19;p.teamId=club+10;p.careerMode="pro";p.seasonStats=emptyRecord();p.recentAppearances=[];
    initializeProfessional(s,p,club,"draft");p.professional!.rookieYear=year;p.professional!.agedYear=year;p.professional!.contract=contractFor(club,year,BASE_SALARY);p.professional!.service=[{club,from:year,to:year}];s.players.push(p);
  }
  w.draftedYears.push(year);if(w.seasons.at(-1))w.seasons.at(-1)!.draft=picks;
  proNews(s,`${year} 신인 드래프트 · ${picks.length}명 · 직전 정규 시즌 하위 구단 우선`,`${year}:rookie-class`);
}
function retireNPC(s:GameState,p:Player,reason:string){
  p.professional!.employment="retired";p.professional!.contract=null;p.teamId=-1;
  if(!s.proWorld!.archive.some(q=>q.id===p.id))s.proWorld!.archive.push(p);
  proNews(s,`${p.name} 은퇴 · ${reason}`,`retirement:${p.id}`);
}
export function prepareOffseason(s:GameState){
  capturePlayerEvaluations(s,"season-end");
  const w=s.proWorld!,year=w.year+1;if(w.market?.year===year)return;
  s.date=`${w.year}-11-01`;
  for(const club of w.clubs){const rank=w.seasons.at(-1)?.standings.findIndex(r=>r.teamId===club.id)??5;club.direction=rank<3?"contend":rank>6?"rebuild":"balanced";}
  for(const p of [...s.players])if(p.id!==s.playerId&&p.professional&&canRemove(s,p)&&((p.age??19)>=42||(p.age??19)>=37&&contractValue(p,w.year)<44||p.professional.unattachedYears>=2))retireNPC(s,p,"나이·최근 실적과 다음 계약을 고려했습니다.");
  s.players=s.players.filter(p=>p.professional?.employment!=="retired");addRookieClass(s,year);renewNPCs(s,year);reviewNPCTrades(s);openContractMarket(s);
}
export function settleNPCFreeAgents(s:GameState,year:number){
  const agents=s.players.filter(p=>p.id!==s.playerId&&p.professional?.employment==="freeAgent").sort((a,b)=>contractValue(b,year-1)-contractValue(a,year-1)||a.id.localeCompare(b.id));
  for(const p of agents){const value=contractValue(p,year-1);if(value<43)continue;
    const clubs=s.proWorld!.clubs.map(c=>({id:c.id,count:clubRoster(s,c.id).filter(q=>q.position===p.position).length})).sort((a,b)=>a.count-b.count||a.id-b.id);
    for(const club of clubs){const salary=p.proContract?.status==="developmental"?.6*BASE_SALARY:BASE_SALARY*Math.max(1,(value-40)/10);
      if(clubRoster(s,club.id).length>=74||clubRoster(s,club.id).filter(q=>q.teamId>=10).length>=44||!canAfford(s,club.id,salary,year))continue;
      signContract(s,p,{id:`${year}:npc-market:${p.id}:${club.id}`,club:club.id,year,years:1,salary,role:"부족 포지션 보강",kind:"released",negotiated:false,final:true,competition:[]});break;
    }
  }
  for(const p of s.proWorld!.rookieCandidates??[]){
    const clubs=s.proWorld!.clubs.map(c=>({id:c.id,count:clubRoster(s,c.id).filter(q=>q.position===p.position).length})).sort((a,b)=>a.count-b.count||a.id-b.id);
    const club=clubs.find(c=>clubRoster(s,c.id).length<75&&clubRoster(s,c.id).filter(q=>q.teamId>=10).length<45&&canAfford(s,c.id,.6*BASE_SALARY,year));if(!club)continue;
    p.teamId=club.id+10;p.grade=0;p.age=19;p.careerMode="pro";p.proContract={status:"developmental",joinedDate:`${year}-03-01`};initializeProfessional(s,p,club.id,"developmental");p.professional!.rookieYear=year;p.professional!.agedYear=year;p.professional!.contract=contractFor(club.id,year,.6*BASE_SALARY);s.players.push(p);proNews(s,`${p.name} · ${clubName(s,club.id)} 신고선수 입단`,`${year}:npc-developmental:${p.id}`);
  }delete s.proWorld!.rookieCandidates;
}
function recoverOffseason(p:Player,from:string,to:string){
  const days=Math.max(0,(Date.parse(to)-Date.parse(from))/86400000);p.fatigue=clamp(p.fatigue*Math.max(0,1-params["fatigue.recovery_policy"]*recovery(p.stats.recovery))**days);
  if(p.injury&&to>=p.injury.unavailableUntil){const recovered=(Date.parse(to)-Date.parse(p.injury.unavailableUntil))/86400000;p.injury.penaltyRemaining=Math.max(0,p.injury.originalPenalty*(1-recovered/Math.max(1,p.injury.penaltyRecoverDays)));if(!p.injury.penaltyRemaining)p.injury=null;}
  if(p.fatigue<params["fatigue.ready_return"])p.forcedRest=false;
}
export function startNextProSeason(s:GameState,unattached=false){
  const w=s.proWorld!,p=getPlayer(s),year=w.year+1;if(w.stage==="retired")throw new Error("은퇴한 커리어입니다.");
  if(!w.seasonClosed)throw new Error("시즌 결산을 먼저 완료해야 합니다.");
  if(!unattached&&(!p.professional!.contract||p.professional!.contract!.endYear<year||p.professional!.employment!=="active"))throw new Error("다음 시즌 계약을 먼저 선택해 주세요.");
  if(unattached&&p.professional!.employment==="active")releasePlayer(s,p,"원소속 구단과 계약 종료 후 개인 훈련",year);
  settleNPCFreeAgents(s,year);const oldDate=w.seasons.at(-1)?.endDate??s.date;
  for(const q of s.players){const pro=q.professional!;recoverOffseason(q,oldDate,`${year}-03-01`);
    if(pro.agedYear<year){q.age=(q.age??19)+1;applyAging(q,year);}
    q.seasonStats=emptyRecord();q.seasonByLevel={first:emptyRecord(),second:emptyRecord()};q.seasonPostseason=emptyRecord();q.seasonByClub={};q.lastPitched=null;q.recentAppearances=[];q.recentZ=0;
    pro.registration={year,days:0};if(pro.twoWayReview){pro.twoWayReview.qualifiedDays=pro.twoWayReview.belowDays=0;delete pro.twoWayReview.lastDate;}const stint=pro.service.at(-1);if(stint&&pro.employment==="active")stint.to=year;
  }
  for(const club of w.clubs){club.nextReview=`${year}-03-01`;const rank=w.seasons.at(-1)?.standings.findIndex(r=>r.teamId===club.id)??5;club.direction=rank<3?"contend":rank>6?"rebuild":"balanced";}
  s.calendar=developmentCalendar(year,true);s.date=`${year}-03-01`;s.phase="weekStart";s.report=null;s.records=emptyRecord();delete s.weekProgress;delete s.matchProgress;delete s.matchEffect;s.careerEvent=null;delete s.pendingEventOutcome;s.pendingEvents=[];
  for(const team of s.teams){team.wins=0;team.losses=0;team.draws=0;}
  w.year=year;w.stage="camp";w.regularEnd=s.calendar.competitions.find(c=>c.id==="pro-first")!.endDate;w.seasonClosed=false;delete w.postseason;delete w.market;
  delete w.monthly;delete w.lastMonthly;
  w.goal=p.proContract?.status==="developmental"?"정식 선수 전환":p.teamId<0?"새 구단 계약":p.teamId>=10?"1군 승격":"1군 정착과 시즌 성과";w.longGoal=(p.age??19)>=33?"몸 관리와 통산 기록":p.professional!.faEligible?"우승과 좋은 계약":"FA 공헌일 900일";
  capturePlayerEvaluations(s,"season-start");
  proNotice(s,`camp:${year}`,`${year} 캠프 시작`,`${p.age}세 · ${clubName(s,p.teamId<0?null:p.teamId%10)} · 지난 시즌 기록과 계약을 유지합니다. 노화는 이번 시즌 나이에 따라 한 번 적용했습니다.${unattached?" 무소속 훈련은 성장 60%, 공식 경기와 FA 공헌일은 없습니다.":" 개막 등록은 경쟁·컨디션에 따라 평가합니다."}`);
}
export function retireProfessional(s:GameState,reason="시즌 결산에서 은퇴를 선택했습니다."){
  const w=s.proWorld!,p=getPlayer(s),pro=p.professional!;if(w.retired)return;
  archiveProfessionalSeason(s,p);const contract=pro.contract,forfeited=contract?Math.max(0,contract.endYear-w.year)*contract.salary:0;
  pro.employment="retired";pro.contract=null;p.teamId=-1;w.stage="retired";s.phase="ended";
  const proYears=p.career.filter(row=>row.careerMode==="pro").length,clubs=new Set(pro.service.map(v=>v.club)).size;
  w.retired={date:s.date,reason,forfeited,summary:`${pro.entry==="developmental"?"신고선수":"지명 선수"}로 시작해 프로 ${proYears}시즌, ${clubs}개 구단의 기록을 남겼습니다.${p.proContract?.convertedDate?` ${p.proContract.convertedDate} 정식 전환을 이뤘습니다.`:""}${pro.firsts.debut?` 첫 1군 출전은 ${pro.firsts.debut}입니다.`:" 1군 정착을 향한 도전도 커리어에 남습니다."}`};
  proNotice(s,`retirement:${w.year}`,"나의 야구 커리어를 보관했습니다",reason+" 기록과 주요 사건을 확인한 뒤 새 선수를 만들 수 있습니다.");
}
export type ProAction={type:"market"|"nextSeason"|"unattached"|"retire"|"wait"}|{type:"accept"|"negotiate";id:string}|{type:"request";kind:"chance"|"position"|"manage"|"trade"|"release";position?:Position}|{type:"goal";goal:string};
export function actOnProCareer(input:GameState,action:ProAction):GameState{
  if(input.careerNotice||input.careerEvent||input.weekProgress||input.matchProgress)throw new Error("진행 중인 경기·선택·통보를 먼저 마쳐 주세요.");
  const s=structuredClone(input);ensureProWorld(s);const w=s.proWorld!,p=getPlayer(s);const finish=()=>{syncJerseyNumbers(s);if(["market","negotiate","accept"].includes(action.type))capturePlayerEvaluations(s,"contract",[p.id]);return captureEvaluationChange(s,getPlayer(input));};
  if(w.stage==="retired")throw new Error("은퇴한 커리어입니다.");
  if(tryProNationalInvitation(s))return finish();
  if(action.type==="goal"){if(action.goal)w.customGoal=action.goal;else delete w.customGoal;return finish();}
  if(action.type==="request"){careerRequest(s,action.kind,action.position);return finish();}
  if(!w.seasonClosed)throw new Error("시즌 결산 후 선택할 수 있습니다.");
  if(action.type==="retire"){retireProfessional(s);return finish();}
  if(action.type==="market"){prepareOffseason(s);return finish();}
  if(action.type==="negotiate"){negotiateOffer(s,action.id);return finish();}
  if(action.type==="wait"){waitForOffers(s);return finish();}
  if(action.type==="accept"){
    const offer=w.market?.offers.find(v=>v.id===action.id);if(!offer||w.market!.settled)throw new Error("유효한 계약 제안이 아닙니다.");
    signContract(s,p,offer);w.market!.settled=true;proNotice(s,`contract:${offer.id}`,"계약을 체결했습니다",`${clubName(s,offer.club)} · ${offer.years}년 · 연봉 ${Math.trunc(offer.salary/10_000).toLocaleString()}만 원. 예상 역할은 계획이며 출전 보장은 아닙니다.`);return finish();
  }
  if(action.type==="unattached"){if(w.market?.kind==="renewal"&&p.professional!.employment==="active")throw new Error("FA 전에는 구단 동의 없이 계약을 해제할 수 없습니다.");startNextProSeason(s,true);return finish();}
  if(action.type==="nextSeason"){if(!w.market)prepareOffseason(s);if(!s.careerNotice)startNextProSeason(s);return finish();}
  return finish();
}
export function advanceUnattachedMonth(input:GameState,advance:(s:GameState)=>GameState){
  let s=input;const month=input.date.slice(0,7);
  for(let i=0;i<5&&s.date.slice(0,7)===month&&s.phase!=="ended";i++){
    const before=getPlayer(s);s=advance(s);const p=getPlayer(s);
    if(s.careerNotice||s.careerEvent||p.injury&&p.injury.startDate!==before.injury?.startDate||p.forcedRest&&!before.forcedRest)break;
  }return s;
}
export function upgradeProfessionalState(input:GameState){
  if(input.careerMode!=="pro"||input.proWorld)return input;
  const s=structuredClone(input);ensureProWorld(s);
  if(s.phase==="ended"){s.proWorld!.stage="regular";s.phase="weekStart";finishProfessionalDay(s);s.date=addDays(s.date,1);}
  return s;
}
