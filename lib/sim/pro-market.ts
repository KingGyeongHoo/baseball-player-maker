import {assessmentValue,hydrateAssessments,requiresDevelopmentalOffer,salaryUnits,seasonExit} from "./pro-assessment";
import {proContractRules as rules} from "./pro-contract-rules";
import {addDays,assignRole,getPlayer,hash,ovr,roleScore} from "./engine";
import {contractValue} from "./pro-evaluation";
import {BASE_SALARY,clubName,contractFor,proNews,proNotice} from "./pro-world";
import type {GameState,Player,Position} from "./types";
import type {ContractOffer} from "./pro-types";
import {focusProRole} from "./pro-two-way";
import {beginProRoleTrial} from "./pro-role-evaluation";
import {retireProfessional} from "./pro-retirement";

export function salaryQuote(p:Player,year:number) {
  if(p.proContract?.status==="developmental")return .6*BASE_SALARY;
  const units=salaryUnits(assessmentValue(p,year).score);
  return Math.trunc(units*BASE_SALARY/100_000)*100_000;
}
export function clubInterest(s:GameState,p:Player,club:number,year:number){
  const direction=s.proWorld!.clubs[club].direction,age=p.age??19;
  return contractValue(p,year)+(direction==="rebuild"?Math.max(-8,Math.min(8,27-age)):direction==="contend"?(roleScore(p)-60)*.15-Math.max(0,age-36):0);
}
export function clubCost(s:GameState,club:number,year:number,exclude:string[]=[]){
  return (s.proWorld?.clubs[club]?.deadMoney[String(year)]??0)+s.players.filter(p=>!exclude.includes(p.id)&&p.professional?.employment==="active"&&p.professional.contract?.club===club&&p.professional.contract.startYear<=year&&p.professional.contract.endYear>=year)
    .reduce((sum,p)=>sum+p.professional!.contract!.salary,0);
}
function planningReserve(s:GameState,club:number,year:number,exclude:string[]){
  if(year<=s.proWorld!.year)return 0;
  const minimum:Partial<Record<Position,number>>={C:4,SP:8,RP:6,CP:3,DH:2,"1B":3,"2B":3,"3B":3,SS:3,LF:3,CF:3,RF:3};
  const signed=clubRoster(s,club).filter(p=>!exclude.includes(p.id)&&p.proContract?.status!=="developmental"&&p.professional!.contract&&p.professional!.contract!.startYear<=year&&p.professional!.contract!.endYear>=year);
  const candidate=exclude.length===1?s.players.find(p=>p.id===exclude[0]):undefined;
  if(candidate&&candidate.proContract?.status!=="developmental")signed.push(candidate);
  const crew=Object.entries(minimum).reduce((sum,[pos,n])=>sum+Math.max(0,n-signed.filter(p=>p.position===pos).length)*BASE_SALARY,0);
  const mine=getPlayer(s),contract=mine.professional?.contract;
  const player=mine.professional?.employment==="active"&&contract?.club===club&&contract.endYear<year&&!exclude.includes(mine.id)?salaryQuote(mine,s.proWorld!.year)*1.08:0;
  return Math.max(s.proWorld!.draftedYears.includes(year)?0:13*BASE_SALARY,crew)+player;
}
export function canAfford(s:GameState,club:number,salary:number,year:number,years=1,exclude:string[]=[]){
  const budget=s.proWorld!.clubs[club].budget;
  return Array.from({length:years},(_,i)=>year+i).every(y=>clubCost(s,club,y,exclude)+salary+planningReserve(s,club,y,exclude)<=budget+1);
}
export function clubRoster(s:GameState,club:number){return s.players.filter(p=>p.teamId>=0&&p.teamId%10===club&&p.professional?.employment==="active");}
// Incoming players can use a free first-team slot even when the lower squads
// are full. Offers are read-only; recheck capacity again when signing.
export function contractDestination(s:GameState,p:Player,club:number,developmental=p.proContract?.status==="developmental",exclude:string[]=[]):number|null {
  const members=clubRoster(s,club).filter(q=>q.id!==p.id&&!exclude.includes(q.id));
  if(members.length>=75)return null;
  const first=members.filter(q=>q.teamId===club).length,lower=members.filter(q=>q.teamId>=10).length;
  if(p.teamId>=0&&p.teamId%10===club){if(p.teamId===club&&!developmental&&first<29)return club;if(p.teamId>=10&&lower<45)return developmental?club+30:p.teamId;}
  if(lower<45)return developmental?club+30:members.filter(q=>q.teamId===club+10).length<30?club+10:club+20;
  return !developmental&&first<29?club:null;
}
export function canRemove(s:GameState,p:Player){
  if(p.teamId<0)return true;const same=clubRoster(s,p.teamId%10).filter(q=>q.position===p.position);
  const minimum=p.position==="C"?4:p.position==="SP"?8:p.position==="RP"?6:p.position==="CP"?3:p.position==="DH"?2:3;
  return same.length>minimum&&(p.proContract?.status==="developmental"||same.filter(q=>q.id!==p.id&&q.proContract?.status!=="developmental").length>=minimum);
}
export function releasePlayer(s:GameState,p:Player,reason:string,year:number){
  const pro=p.professional;if(!pro||pro.employment!=="active")return;
  const old=pro.contract,club=old?.club??p.teamId%10;
  if(old&&old.endYear>=year)for(let y=year;y<=old.endYear;y++){const debt=s.proWorld!.clubs[club].deadMoney;s.proWorld!.clubs[club].deadMoney[String(y)]=(debt[String(y)]??0)+old.salary;(pro.guarantees??=[]).push({year:y,club,amount:old.salary});}
  pro.movements.push({date:s.date,from:club,to:null,kind:"방출",reason});pro.contract=null;pro.employment="freeAgent";p.teamId=-1;
  const stint=pro.service.at(-1);if(stint)stint.to=s.calendar.seasonYear;
  proNews(s,`${p.name} · ${clubName(s,club)} 계약 종료 · ${reason}`,`${year}:release:${p.id}`);
}
export function signContract(s:GameState,p:Player,offer:ContractOffer){
  const pro=p.professional!;
  if(offer.lastChance&&(offer.kind!=="fa"||offer.club!==pro.contract?.club||offer.years!==1||offer.salary!==BASE_SALARY||offer.registration))throw new Error("원소속팀의 마지막 제안은 1년 최저 연봉 계약입니다.");
  if(requiresDevelopmentalOffer(p,offer.year-1)&&(offer.registration!=="developmental"||offer.club===pro.nonRenewal?.club||offer.years!==1))throw new Error("정식 재계약 불가 판정으로 다른 구단의 1년 신고 계약만 검토할 수 있습니다.");
  if(offer.registration==="developmental"){
    if(offer.years!==1||offer.salary!==rules.developmentalRatio*BASE_SALARY)throw new Error("신고 재영입은 1년 기본 신고 연봉으로 계약합니다.");
  }
  if(!canAfford(s,offer.club,offer.salary,offer.year,offer.years,[p.id]))throw new Error("구단의 미래 보장액을 포함한 예산을 초과합니다.");
  const destination=contractDestination(s,p,offer.club,offer.registration==="developmental"||p.proContract?.status==="developmental");
  if(destination===null)throw new Error("구단 선수단 정원이 가득 찼습니다. 다음 스토브리그 제안을 확인해 주세요.");
  if(offer.registration==="developmental"){
    p.proContract={status:"developmental",joinedDate:`${offer.year}-03-01`};
    pro.developmentalRetry={year:offer.year,deadlineYear:offer.year,club:offer.club};
  }
  const old=pro.employment==="active"?pro.contract?.club??p.teamId%10:null;
  if(old!==offer.club){
    const stint=pro.service.at(-1);if(stint)stint.to=s.calendar.seasonYear;
    pro.service.push({club:offer.club,from:offer.year,to:offer.year});
    pro.movements.push({date:s.date,from:old,to:offer.club,kind:offer.kind==="fa"?"FA 이적":"계약",reason:offer.role});p.teamId=destination;
  }else {
    p.teamId=destination;
    if(offer.kind==="fa")pro.movements.push({date:s.date,from:old,to:offer.club,kind:"FA 잔류",reason:offer.role});
  }
  pro.contract=contractFor(offer.club,offer.year,offer.salary,offer.years,offer.kind);pro.employment="active";pro.unattachedYears=0;pro.highestSalary=Math.max(pro.highestSalary,offer.salary);
  if(s.proWorld?.stove&&!s.proWorld.stove.closed&&!s.proWorld.stove.movedIds.includes(p.id))s.proWorld.stove.movedIds.push(p.id);
  if(p.id===s.playerId&&s.postSchool?.pro){s.postSchool.pro.club=offer.club;s.postSchool.pro.level=p.teamId<10?"first":p.teamId<20?"second":p.teamId<30?"third":"developmental";}
  proNews(s,`${p.name} · ${clubName(s,offer.club)} ${offer.years}년 계약`,`${offer.id}:signed`);
}
export function offerFor(s:GameState,p:Player,club:number,year:number,kind:ContractOffer["kind"]):ContractOffer|null{
  const pro=p.professional!,members=clubRoster(s,club).filter(q=>q.id!==p.id);
  if(contractDestination(s,p,club,requiresDevelopmentalOffer(p,year-1)||p.proContract?.status==="developmental")===null)return null;
  const assessment=assessmentValue(p,year-1),value=assessment.score,own=pro.contract?.club===club&&pro.employment==="active",trial=requiresDevelopmentalOffer(p,year-1);
  const peers=members.filter(q=>q.position===p.position&&q.proContract?.status!=="developmental");
  const minimum=p.position==="C"?4:p.position==="SP"?8:p.position==="RP"?6:p.position==="CP"?3:p.position==="DH"?2:3;
  const need=peers.length<minimum,rows=pro.assessments??[],last=rows.at(-1),previous=rows.at(-2),growing=!!last&&!!previous&&last.ability-previous.ability>=rules.growthGrace;
  if(trial){
    if(club===pro.nonRenewal?.club||(p.age??19)>rules.reentryMaxAge||roleScore(p)<rules.reentryMinAbility)return null;
    const chance=rules.reentryChance+((p.age??19)<=rules.youngAge?rules.youngBonus:0)+(growing?rules.growthBonus:0)+(need?rules.needBonus:0);
    if(hash(`${s.seed}:reentry:${year}:${p.id}:${club}`)%100>=chance)return null;
  }else if(!own){
    const veteran=kind==="fa"&&(p.age??19)>=rules.veteranAge;
    const minimumInterest=veteran?rules.veteranFaInterest+Math.min(rules.veteranFaMaxPenalty,((p.age??19)-rules.veteranAge)*rules.veteranFaAgePenalty):40;
    if(clubInterest(s,p,club,year-1)<minimumInterest)return null;
  }
  const salary=trial?rules.developmentalRatio*BASE_SALARY:salaryQuote(p,year-1),years=trial?1:kind==="fa"?Math.min((p.age??19)>=38?2:4,value>=rules.multiYearScore?2+hash(`${year}:${p.id}:${club}`)%3:1):1;
  let duration=years;while(duration>1&&!canAfford(s,club,salary,year,duration,[p.id]))duration--;
  if(!canAfford(s,club,salary,year,duration,[p.id]))return null;
  const competitors=members.filter(q=>q.position===p.position).sort((a,b)=>roleScore(b)-roleScore(a));
  const role=roleScore(p)>Math.max(0,...competitors.map(q=>roleScore(q)))?"주전 경쟁 우선 검토":roleScore(p)>55?"1·2군 등록 경쟁":"2군 육성·평가 출전";
  return {id:`${year}:offer:${p.id}:${club}`,club,year,years:duration,salary,role:trial?"신고선수 1년 재도전 · 정식 전환 실패 시 방출":role,kind,...(kind==="fa"?{faRetention:own}:{}),negotiated:false,final:false,competition:competitors.slice(0,3).map(q=>q.name),assessment,...(trial?{registration:"developmental" as const}:{})};
}
export function openContractMarket(s:GameState){
  const w=s.proWorld!,p=getPlayer(s),pro=p.professional!,year=w.year+1;
  if(w.market?.year===year)return;
  if(pro.contract&&pro.contract.endYear>=year){w.market={year,kind:"renewal",round:0,offers:[],settled:true};return;}
  const kind=pro.employment!=="active"?"released":pro.faEligible?"fa":"renewal";
  w.market={year,kind,round:0,offers:[],settled:false};w.stage="offseason";refreshOffers(s);
}
function lastChanceOffer(s:GameState,p:Player,club:number,year:number):ContractOffer|null{
  if(p.proContract?.status==="developmental"||requiresDevelopmentalOffer(p,year-1)||roleScore(p)<rules.lastChanceMinAbility||clubInterest(s,p,club,year-1)<rules.lastChanceMinInterest)return null;
  if(contractDestination(s,p,club,false)===null||!canAfford(s,club,BASE_SALARY,year,1,[p.id]))return null;
  return {id:`${year}:last-chance:${p.id}:${club}`,club,year,years:1,salary:BASE_SALARY,role:"원소속팀 1년 최저 연봉 계약",kind:"fa",faRetention:true,lastChance:true,negotiated:false,final:true,competition:[],assessment:assessmentValue(p,year-1)};
}
export function refreshOffers(s:GameState){
  const w=s.proWorld!,market=w.market!,p=getPlayer(s),pro=p.professional!;
  if(market.settled||w.stage==="retired")return;
  const own=pro.contract?.club??null;
  if(market.retentionOnly){
    const offer=own===null?null:lastChanceOffer(s,p,own,market.year);
    market.offers=offer?[offer]:[];
    if(!offer)retireProfessional(s,"FA 시장과 원소속팀에서 계약 제안을 받지 못해 은퇴했습니다.");
    return;
  }
  const clubs=market.kind==="renewal"&&own!==null?[own]:w.clubs.map(c=>c.id).sort((a,b)=>{
    const need=(club:number)=>{const same=clubRoster(s,club).filter(q=>q.position===p.position);return 100-Math.max(0,...same.map(q=>roleScore(q)))+(own===club?3:0)+clubInterest(s,p,club,market.year-1)*.2;};return need(b)-need(a)||a-b;
  });
  const offers=clubs.flatMap(club=>{const offer=offerFor(s,p,club,market.year,market.kind);return offer?[{...offer,id:`${offer.id}:${market.round}`}]:[];});
  if(market.kind==="fa"&&(p.age??19)>=rules.veteranAge&&!offers.some(offer=>!offer.faRetention)){
    market.retentionOnly=true;
    const offer=own===null?null:lastChanceOffer(s,p,own,market.year);
    market.offers=offer?[offer]:[];
    if(!offer)retireProfessional(s,"FA 시장과 원소속팀에서 계약 제안을 받지 못해 은퇴했습니다.");
    return;
  }
  const retention=market.kind==="fa"?offers.find(offer=>offer.faRetention):undefined;
  market.offers=(retention?[retention,...offers.filter(offer=>offer.club!==retention.club)]:offers).slice(0,3);
  if(!market.offers.length&&market.kind==="renewal"){
    releasePlayer(s,p,"구단 수요·예산과 계약 평가를 반영했습니다.",market.year);market.kind="released";refreshOffers(s);
  }
}
export function negotiateOffer(s:GameState,id:string){
  const market=s.proWorld!.market!,offer=market.offers.find(o=>o.id===id);if(!offer||market.settled||offer.negotiated)throw new Error("이 제안의 재협상 기회는 이미 사용했습니다.");
  if(offer.lastChance)throw new Error("원소속팀의 마지막 제안은 재협상할 수 없습니다. 잔류 또는 은퇴를 선택해 주세요.");
  const p=getPlayer(s);offer.negotiated=true;offer.final=true;
  const raise=Math.trunc(offer.salary*1.08/100_000)*100_000;
  if(offer.registration!=="developmental"&&assessmentValue(p,s.proWorld!.year).score>=rules.negotiationScore&&canAfford(s,offer.club,raise,offer.year,offer.years,[p.id]))offer.salary=raise;
  proNotice(s,`negotiation:${id}`,"최종 계약 조건이 도착했습니다","화면의 최종 연봉·기간을 확인한 뒤 수락하거나 다른 진로를 선택하세요. 같은 제안의 재협상은 한 번입니다.");
}
export function renewNPCs(s:GameState,year:number,stoveRound?:number){
  const list=s.players.filter(p=>p.id!==s.playerId&&p.professional?.employment==="active").sort((a,b)=>contractValue(b,year-1)-contractValue(a,year-1)||a.id.localeCompare(b.id));
  const protectedIds=new Set(list.filter(p=>!canRemove(s,p)).map(p=>p.id));list.sort((a,b)=>Number(protectedIds.has(b.id))-Number(protectedIds.has(a.id))||contractValue(b,year-1)-contractValue(a,year-1)||a.id.localeCompare(b.id));
  for(const p of list){const pro=p.professional!,contract=pro.contract;if(contract&&contract.endYear>=year)continue;
    if(stoveRound!==undefined&&hash(`${s.seed}:renewal:${year}:${p.id}`)%9>stoveRound)continue;
    const club=contract?.club??p.teamId%10,salary=salaryQuote(p,year-1),value=contractValue(p,year-1);
    if(pro.faEligible&&canRemove(s,p)){
      const alternatives=s.proWorld!.clubs.filter(c=>c.id!==club&&clubInterest(s,p,c.id,year-1)>clubInterest(s,p,club,year-1)+2).sort((a,b)=>clubInterest(s,p,b.id,year-1)-clubInterest(s,p,a.id,year-1)||a.id-b.id);
      const offer=alternatives.flatMap(c=>{const candidate=offerFor(s,p,c.id,year,"fa");return candidate?[candidate]:[];})[0];
      if(offer){signContract(s,p,offer);continue;}
    }
    if(canRemove(s,p)&&((value<40&&(p.age??19)>25&&!p.injury)||!canAfford(s,club,salary,year,1,[p.id]))){releasePlayer(s,p,"시즌 실적·성장·나이·예산을 반영한 비시즌 평가",year);continue;}
    const affordable=Math.max(p.proContract?.status==="developmental"?.6*BASE_SALARY:BASE_SALARY,Math.min(salary,s.proWorld!.clubs[club].budget-clubCost(s,club,year,[p.id])-planningReserve(s,club,year,[p.id])));
    if(canAfford(s,club,affordable,year,1,[p.id]))pro.contract=contractFor(club,year,affordable,1,"renewal");
    else if(canRemove(s,p))releasePlayer(s,p,"구단 예산 조정",year);
  }
}
export function reviewNPCTrades(s:GameState,stoveRound?:number){
  const used=new Set<number>();
  for(const club of s.proWorld!.clubs){if(used.has(club.id))continue;
    const players=clubRoster(s,club.id).filter(p=>p.id!==s.playerId&&canRemove(s,p)&&p.professional?.contract&&!(stoveRound!==undefined&&s.proWorld?.stove?.movedIds.includes(p.id))).sort((a,b)=>clubRoster(s,club.id).filter(q=>q.position===b.position).length-clubRoster(s,club.id).filter(q=>q.position===a.position).length||contractValue(a,s.calendar.seasonYear)-contractValue(b,s.calendar.seasonYear)||a.id.localeCompare(b.id));
    const p=players[0],roll=hash(`${s.seed}:trade:${s.proWorld!.year}:${club.id}${stoveRound===undefined?"":`:${stoveRound}`}`)%4;if(!p||(stoveRound===undefined?roll!==0:roll===3))continue;
    if(tradePlayer(s,p)){used.add(club.id);used.add(p.teamId%10);}
  }
}
export function reviewStoveReleases(s:GameState,year:number){
  for(const club of s.proWorld!.clubs){
    const roster=clubRoster(s,club.id);
    const candidates=roster.filter(p=>p.id!==s.playerId&&p.professional!.rookieYear<year&&(!p.professional!.contract||p.professional!.contract!.endYear<year)&&canRemove(s,p))
      .filter(p=>roster.length>=70||((p.age??19)>=26&&contractValue(p,year-1)<47))
      .sort((a,b)=>contractValue(a,year-1)-contractValue(b,year-1)||b.age!-a.age!||a.id.localeCompare(b.id));
    const p=candidates[0];if(p)releasePlayer(s,p,"스토브리그 전력 재편 · 만료 계약과 포지션 수요 검토",year);
  }
}
export function trimForRookies(s:GameState,club:number,needed:number,year:number){
  const removable=clubRoster(s,club).filter(p=>p.id!==s.playerId&&p.teamId>=10&&(!p.professional!.contract||p.professional!.contract!.endYear<year))
    .sort((a,b)=>contractValue(a,year-1)-contractValue(b,year-1)||b.age!-a.age!||a.id.localeCompare(b.id));
  for(const p of removable){if(clubRoster(s,club).length+needed<=75&&clubRoster(s,club).filter(q=>q.teamId>=10).length+needed<=45)break;if(canRemove(s,p))releasePlayer(s,p,"신인 합류와 2군·잔류군·육성선수 합산 정원을 위한 계약 만료 평가",year);}
}
export function tradePlayer(s:GameState,p:Player):boolean{
  const w=s.proWorld!,pro=p.professional;if(!pro?.contract||pro.employment!=="active"||!["camp","regular","offseason","summary"].includes(w.stage))return false;
  const half=s.calendar.events.filter(g=>g.competitionId==="pro-first")[360]?.date;if(w.stage==="regular"&&half&&s.date>half)return false;
  const requiredYear=w.stage==="summary"||w.stage==="offseason"?w.year+1:w.year;if(pro.contract.endYear<requiredYear)return false;
  const from=pro.contract.club,value=contractValue(p,w.year);
  const options=s.players.filter(q=>q.id!==p.id&&q.teamId>=10&&q.teamId%10!==from&&q.professional?.contract&&q.professional.contract.endYear>=requiredYear&&q.professional.employment==="active"&&Math.abs(contractValue(q,w.year)-value)<=12)
    .filter(q=>canRemove(s,p)&&canRemove(s,q)&&!(w.stove&&!w.stove.closed&&w.stove.movedIds.includes(q.id))).sort((a,b)=>Math.abs(contractValue(a,w.year)-value)-Math.abs(contractValue(b,w.year)-value)||a.id.localeCompare(b.id));
  for(const q of options){const other=q.professional!,to=other.contract!.club,pc=pro.contract,qc=other.contract!;
    const future=Math.max(pc.endYear,qc.endYear);let affordable=true;
    for(let y=w.year;y<=future;y++)if(clubCost(s,from,y,[p.id,q.id])+(qc.startYear<=y&&qc.endYear>=y?qc.salary:0)>w.clubs[from].budget||clubCost(s,to,y,[p.id,q.id])+(pc.startYear<=y&&pc.endYear>=y?pc.salary:0)>w.clubs[to].budget)affordable=false;
    const pTeam=contractDestination(s,p,to,p.proContract?.status==="developmental",[q.id]),qTeam=contractDestination(s,q,from,q.proContract?.status==="developmental",[p.id]);
    if(!affordable||pTeam===null||qTeam===null)continue;
    p.teamId=pTeam;q.teamId=qTeam;pc.club=to;qc.club=from;
    if(w.stove&&!w.stove.closed)w.stove.movedIds.push(p.id,q.id);
    for(const [player,old,dest] of [[p,from,to],[q,to,from]] as [Player,number,number][]){const info=player.professional!;info.movements.push({date:s.date,from:old,to:dest,kind:"트레이드",reason:"구단 간 포지션 수요와 계약 조건을 반영한 1대1 교환"});const stint=info.service.at(-1);if(stint)stint.to=w.year;info.service.push({club:dest,from:w.year,to:w.year});info.lastRegistration=s.date;}
    if(p.id===s.playerId||q.id===s.playerId){const mine=getPlayer(s);s.postSchool!.pro!.club=mine.teamId%10;s.postSchool!.pro!.level=mine.teamId<10?"first":mine.teamId<20?"second":mine.teamId<30?"third":"developmental";proNotice(s,`trade:${s.date}:${p.id}:${q.id}`,"트레이드 통보",`${p.name} ↔ ${q.name} · 소속이 변경됐습니다. 계약·신분·같은 시즌 기록은 유지됩니다. 이 통보는 거래 결과 확인입니다.`);}
    proNews(s,`${clubName(s,from)} ↔ ${clubName(s,to)} · ${p.name} / ${q.name} 1대1 교환`);return true;
  }return false;
}
export function careerRequest(s:GameState,kind:"chance"|"position"|"manage"|"trade"|"release",position?:Position){
  const p=getPlayer(s),pro=p.professional!;if(pro.requestAfter&&s.date<pro.requestAfter)throw new Error(`${pro.requestAfter} 이후 다시 요청할 수 있습니다.`);
  if(pro.employment!=="active")throw new Error("구단 소속 상태에서 요청할 수 있습니다.");
  pro.requestAfter=addDays(s.date,28);
  if(kind==="trade"){if(!tradePlayer(s,p))proNotice(s,`request:${s.date}`,"이적 요청 검토 결과","현재 조건에 맞는 교환 상대와 구단 합의를 찾지 못했습니다. 계약과 소속은 유지됩니다.");return;}
  if(kind==="release"){
    if(canRemove(s,p)&&contractValue(p,s.proWorld!.year)<55){releasePlayer(s,p,"선수 요청과 구단 동의에 따른 계약 해제",s.proWorld!.year+1);s.proWorld!.market=undefined;}
    proNotice(s,`request:${s.date}`,"계약 해제 요청 결과",p.teamId<0?"구단이 요청에 동의했습니다. 다음 계약 시장에서 새 기회를 찾을 수 있습니다.":"구단이 현재 전력과 계약을 고려해 동의하지 않았습니다. 최종안 또는 은퇴를 검토할 수 있습니다.");return;
  }
  if(kind==="manage"){pro.managedUntil=addDays(s.date,14);proNotice(s,`request:${s.date}`,"몸 관리 기간을 조정했습니다","14일 동안 출전보다 몸 관리를 우선합니다. 훈련 설정과 실제 부상·피로 제한은 유지됩니다.");return;}
  if(kind==="position"&&position){
    const pitching=["SP","RP","CP"].includes(position),aptitude=ovr(p,pitching);
    if(aptitude>=45){beginProRoleTrial(s,position,"ROLE_REQUEST",true);proNotice(s,`request:${s.date}`,"새 보직 평가를 시작합니다","14일간 현재 역할을 유지하며 훈련과 적성을 검토합니다. 정상 훈련 5일 이상과 기량을 충족하면 요청한 포지션으로 전환합니다. 출전과 승격은 보장되지 않으며 훈련 배분은 유지됩니다.");}
    else proNotice(s,`request:${s.date}`,"보직 요청 검토 결과","해당 역할의 기본 능력을 더 준비한 뒤 다시 검토하기로 했습니다.");return;
  }
  if(kind==="chance"){pro.requestedEvaluationUntil=addDays(s.date,21);proNotice(s,`request:${s.date}`,"출전 기회 요청을 전달했습니다","앞으로 3주간 나이와 무관하게 수비 자격·경쟁자·컨디션에 맞춰 평가 출전을 검토합니다. 실제 과거 출전 날짜는 바꾸지 않고, 요청만으로 출전이나 결과가 보장되지는 않습니다.");}
}
export function finishRoleTrial(s:GameState){
  for(const p of s.players){const trial=p.professional?.roleTrial;if(!trial||trial.version===1||s.date<trial.until)continue;delete p.professional!.roleTrial;
    const pitching=["SP","RP","CP"].includes(trial.position);if(ovr(p,pitching)>=45){const pos=trial.position;if(!p.eligiblePositions.includes(pos))p.eligiblePositions.push(pos);assignRole(p,pitching?pos==="SP"?"선발":pos==="CP"?"마무리":"중간계투":pos==="C"?"포수":["SS","2B","CF"].includes(pos)?"센터라인":"코너 야수");p.position=pos;if(p.twoWay){if(pitching)p.twoWay.pitchingPosition=pos;else p.twoWay.battingPosition=pos;}
      if(p.professional?.twoWayReview){const pair=p.professional.twoWayReview.positions;if(pitching)pair.pitchingPosition=pos;else pair.battingPosition=pos;}
      if(!p.twoWay)focusProRole(p,pitching);
      if(p.id===s.playerId)proNotice(s,`role:${s.date}`,"보직 평가를 마쳤습니다","새 보직을 적용했습니다. 능력·기록은 유지되며 해당 분야에서 경쟁합니다. 프로 겸업은 별도 기준과 감독 제안으로 결정됩니다.");}
  }
}

