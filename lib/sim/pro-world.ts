import {hydrateAssessments,recordAssessmentDay} from "./pro-assessment";
import {addDays,available,emptyRecord,getPlayer,hash,isPitcher,lineup,ovr,roleScore,selectionScore} from "./engine";
import {updateEvaluationReputations} from "./evaluation-reputation";
import {initializeProTwoWay} from "./pro-two-way";
import type {GameState,Player,Position} from "./types";
import type {SalaryContract} from "./pro-types";
import {discardRetiredPlayers} from "./retired-records";
import {syncProClubNames} from "./club-names";
import {ensureProSquadTeams,proSquad,reorganizeProSquads,reservePromotionCandidates,setProSquad,squadLabel} from "./pro-squads";

export const BASE_SALARY=50_000_000;
export function contractFor(club:number,year:number,salary:number,years=1,source:SalaryContract["source"]="rookie"):SalaryContract {
  return {id:`${year}:${club}:${salary}:${years}:${source}`,club,startYear:year,endYear:year+years-1,salary,source,segments:[{from:`${year}-01-01`,salary}]};
}
export function proNews(s:GameState,text:string,id=`${s.date}:${text}`) {
  const w=s.proWorld;if(!w||w.news.some(n=>n.id===id))return;
  w.news.push({id,date:s.date,text});if(w.news.length>300)w.news.splice(0,w.news.length-300);
}
export function proNotice(s:GameState,code:string,title:string,message:string,kind:NonNullable<GameState["careerNotice"]>["kind"]="pro") {
  const id=`${s.calendar.seasonYear}:${code}`;
  if(s.careerNotice?.id===id||s.noticeQueue?.some(n=>n.id===id))return;
  const next={id,date:s.date,kind,title,message,code};
  if(s.careerNotice)(s.noticeQueue??=[]).push(next);else s.careerNotice=next;
  proNews(s,`${title} · ${message}`,id);
}
export function initializeProfessional(s:GameState,p:Player,club:number,entry="veteran") {
  if(p.professional){initializeProTwoWay(s,p,true);return;}
  const year=s.calendar.seasonYear,age=p.age??19,rookieYear=entry==="veteran"?year-Math.max(0,age-19):year;
  p.proContract??={status:"regular",joinedDate:`${rookieYear}-03-01`};
  const salary=entry!=="veteran"?(p.proContract.status==="developmental"?.6:1)*BASE_SALARY:(p.teamId<10?2+Math.max(0,ovr(p)-66)*.2:1)*BASE_SALARY;
  p.professional={rookieYear,firstClub:club,entry,employment:club<0?"freeAgent":"active",contract:club<0?null:contractFor(club,year,Math.trunc(salary)),
    agingOffset:hash(`${s.seed}:${p.id}:aging`)%5-2,agedYear:year,faDays:0,faEligible:false,registration:{year,days:0},
    assessments:[],unattachedYears:0,entryReputation:p.reputation??50,proBonus:0,earnings:0,highestSalary:salary,peak:{...p.stats},
    firsts:{},movements:[{date:s.date,from:null,to:club<0?null:club,kind:"입단",reason:entry}],salaries:[],service:club<0?[]:[{club,from:year,to:year}]};
  p.seasonByLevel??={first:emptyRecord(),second:emptyRecord()};p.seasonPostseason??=emptyRecord();p.seasonByClub??={};
  initializeProTwoWay(s,p);
}
export function ensureProWorld(s:GameState) {
  syncProClubNames(s);
  if(s.careerMode!=="pro")return;
  discardRetiredPlayers(s);
  const year=s.calendar.seasonYear,p=getPlayer(s),info=s.postSchool?.pro;
  s.proWorld??={version:1,contractRulesVersion:3,year,stage:s.phase==="ended"?"summary":s.date<`${year}-03-22`?"camp":"regular",regularEnd:s.calendar.competitions.find(c=>c.id==="pro-first")?.endDate??s.calendar.seasonEnd,seasonClosed:false,
    clubs:Array.from({length:10},(_,id)=>({id,direction:"balanced",budget:(220+hash(`${s.seed}:club-budget:${id}`)%81)*BASE_SALARY,deadMoney:{},nextReview:`${year}-03-15`})),
    seasons:[],archive:[],news:[],squadsVersion:s.teams.length>=40?1:undefined,goal:p.proContract?.status==="developmental"?"정식 선수 전환":"1군 정착",longGoal:"1군 데뷔와 꾸준한 출전",draftedYears:[year]};
  const drafted=new Set([...s.draft,...s.postSchool?.collegeDraft??[]].map(pick=>pick.playerId));
  for(const q of s.players){initializeProfessional(s,q,q.teamId<0?-1:q.teamId%10,q.id===p.id?info?.entry??"draft":drafted.has(q.id)?"draft":"veteran");hydrateAssessments(s,q);}
  if(info&&p.professional){p.professional.rookieYear=info.rookieYear;if(info.debutDate)p.professional.firsts.debut??=info.debutDate;}
  ensureProSquadTeams(s);reorganizeProSquads(s);
}
export function clubName(s:GameState,club:number|null) {return club===null||club<0?"무소속":s.teams[club]?.name.replace(/ [12]군$/,"")??`구단 ${club+1}`;}
export function recordProfessionalDay(s:GameState) {
  const w=s.proWorld;if(!w||w.stage==="retired")return;
  const first=s.calendar.competitions.find(c=>c.id==="pro-first");
  for(const p of s.players){const pro=p.professional;if(!pro)continue;
    recordAssessmentDay(s,p);
    if(pro.registration.year!==w.year)pro.registration={year:w.year,days:0};
    if(first&&s.date>=first.startDate&&s.date<=first.endDate&&p.teamId>=0&&p.teamId<10&&pro.employment==="active"&&p.proContract?.status!=="developmental"&&pro.registration.lastDate!==s.date&&pro.registration.days<150){
      pro.registration.days++;pro.registration.lastDate=s.date;pro.faDays++;if(pro.faDays>=900)pro.faEligible=true;
    }
    for(const key of Object.keys(p.stats) as (keyof Player["stats"])[])pro.peak[key]=Math.max(pro.peak[key],p.stats[key]);
  }
  const month=s.date.slice(0,7);if(w.lastMonthly&&w.lastMonthly!==month){
    const p=getPlayer(s);w.monthly={month:w.lastMonthly,text:`${p.name} · ${clubName(s,p.teamId<0?null:p.teamId%10)} · ${p.seasonByLevel?.first.batting.PA??0}타석 / ${Math.floor((p.seasonByLevel?.first.pitching.outs??0)/3)}이닝 · 피로 ${Math.trunc(p.fatigue)}`};
  }w.lastMonthly=month;
}
export function reviewProMilestones(s:GameState){
  const w=s.proWorld;if(!w)return;
  const halfway=s.calendar.events.filter(g=>g.competitionId==="pro-first")[360]?.date;
  if(w.stage==="regular"&&halfway&&s.date>=halfway&&w.midseasonShown!==w.year){w.midseasonShown=w.year;proNotice(s,`midseason:${w.year}`,"시즌 중간 점검","전반기 기록·컨디션과 포지션 경쟁을 확인하세요. 커리어 화면에서 현 역할의 기회, 보직 평가, 몸 관리 또는 이적 검토를 요청할 수 있습니다. 중간 점검 이후에는 트레이드 시장이 닫힙니다.");}
}
function exchange(s:GameState,up:Player,down:Player,reason:string) {
  const club=down.teamId,old=up.teamId;up.teamId=club;down.teamId=old;
  for(const p of [up,down])if(p.professional)p.professional.lastRegistration=s.date;
  proNews(s,`${clubName(s,club)} · ${up.name} 1군 / ${down.name} 2군 · ${reason}`,`${s.date}:registration:${up.id}:${down.id}`);
  if(up.id===s.playerId||down.id===s.playerId){const p=getPlayer(s),info=s.postSchool!.pro!;info.level=p.teamId<10?"first":"second";
    info.transactions.push({date:s.date,from:p.teamId<10?"second":"first",to:info.level,reason,exchangedPlayerId:p.id===up.id?down.id:up.id});
    proNotice(s,`registration:${s.date}:${p.id}`,p.teamId<10?"1군 승격 통보":"2군 조정 통보",`${reason} · ${p.id===up.id?down.name:up.name} 선수와 등록을 교환했습니다.`,p.teamId<10?"promoted":"demoted");
  }
}
export function reviewLeagueRegistrations(s:GameState) {
  const w=s.proWorld;if(!w||!["camp","regular"].includes(w.stage))return false;
  const previous=s.careerNotice?.id;
  const positions:Position[]=["C","1B","2B","3B","SS","LF","CF","RF","DH","SP","RP","CP"];
  for(const club of w.clubs){
    const regular=s.date>=(club.nextReview??`${w.year}-03-15`);if(regular)club.nextReview=addDays(s.date,14);
    for(const pos of positions){
      const first=s.players.filter(p=>p.teamId===club.id&&p.position===pos).sort((a,b)=>selectionScore(a)-selectionScore(b)||a.id.localeCompare(b.id));
      if(!first.length){
        const up=s.players.filter(p=>p.teamId===club.id+10&&p.position===pos&&p.proContract?.status!=="developmental"&&available(p,s.date)).sort((a,b)=>selectionScore(b)-selectionScore(a)||a.id.localeCompare(b.id))[0];
        if(up){const registered=s.players.filter(p=>p.teamId===club.id);if(registered.length>=30){const down=registered.filter(p=>registered.filter(q=>q.position===p.position).length>1).sort((a,b)=>selectionScore(a)-selectionScore(b)||a.id.localeCompare(b.id))[0];if(down)exchange(s,up,down,"은퇴·이적 뒤 비어 있는 포지션을 보충했습니다.");}
          else {up.teamId=club.id;up.professional!.lastRegistration=s.date;proNews(s,`${up.name} · ${clubName(s,club.id)}의 비어 있는 1군 자리를 보충했습니다.`);if(up.id===s.playerId){s.postSchool!.pro!.level="first";proNotice(s,`vacancy:${s.date}`,"1군 승격 통보","구단의 비어 있는 포지션을 보충하기 위해 등록됐습니다.","promoted");}}
        }continue;
      }
      const injured=first.find(p=>!!p.injury&&p.injury.unavailableUntil>=addDays(s.date,14));
      if(!regular&&!injured)continue;
      const down=injured??first.find(p=>!p.forcedRest);if(!down)continue;
      const farm=s.players.filter(p=>p.teamId===club.id+10&&p.position===pos&&p.proContract?.status!=="developmental"&&available(p,s.date)&&(!p.professional?.lastRegistration||s.date>=addDays(p.professional.lastRegistration,14)))
        .sort((a,b)=>selectionScore(b)-selectionScore(a)||a.id.localeCompare(b.id));
      const up=farm[0];if(!up)continue;
      const firstRecord=down.seasonByLevel?.first,b=firstRecord?.batting;
      const established=selectionScore(down)>=79||!!b&&b.PA>=40&&b.AB>0&&b.H/b.AB>=.3;
      const margin=established?8:3;
      if(!injured&&(s.date<addDays(down.professional?.lastRegistration??"1900-01-01",14)||selectionScore(up)<=selectionScore(down)+margin))continue;
      exchange(s,up,down,injured?"장기 부상 회복을 위한 명단 조정입니다.":`같은 포지션의 출전평가 차이를 확인했습니다. 승격 ${selectionScore(up).toFixed(1)} / 조정 ${selectionScore(down).toFixed(1)} · 기존 1군의 성적과 등록 안정성을 함께 반영했습니다.`);
    }
  }
  balanceSquadDepth(s);
  reviewReserveRegistrations(s);
  if(s.postSchool?.pro)s.postSchool.pro.nextReviewDate=w.clubs[s.postSchool.pro.club].nextReview??s.postSchool.pro.nextReviewDate;
  return !!s.careerNotice&&s.careerNotice.id!==previous;
}
export function reviewReserveRegistrations(s:GameState){
  const w=s.proWorld;if(!w||!["camp","regular"].includes(w.stage))return;
  for(const club of w.clubs){
    if(s.date<`${w.year}-03-15`)continue;
    for(const up of reservePromotionCandidates(s,club.id)){
      if(up.professional?.lastRegistration&&s.date<addDays(up.professional.lastRegistration,14))continue;
      const second=s.players.filter(p=>p.teamId===club.id+10),same=second.filter(p=>p.position===up.position&&(!p.professional?.lastRegistration||s.date>=addDays(p.professional.lastRegistration,14))).sort((a,b)=>selectionScore(a)-selectionScore(b)||a.id.localeCompare(b.id));
      const down=same[0];if(second.length>=30&&(!down||selectionScore(up)<=selectionScore(down)+3))continue;
      const from=proSquad(up.teamId)!;setProSquad(s,up,"second");if(down&&second.length>=30)setProSquad(s,down,down.proContract?.status==="developmental"?"developmental":"third");
      proNews(s,`${up.name} · 2군 승격 · 출전평가 ${selectionScore(up).toFixed(1)}`,`${s.date}:reserve:${up.id}`);
      if(up.id===s.playerId||down?.id===s.playerId){const mine=getPlayer(s),to=proSquad(mine.teamId)!;s.postSchool!.pro!.level=to;s.postSchool!.pro!.transactions.push({date:s.date,from:mine.id===up.id?from:"second",to,reason:"출전평가와 잔류군 우선순위를 반영한 2군 등록 심사",exchangedPlayerId:mine.id===up.id?down?.id??"":up.id});proNotice(s,`reserve:${s.date}:${mine.id}`,mine.id===up.id?"2군 승격 통보":"잔류·육성군 조정",`${squadLabel(mine.teamId)}에서 다음 출전 기회를 준비합니다. 같은 평가에서는 잔류군이 육성선수보다 우선합니다.`,mine.id===up.id?"promoted":"demoted");}
    }
  }
}
export function balanceSquadDepth(s:GameState){
  if(!s.proWorld)return;
  const previousTeam=getPlayer(s).teamId;
  const minimum=(pos:Position)=>pos==="C"?2:pos==="SP"?3:pos==="RP"?2:1;
  for(let club=0;club<10;club++)for(const pos of ["C","SS","2B","CF","1B","3B","LF","RF","DH","SP","RP","CP"] as Position[]){
    for(const target of [club,club+10]){
      const source=target===club?club+10:club,needed=minimum(pos);
      while(s.players.filter(p=>p.teamId===target&&p.position===pos&&p.proContract?.status!=="developmental").length<needed){
        const candidates=s.players.filter(p=>p.teamId===source&&p.position===pos&&p.proContract?.status!=="developmental");if(candidates.length<=needed)break;
        const move=[...candidates].sort((a,b)=>target<10?selectionScore(b)-selectionScore(a)||a.id.localeCompare(b.id):selectionScore(a)-selectionScore(b)||a.id.localeCompare(b.id))[0];
        const targets=s.players.filter(p=>p.teamId===target),capacity=30;
        if(targets.length>=capacity){const back=targets.filter(p=>targets.filter(q=>q.position===p.position&&q.proContract?.status!=="developmental").length>minimum(p.position)).sort((a,b)=>selectionScore(a)-selectionScore(b)||a.id.localeCompare(b.id))[0];if(!back)break;move.teamId=target;back.teamId=source;if(back.professional)back.professional.lastRegistration=s.date;}
        else move.teamId=target;
        if(move.professional)move.professional.lastRegistration=s.date;
        proNews(s,`${move.name} · ${target<10?"1군":"2군"}의 포지션 공백과 대체 인력을 보충했습니다.`,`${s.date}:depth:${move.id}:${target}`);
        const mine=getPlayer(s);if(mine.id===move.id){s.postSchool!.pro!.level=target<10?"first":"second";proNotice(s,`depth:${s.date}`,target<10?"1군 등록 조정":"2군 등록 조정","구단의 포지션 공백과 대체 인력을 고려한 명단 조정입니다.",target<10?"promoted":"demoted");}
      }
    }
  }
  const mine=getPlayer(s);if(mine.teamId!==previousTeam&&s.postSchool?.pro){s.postSchool.pro.level=mine.teamId<10?"first":"second";if(!s.careerNotice)proNotice(s,`depth:${s.date}`,"등록 명단을 조정했습니다","포지션 공백과 대체 인력 확보를 위한 명단 조정입니다.",mine.teamId<10?"promoted":"demoted");}
}
export function prepareEvaluationOpportunities(s:GameState,gameIds:string[]){
  if(!s.proWorld||s.proWorld.stage==="postseason")return;
  for(const id of gameIds){const game=s.calendar.events.find(g=>g.id===id)!;if(game.competitionId!=="pro-second"||game.evaluationPlayers)continue;
    game.evaluationPlayers=[];
    for(const team of [game.homeTeamId,game.awayTeamId]){const roster=s.players.filter(p=>p.teamId===team),reserves=reservePromotionCandidates(s,team%10).filter(p=>(!p.professional?.lastEvaluation||s.date>=addDays(p.professional.lastEvaluation,14))&&(!isPitcher(p.primaryRole)||p.fatigue<65&&(!p.lastPitched||s.date>=addDays(p.lastPitched,5))));
      const candidates=[...reserves,...evaluationCandidates(s,roster,s.date)].sort((a,b)=>(a.professional?.lastEvaluation??"1900-01-01").localeCompare(b.professional?.lastEvaluation??"1900-01-01")||selectionScore(b)-selectionScore(a)||Number(a.proContract?.status==="developmental")-Number(b.proContract?.status==="developmental")||a.id.localeCompare(b.id)),positions=new Set<Position>();let batters=0,pitchers=0;
      for(const p of candidates){const pitching=isPitcher(p.primaryRole);if(pitching?pitchers>=1:batters>=2||positions.has(p.position))continue;
        if(pitching)pitchers++;else {batters++;positions.add(p.position);}game.evaluationPlayers.push(p.id);if(p.professional){p.professional.lastEvaluation=s.date;delete p.professional.requestedEvaluationUntil;}
      }
    }
    if(game.evaluationPlayers.includes(s.playerId))proNotice(s,`evaluation:${game.id}`,"2군 평가 출전 기회가 잡혔습니다","최근 출전이 없던 육성 선수를 위한 평가 기회입니다. 실제 수비·투구 자격과 컨디션을 지키며 경기 결과는 그대로 기록합니다.");
  }
}
export function professionalLineup(s:GameState,roster:Player[],date:string,ids:string[]=[]){
  const result=lineup(roster,date);if(!s.proWorld||!ids.length)return result;
  const positions:Position[]=["C","SS","CF","2B","1B","3B","LF","RF","DH"];
  for(const id of ids){const p=roster.find(q=>q.id===id);if(!p||!available(p,date))continue;
    if(isPitcher(p.primaryRole)){if(p.primaryRole==="선발"&&p.fatigue<65&&(!p.lastPitched||date>=addDays(p.lastPitched,5)))result.starter=p;continue;}
    const slot=positions.indexOf(p.position);if(slot<0||!p.eligiblePositions.includes(positions[slot]))continue;
    const previous=result.field.indexOf(p);if(previous>=0){if(previous===slot)continue;const displaced=result.field[slot];if(!displaced?.eligiblePositions.includes(positions[previous]))continue;result.field[previous]=displaced;}
    result.field[slot]=p;
  }
  result.order=[...result.field];return result;
}
export function evaluationCandidates(s:GameState,roster:Player[],date:string) {
  return roster.filter(p=>p.teamId>=10&&p.teamId<20&&p.professional?.employment==="active"&&((p.age??19)<=25||s.calendar.seasonYear-p.professional.rookieYear<3||!!p.professional.requestedEvaluationUntil&&date<=p.professional.requestedEvaluationUntil)&&available(p,date)
    &&(!p.professional.managedUntil||date>p.professional.managedUntil)&&(date>=addDays(p.professional.lastAppearance??`${s.calendar.seasonYear}-03-01`,14)||!!p.professional.requestedEvaluationUntil&&date<=p.professional.requestedEvaluationUntil)
    &&(isPitcher(p.primaryRole)?p.fatigue<65&&(!p.lastPitched||date>=addDays(p.lastPitched,5)):true))
    .sort((a,b)=>(a.professional!.lastAppearance??"1900").localeCompare(b.professional!.lastAppearance??"1900")||roleScore(b)-roleScore(a)||a.id.localeCompare(b.id));
}
export function reviewProfessionalReputation(s:GameState) {
  if(!s.proWorld)return;
  updateEvaluationReputations(s);
}