export function applySeasonExitPolicies(s:GameState){
  if(!s.proWorld?.seasonClosed)return;
  for(const p of s.players){
    const decision=seasonExit(p,s.proWorld.year);if(!decision)continue;
    const pro=p.professional!,club=pro.contract?.club??p.teamId%10;
    pro.nonRenewal={year:s.proWorld.year,kind:decision.kind,reason:decision.reason,club};
    releasePlayer(s,p,decision.reason,s.proWorld.year+1);
    if(p.id===s.playerId)proNotice(s,`non-renewal:${s.proWorld.year}`,"방출·정식 재계약 불가 통보",`${decision.reason} 다른 구단의 수요·나이·성장세에 따라 1년 신고 재영입 제안을 받을 수 있습니다. 기존 보장액과 시즌 기록은 보존됩니다.`);
  }
}

export function needsContractUpgrade(s:GameState){return s.careerMode==="pro"&&!!s.proWorld&&(s.proWorld.contractRulesVersion!==3||s.players.some(p=>p.professional&&(p.professional.assessments===undefined||p.professional.assessments.some(row=>row.firstTeam===undefined||row.secondOnly===undefined||row.firstGames===undefined))));}
export function upgradeContractRules(s:GameState){
  if(!needsContractUpgrade(s))return false;
  for(const p of s.players){hydrateAssessments(s,p);if(p.professional?.nonRenewal&&["low-evaluation","second-team"].includes(p.professional.nonRenewal.kind))delete p.professional.nonRenewal;}
  const world=s.proWorld!;
  if(world.seasonClosed&&!world.market?.settled)applySeasonExitPolicies(s);
  if(world.market&&!world.market.settled){
    const p=getPlayer(s);if(p.professional?.employment!=="active")world.market.kind="released";
    refreshOffers(s);
  }
  world.contractRulesVersion=3;return true;
}
