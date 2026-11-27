import {showStoveReport} from './stove-report';
import {upgradeRawSeasonWar} from './pro-war-upgrade';
import {winterShopBenefit} from './offseason-shop';
import {injuryRiskAssessment} from './injury-system';
import {assessmentValue,hydrateAssessments,requiresDevelopmentalOffer,salaryUnits,seasonExit} from "./pro-assessment";
import {canPlayPosition} from './position-eligibility';
import {MIN_PRO_SALARY,proContractRules as rules} from "./pro-contract-rules";
import {regularSeasonDays} from './retirement-honors';
import {addDays,assignRole,getPlayer,hash,ovr,positions,roleFor,roleScore,selectionScore} from "./engine";
import {contractValue} from "./pro-evaluation";
import {BASE_SALARY,clubName,contractFor,proNews,proNotice} from "./pro-world";
import type {GameState,Player,Position} from "./types";
import type {ContractOffer} from "./pro-types";
import {focusProRole} from "./pro-two-way";
import {beginProRoleTrial,positionRequestBlock,proRoleAptitudeIssue} from "./pro-role-evaluation";
import {retireProfessional,veteranRetirementReason} from "./pro-retirement";
import {faProposal} from "./pro-fa-terms";
import {currentProPosition,guaranteedProSquad,guaranteedProStarter} from "./pro-positions";
import {organizationMinimum,firstTeamRosterCapacity,firstTeamSlotPosition} from "./pro-roster";
import {proSquad,setProSquad} from "./pro-squads";
import type {ProSquad} from "./types";
import {refreshSeasonEvaluations} from './pro-season-evaluation';
import {freezeSeasonRankings,needsSeasonRankings} from './pro-season-ranking';

function registrationPayMultiplier(p:Player,year:number,s?:GameState){
  const pro=p.professional,assessment=pro?.assessments?.find(row=>row.year===year);
  const snapshot=assessment?.honorRegistration;
  const live=pro?.honorUsage?.year===year?pro.honorUsage:undefined;
  const days=snapshot?.seasonDays||(s?.calendar.seasonYear===year?regularSeasonDays(s):0);
  const recorded=snapshot?.seasonDays?snapshot:live;
  const firstDays=recorded?Object.values(recorded.firstDaysByClub).reduce((total,count)=>total+count,0):pro?.registration?.year===year?pro.registration.days:undefined;
  // Older saves can lack a daily log. Only infer zero from a recorded absence of first-team registration.
  const ratio=days>0&&firstDays!==undefined?firstDays/days:assessment?.firstTeam===false?0:1;
  if(ratio>=.9)return 1;
  return ratio<=.5?.3+.6*ratio:.6+(ratio-.5);
}
function adjustedSalary(p:Player,year:number,s?:GameState,multiplier=1){
  const base=salaryUnits(assessmentValue(p,year).score)*BASE_SALARY;
  const offer=Math.min(20*BASE_SALARY,base*multiplier);
  return Math.floor((offer*registrationPayMultiplier(p,year,s)*injuryRiskAssessment(p,s?.date??`${year}-12-31`).salaryMultiplier+1e-6)/100_000)*100_000;
}
export function salaryQuote(p:Player,year:number,s?:GameState) {
  return p.proContract?.status==='developmental'?MIN_PRO_SALARY:Math.max(MIN_PRO_SALARY,adjustedSalary(p,year,s));
}
function nominalFaContractYears(p:Player,score:number,year:number,club:number){
  const band=rules.faDurationBands.find(([minimum])=>score>=minimum)??rules.faDurationBands.at(-1)!;
  const years=score<rules.multiYearScore?1:band[1]+hash(`${year}:${p.id}:${club}`)%(band[2]-band[1]+1);
  return Math.min(faContractYearLimit(p),years);
}
export function faContractYears(p:Player,score:number,year:number,club:number,date=`${year}-12-31`){return Math.max(1,nominalFaContractYears(p,score,year,club)-injuryRiskAssessment(p,date).yearsLost);}
const faContractYearLimit=(p:Player)=>(p.age??19)>=40?1:(p.age??19)>=38?2:(p.age??19)>=36?3:6;
export function clubInterest(s:GameState,p:Player,club:number,year:number){
  const direction=s.proWorld!.clubs[club].direction,age=p.age??19;
  return contractValue(p,year,s.date)+(direction==="rebuild"?Math.max(-8,Math.min(8,27-age)):direction==="contend"?(roleScore(p)-60)*.15-Math.max(0,age-36):0);
}
export function clubCost(s:GameState,club:number,year:number,exclude:string[]=[]){
  return (s.proWorld?.clubs[club]?.deadMoney[String(year)]??0)+s.players.filter(p=>!exclude.includes(p.id)&&p.professional?.employment==="active"&&p.professional.contract?.club===club&&p.professional.contract.startYear<=year&&p.professional.contract.endYear>=year)
    .reduce((sum,p)=>sum+p.professional!.contract!.salary,0);
}
function planningReserve(s:GameState,club:number,year:number,exclude:string[]){
  if(year<=s.proWorld!.year)return 0;
  const minimum=Object.fromEntries((["C","SP","RP","CP","DH","1B","2B","3B","SS","LF","CF","RF"] as Position[]).map(pos=>[pos,organizationMinimum(s.seed,club,pos)]));
  const signed=clubRoster(s,club).filter(p=>!exclude.includes(p.id)&&p.proContract?.status!=="developmental"&&p.professional!.contract&&p.professional!.contract!.startYear<=year&&p.professional!.contract!.endYear>=year);
  const candidate=exclude.length===1?s.players.find(p=>p.id===exclude[0]):undefined;
  if(candidate&&candidate.proContract?.status!=="developmental")signed.push(candidate);
  const crew=Object.entries(minimum).reduce((sum,[pos,n])=>sum+Math.max(0,n-signed.filter(p=>p.position===pos).length)*BASE_SALARY,0);
  const mine=getPlayer(s),contract=mine.professional?.contract;
  const player=mine.professional?.employment==="active"&&contract?.club===club&&contract.endYear<year&&!exclude.includes(mine.id)?salaryQuote(mine,s.proWorld!.year,s)*1.08:0;
  return Math.max(s.proWorld!.draftedYears.includes(year)?0:13*BASE_SALARY,crew)+player;
}
export function canAfford(s:GameState,club:number,salary:number,year:number,years=1,exclude:string[]=[]){
  const budget=s.proWorld!.clubs[club].budget;
  return Array.from({length:years},(_,i)=>year+i).every(y=>clubCost(s,club,y,exclude)+salary+planningReserve(s,club,y,exclude)<=budget+1);
}
export function clubRoster(s:GameState,club:number){return s.players.filter(p=>p.teamId>=0&&p.teamId%10===club&&p.professional?.employment==="active");}
function releaseRecruitmentBlocked(p:Player,club:number,members:Player[]){
  const role=roleFor(p.position),score=selectionScore(p,role);
  let first=0,upper=0;
  for(const rival of members){
    if(rival.id===p.id||rival.teamId!==club&&rival.teamId!==club+10||!currentProPosition(rival,p.position)||selectionScore(rival,role)<=score)continue;
    upper++;if(rival.teamId===club)first++;
    if(first>=3||upper>=5)return true;
  }
  return false;
}
// Incoming players can use a free first-team slot even when the lower squads
// are full. Offers are read-only; recheck capacity again when signing.
export function contractPlacement(s:GameState,p:Player,club:number,developmental=p.proContract?.status==="developmental",exclude:string[]=[],startingLevel?:ProSquad):{team:number;moves:{player:Player;level:ProSquad}[]}|null {
  const members=clubRoster(s,club).filter(q=>q.id!==p.id&&!exclude.includes(q.id));
  if(members.length>=75)return null;
  const first=members.filter(q=>q.teamId===club),lower=members.filter(q=>q.teamId>=10),second=lower.filter(q=>q.teamId===club+10),moves:{player:Player;level:ProSquad}[]=[];
  const capacity=firstTeamRosterCapacity(s,club);
  const prior=proSquad(p.teamId)??p.professional?.lastSquad??p.professional?.assessments?.at(-1)?.squad;
  const requested=developmental?(p.teamId>=10&&p.teamId<20&&startingLevel!=="developmental"?"second":"developmental"):startingLevel??prior??(lower.length>=45&&first.length<capacity?"first":second.length<30?"second":"third");
  const desired=!developmental&&requested==='developmental'?'third':requested;
  if(desired==="first"&&(p.teamId>=20||p.teamId<0&&(prior==="third"||prior==="developmental")))return null;
  const rosterDate=`${s.proWorld!.year+(s.proWorld!.seasonClosed?1:0)}-03-01`;
  const movable=(q:Player)=>q.id!==s.playerId&&!guaranteedProStarter(q,q.position,s.date)&&!guaranteedProStarter(q,q.position,rosterDate);
  const order=(a:Player,b:Player)=>Number(b.position===p.position)-Number(a.position===p.position)||roleScore(a)-roleScore(b)||a.id.localeCompare(b.id);
  const makeSecondRoom=()=>{
    if(second.length<30)return true;
    const down=second.filter(movable).sort(order)[0];if(!down)return false;
    moves.push({player:down,level:down.proContract?.status==="developmental"?"developmental":"third"});return true;
  };
  if(desired==="first"){
    if(first.length>=capacity){
      if(lower.length>=45)return null;
      const pitching=(q:Player)=>["SP","RP","CP"].includes(q.position);
      const slot=(q:Player)=>firstTeamSlotPosition(q.position);
      const down=first.filter(q=>movable(q)&&pitching(q)===pitching(p)&&(slot(q)===slot(p)||first.filter(r=>slot(r)===slot(q)).length>1))
        .sort((a,b)=>Number(slot(b)===slot(p))-Number(slot(a)===slot(p))||order(a,b))[0];
      if(!down||!makeSecondRoom())return null;
      moves.push({player:down,level:"second"});
    }
    return {team:club,moves};
  }
  if(desired==="second"){
    if(lower.length>=45||!makeSecondRoom())return null;
    return {team:club+10,moves};
  }
  if(lower.length<45)return {team:club+(desired==="developmental"?30:20),moves};
  return null;
}
export function contractDestination(s:GameState,p:Player,club:number,developmental=p.proContract?.status==="developmental",exclude:string[]=[]):number|null {
  return contractPlacement(s,p,club,developmental,exclude)?.team??null;
}
export function canRemove(s:GameState,p:Player){
  if(guaranteedProSquad(p,s.date))return false;
  if(p.teamId<0)return true;const same=clubRoster(s,p.teamId%10).filter(q=>q.position===p.position);
  const minimum=organizationMinimum(s.seed,p.teamId%10,p.position);
  return same.length>minimum&&(p.proContract?.status==="developmental"||same.filter(q=>q.id!==p.id&&q.proContract?.status!=="developmental").length>=minimum);
}
export function releasePlayer(s:GameState,p:Player,reason:string,year:number){
  if(!s.proWorld?.seasonClosed)return;
  const pro=p.professional;if(!pro||pro.employment!=="active")return;
  const old=pro.contract,club=old?.club??p.teamId%10;
  pro.lastSquad=proSquad(p.teamId)??pro.lastSquad;
  if(old&&old.endYear>=year)for(let y=year;y<=old.endYear;y++){const debt=s.proWorld!.clubs[club].deadMoney;s.proWorld!.clubs[club].deadMoney[String(y)]=(debt[String(y)]??0)+old.salary;(pro.guarantees??=[]).push({year:y,club,amount:old.salary});}
  pro.movements.push({date:s.date,from:club,to:null,kind:"방출",reason,squad:pro.lastSquad});pro.contract=null;pro.employment="freeAgent";p.teamId=-1;
  const stint=pro.service.at(-1);if(stint)stint.to=s.calendar.seasonYear;
  proNews(s,`${p.name} · ${clubName(s,club)} 계약 종료 · ${reason}`,`${year}:release:${p.id}`);
}
export function signContract(s:GameState,p:Player,offer:ContractOffer){
  const pro=p.professional!;
  if(!Number.isInteger(offer.years)||offer.years<1||offer.years>(offer.kind==='fa'?6:1))throw new Error('계약 기간을 확인해 주세요.');
  if(offer.kind==="released"&&releaseRecruitmentBlocked(p,offer.club,clubRoster(s,offer.club)))throw new Error("같은 포지션의 상위 출전평가 선수가 많아 구단이 영입 제안을 철회했습니다. 다음 계약 제안을 확인해 주세요.");
  if(offer.lastChance&&(offer.kind!=="fa"||offer.club!==pro.contract?.club||offer.years!==1||![MIN_PRO_SALARY,BASE_SALARY].includes(offer.salary)||offer.registration))throw new Error("원소속팀의 마지막 제안은 1년 최저 연봉 계약입니다.");
  if(requiresDevelopmentalOffer(p,offer.year-1)&&(offer.registration!=="developmental"||offer.club===pro.nonRenewal?.club||offer.years!==1))throw new Error("정식 재계약 불가 판정으로 다른 구단의 1년 신고 계약만 검토할 수 있습니다.");
  if(offer.registration==="developmental"){
    if(offer.years!==1||![MIN_PRO_SALARY,30_000_000].includes(offer.salary))throw new Error("신고 재영입은 1년 기본 신고 연봉으로 계약합니다.");
  }
  if(!canAfford(s,offer.club,offer.salary,offer.year,offer.years,[p.id]))throw new Error("구단의 미래 보장액을 포함한 예산을 초과합니다.");
  const placement=contractPlacement(s,p,offer.club,offer.registration==="developmental"||p.proContract?.status==="developmental",[],offer.registration==="developmental"?"developmental":offer.startingLevel);
  if(!placement)throw new Error("현재 등록 군을 유지할 수 있는 구단 정원이 없습니다. 다음 스토브리그 제안을 확인해 주세요.");
  const destination=placement.team;
  for(const move of placement.moves)setProSquad(s,move.player,move.level);
  if(offer.registration==="developmental"){
    p.proContract={status:"developmental",joinedDate:`${offer.year}-03-01`};
    pro.developmentalRetry={year:offer.year,deadlineYear:offer.year,club:offer.club};
  }
  const old=pro.employment==="active"?pro.contract?.club??p.teamId%10:null;
  if(old!==offer.club){
    const stint=pro.service.at(-1);if(stint)stint.to=s.calendar.seasonYear;
    pro.service.push({club:offer.club,from:offer.year,to:offer.year});
    pro.movements.push({date:s.date,from:old,to:offer.club,kind:offer.kind==="fa"?"FA 이적":"계약",reason:offer.role,registration:p.proContract?.status});p.teamId=destination;
  }else {
    p.teamId=destination;
    if(offer.kind==="fa")pro.movements.push({date:s.date,from:old,to:offer.club,kind:"FA 잔류",reason:offer.role});
  }
  pro.contract=contractFor(offer.club,offer.year,offer.salary,offer.years,offer.kind);if(offer.faTerms)pro.contract.faTerms=structuredClone(offer.faTerms);pro.employment="active";pro.unattachedYears=0;pro.highestSalary=Math.max(pro.highestSalary,offer.salary);pro.lastRegistration=s.date;
  if(offer.kind==='fa'){pro.lastFaTerm={start:offer.year,end:pro.contract.endYear};pro.faEligible=false;}
  if(s.proWorld?.stove&&!s.proWorld.stove.closed&&!s.proWorld.stove.movedIds.includes(p.id))s.proWorld.stove.movedIds.push(p.id);
  if(p.id===s.playerId&&s.postSchool?.pro){s.postSchool.pro.club=offer.club;s.postSchool.pro.level=p.teamId<10?"first":p.teamId<20?"second":p.teamId<30?"third":"developmental";}
  proNews(s,`${p.name} · ${clubName(s,offer.club)} ${offer.years}년 계약`,`${offer.id}:signed`);
}
export function releaseContractTerms(p:Player){
  const count=p.professional?.movements.filter(row=>row.kind==='방출').length??0;
  return {count,chance:count===0?100:count===1?50:count===2?20:5,salaryMultiplier:count===0?1:count===1?.8:count===2?.6:.4};
}
export function offerFor(s:GameState,p:Player,club:number,year:number,kind:ContractOffer["kind"]):ContractOffer|null{
  const pro=p.professional!,members=clubRoster(s,club).filter(q=>q.id!==p.id);
  const releaseTerms=releaseContractTerms(p);
  // One stable market-wide roll; ten clubs must not multiply the stated chance.
  if(kind==='released'&&releaseTerms.count>0&&hash(`${s.seed}:release-market:${year}:${p.id}`)%100>=releaseTerms.chance)return null;
  if(kind==="released"&&releaseRecruitmentBlocked(p,club,members))return null;
  const destination=contractDestination(s,p,club,requiresDevelopmentalOffer(p,year-1)||p.proContract?.status==="developmental");
  if(destination===null)return null;
  const assessment=assessmentValue(p,year-1),value=assessment.score,own=pro.contract?.club===club&&pro.employment==="active",trial=requiresDevelopmentalOffer(p,year-1);
  const peers=members.filter(q=>currentProPosition(q,p.position)&&q.proContract?.status!=="developmental");
  const minimum=organizationMinimum(s.seed,club,p.position);
  const need=peers.length<minimum,rows=pro.assessments??[],last=rows.at(-1),previous=rows.at(-2),growing=!!last&&!!previous&&last.ability-previous.ability>=rules.growthGrace;
  if(trial){
    if(club===pro.nonRenewal?.club||(p.age??19)>rules.reentryMaxAge||roleScore(p)<rules.reentryMinAbility)return null;
    if(releaseTerms.count===0){
      const chance=rules.reentryChance+((p.age??19)<=rules.youngAge?rules.youngBonus:0)+(growing?rules.growthBonus:0)+(need?rules.needBonus:0);
      if(hash(`${s.seed}:reentry:${year}:${p.id}:${club}`)%100>=chance)return null;
    }
  }else if(!own){
    const veteran=kind==="fa"&&(p.age??19)>=rules.veteranAge;
    const minimumInterest=veteran?rules.veteranFaInterest+Math.min(rules.veteranFaMaxPenalty,((p.age??19)-rules.veteranAge)*rules.veteranFaAgePenalty):40;
    if(clubInterest(s,p,club,year-1)<minimumInterest)return null;
  }
  const years=trial?1:kind==="fa"?nominalFaContractYears(p,value,year,club):1;
  const proposal=kind==="fa"&&!trial&&p.proContract?.status!=="developmental"?faProposal(s,p,club,year,value,years):undefined;
  const baseSalary=trial||p.proContract?.status==='developmental'?MIN_PRO_SALARY:adjustedSalary(p,year-1,s,proposal?.multiplier);
  const adjusted=kind==='released'?Math.floor(baseSalary*releaseTerms.salaryMultiplier/100_000)*100_000:baseSalary;
  const salary=Math.max(MIN_PRO_SALARY,adjusted);
  let duration=Math.max(1,Math.min(kind==='fa'?faContractYearLimit(p):1,proposal?.years??years)-(kind==='fa'?injuryRiskAssessment(p,s.date).yearsLost:0));while(duration>1&&!canAfford(s,club,salary,year,duration,[p.id]))duration--;
  if(!canAfford(s,club,salary,year,duration,[p.id]))return null;
  if(proposal?.terms.plan==="security"){
    proposal.terms.title=duration>1?"장기 계약":"계약 안정";
    proposal.terms.description=duration>1?"연봉 일부를 조정해 계약기간과 고용 안정을 우선합니다.":"구단 예산 범위에서 1년 계약과 기존 역할의 안정을 우선합니다.";
  }
  const competitors=members.filter(q=>currentProPosition(q,p.position)).sort((a,b)=>roleScore(b)-roleScore(a));
  const role=roleScore(p)>Math.max(0,...competitors.map(q=>roleScore(q)))?"주전 경쟁 우선 검토":roleScore(p)>55?"1·2군 등록 경쟁":"2군 육성·평가 출전";
  return {id:`${year}:offer:${p.id}:${club}`,club,year,years:duration,salary,...(adjusted<salary?{salaryBeforeMinimum:adjusted}:{}),role:trial?"신고선수 1년 재도전":proposal?.terms.title??role,kind,...(kind==="fa"?{faRetention:own}:{}),...(proposal?{faTerms:proposal.terms}:{}),startingLevel:proSquad(destination)!,negotiated:false,final:false,competition:competitors.slice(0,3).map(q=>q.name),assessment,...(trial?{registration:"developmental" as const}:{})};
}
export function openContractMarket(s:GameState){
  const w=s.proWorld!,p=getPlayer(s),pro=p.professional!,year=w.year+1;
  if(w.market?.year===year)return;
  if(pro.contract&&pro.contract.endYear>=year){w.market={year,kind:"renewal",round:0,offers:[],settled:true};return;}
  const kind=pro.employment!=="active"?"released":pro.faEligible&&p.proContract?.status!=="developmental"?"fa":"renewal";
  w.market={year,kind,round:0,offers:[],settled:false};w.stage="offseason";refreshOffers(s);
}
function lastChanceOffer(s:GameState,p:Player,club:number,year:number):ContractOffer|null{
  if(p.proContract?.status==="developmental"||requiresDevelopmentalOffer(p,year-1)||roleScore(p)<rules.lastChanceMinAbility||clubInterest(s,p,club,year-1)<rules.lastChanceMinInterest)return null;
  if(contractDestination(s,p,club,false)===null||!canAfford(s,club,MIN_PRO_SALARY,year,1,[p.id]))return null;
  return {id:`${year}:last-chance:${p.id}:${club}`,club,year,years:1,salary:MIN_PRO_SALARY,role:"원소속팀 1년 최저 연봉 계약",kind:"fa",faRetention:true,lastChance:true,negotiated:false,final:true,competition:[],assessment:assessmentValue(p,year-1)};
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
  const selected=retention?[retention]:[],plans=new Set(selected.map(offer=>offer.faTerms?.plan));
  for(const offer of offers)if(selected.length<3&&!selected.includes(offer)&&!plans.has(offer.faTerms?.plan)){selected.push(offer);plans.add(offer.faTerms?.plan);}
  for(const offer of offers)if(selected.length<3&&!selected.includes(offer))selected.push(offer);
  market.offers=selected;
  if(!market.offers.length&&market.kind==="renewal"){
    releasePlayer(s,p,"구단 수요·예산과 계약 평가를 반영했습니다.",market.year);market.kind="released";refreshOffers(s);
  }
}
export function negotiateOffer(s:GameState,id:string){
  const market=s.proWorld!.market!,offer=market.offers.find(o=>o.id===id);if(!offer||market.settled||offer.negotiated)throw new Error("이 제안의 재협상 기회는 이미 사용했습니다.");
  if(offer.lastChance)throw new Error("원소속팀의 마지막 제안은 재협상할 수 없습니다. 잔류 또는 은퇴를 선택해 주세요.");
  const p=getPlayer(s);offer.negotiated=true;offer.final=true;
  const agent=(offer.kind==='fa'||offer.kind==='renewal')&&winterShopBenefit(p,'agent',offer.year);
  if(offer.registration!=="developmental"&&p.proContract?.status!=='developmental'&&(agent||assessmentValue(p,s.proWorld!.year).score>=rules.negotiationScore)){
    for(const multiplier of agent?[1.18,1.08]:[1.08]){
      const basis=offer.salaryBeforeMinimum??offer.salary;
      const raise=Math.max(MIN_PRO_SALARY,Math.floor(basis*multiplier/100_000)*100_000);
      if(canAfford(s,offer.club,raise,offer.year,offer.years,[p.id])){offer.salary=raise;delete offer.salaryBeforeMinimum;break;}
    }
  }
  proNotice(s,`negotiation:${id}`,"최종 계약 조건이 도착했습니다","화면의 최종 연봉·기간을 확인한 뒤 수락하거나 다른 진로를 선택하세요. 같은 제안의 재협상은 한 번입니다.");
}
export function renewNPCs(s:GameState,year:number,stoveRound?:number){
  const list=s.players.filter(p=>p.id!==s.playerId&&p.professional?.employment==="active").sort((a,b)=>contractValue(b,year-1,s.date)-contractValue(a,year-1,s.date)||a.id.localeCompare(b.id));
  const protectedIds=new Set(list.filter(p=>!canRemove(s,p)).map(p=>p.id));list.sort((a,b)=>Number(protectedIds.has(b.id))-Number(protectedIds.has(a.id))||contractValue(b,year-1,s.date)-contractValue(a,year-1,s.date)||a.id.localeCompare(b.id));
  for(const p of list){const pro=p.professional!,contract=pro.contract;if(contract&&contract.endYear>=year)continue;
    if(stoveRound!==undefined&&hash(`${s.seed}:renewal:${year}:${p.id}`)%9>stoveRound)continue;
    const club=contract?.club??p.teamId%10,salary=salaryQuote(p,year-1,s),value=contractValue(p,year-1,s.date);
    if(pro.faEligible&&canRemove(s,p)){
      const alternatives=s.proWorld!.clubs.filter(c=>c.id!==club&&clubInterest(s,p,c.id,year-1)>clubInterest(s,p,club,year-1)+2).sort((a,b)=>clubInterest(s,p,b.id,year-1)-clubInterest(s,p,a.id,year-1)||a.id-b.id);
      const offer=alternatives.flatMap(c=>{const candidate=offerFor(s,p,c.id,year,"fa");return candidate?[candidate]:[];})[0];
      if(offer){signContract(s,p,offer);continue;}
    }
    if(canRemove(s,p)&&((value<40&&(p.age??19)>25&&!p.injury)||!canAfford(s,club,salary,year,1,[p.id]))){releasePlayer(s,p,"시즌 실적·성장·나이·예산을 반영한 비시즌 평가",year);continue;}
    const affordable=Math.max(MIN_PRO_SALARY,Math.min(salary,s.proWorld!.clubs[club].budget-clubCost(s,club,year,[p.id])-planningReserve(s,club,year,[p.id])));
    if(canAfford(s,club,affordable,year,1,[p.id])){
      if(pro.faEligible&&p.proContract?.status!=='developmental'){
        const offer=offerFor(s,p,club,year,'fa');
        if(offer){signContract(s,p,offer);continue;}
        pro.movements.push({date:s.date,from:club,to:club,kind:'FA 잔류',reason:'원소속팀 1년 계약'});
        pro.contract=contractFor(club,year,affordable,1,'fa');pro.lastFaTerm={start:year,end:year};pro.faEligible=false;
      }else pro.contract=contractFor(club,year,affordable,1,"renewal");
    }
    else if(canRemove(s,p))releasePlayer(s,p,"구단 예산 조정",year);
  }
}
function tradeLimit(s:GameState){
  return 3+hash(`${s.seed}:trade-limit:${s.proWorld!.year}`)%2;
}
function tradeActivity(s:GameState){
  const world=s.proWorld!;
  if(world.tradeActivity?.year===world.year)return world.tradeActivity;
  const start=s.calendar.competitions.find(c=>c.id==='pro-first')?.startDate??`${world.year}-03-01`;
  let regular=0,winter=0;
  for(const player of s.players)for(const move of player.professional?.movements??[]){
    if(move.kind!=='트레이드'||move.date<start||move.date>`${world.year+1}-01-01`)continue;
    if(move.date<world.regularEnd)regular++;else winter++;
  }
  return world.tradeActivity={year:world.year,regular:Math.ceil(regular/2),winter:Math.ceil(winter/2)};
}
export function reviewNPCTrades(s:GameState){
  const world=s.proWorld!,regular=world.stage==='regular';
  if(!regular&&world.stage!=='offseason')return;
  const activity=tradeActivity(s),limit=tradeLimit(s);
  if(activity.regular+activity.winter>=limit||regular&&activity.regular>=2)return;
  const start=regular?s.calendar.competitions.find(c=>c.id==='pro-first')?.startDate:world.stove?.openedAt;
  if(!start)return;
  const variation=hash(`${s.seed}:trade-date:${world.year}:${activity.regular}:${activity.winter}`)%7;
  const due=addDays(start,regular?32+activity.regular*35+variation:10+activity.winter*10+variation);
  if(s.date<due||activity.lastReview&&s.date<addDays(activity.lastReview,7))return;
  const deadline=regular?s.calendar.events.filter(g=>g.competitionId==='pro-first')[360]?.date:undefined;
  if(deadline&&s.date>deadline)return;
  activity.lastReview=s.date;
  const clubs=[...world.clubs].sort((a,b)=>hash(`${s.seed}:trade-club:${s.date}:${a.id}`)-hash(`${s.seed}:trade-club:${s.date}:${b.id}`));
  for(const club of clubs){
    const roster=clubRoster(s,club.id);
    const depth=(p:Player)=>roster.filter(q=>q.position===p.position).length;
    const candidates=roster.filter(p=>p.id!==s.playerId&&p.professional?.contract&&canRemove(s,p)&&!world.stove?.movedIds.includes(p.id))
      .sort((a,b)=>depth(b)-depth(a)||contractValue(a,world.year,s.date)-contractValue(b,world.year,s.date)||a.id.localeCompare(b.id));
    if(candidates.some(p=>tradePlayer(s,p)))return;
  }
}
export function reviewStoveReleases(s:GameState,year:number){
  for(const club of s.proWorld!.clubs){
    const roster=clubRoster(s,club.id);
    const candidates=roster.filter(p=>p.id!==s.playerId&&p.professional!.rookieYear<year&&(!p.professional!.contract||p.professional!.contract!.endYear<year)&&canRemove(s,p))
      .filter(p=>roster.length>=70||((p.age??19)>=26&&contractValue(p,year-1,s.date)<47))
      .sort((a,b)=>contractValue(a,year-1,s.date)-contractValue(b,year-1,s.date)||b.age!-a.age!||a.id.localeCompare(b.id));
    const p=candidates[0];if(p)releasePlayer(s,p,"스토브리그 전력 재편 · 만료 계약과 포지션 수요 검토",year);
  }
}
export function trimForRookies(s:GameState,club:number,needed:number,year:number){
  const removable=clubRoster(s,club).filter(p=>p.id!==s.playerId&&p.teamId>=10&&p.professional!.rookieYear<year)
    .sort((a,b)=>Number(!!a.professional!.contract&&a.professional!.contract!.endYear>=year)-Number(!!b.professional!.contract&&b.professional!.contract!.endYear>=year)||contractValue(a,year-1,s.date)-contractValue(b,year-1,s.date)||b.age!-a.age!||a.id.localeCompare(b.id));
  for(const p of removable){if(clubRoster(s,club).length+needed<=75&&clubRoster(s,club).filter(q=>q.teamId>=10).length+needed<=45)break;if(canRemove(s,p))releasePlayer(s,p,"신인 합류 후 포지션 수요·하위 군 합산 정원을 검토한 잉여 인원 조정",year);}
}
export function tradePlayer(s:GameState,p:Player,requestedByPlayer=false):boolean{
  const w=s.proWorld!,pro=p.professional;if(!pro?.contract||pro.employment!=="active"||!["camp","regular","offseason","summary"].includes(w.stage))return false;
  const activity=tradeActivity(s);
  if(activity.regular+activity.winter>=tradeLimit(s))return false;
  const half=s.calendar.events.filter(g=>g.competitionId==="pro-first")[360]?.date;if(w.stage==="regular"&&half&&s.date>half)return false;
  const requiredYear=w.stage==="summary"||w.stage==="offseason"?w.year+1:w.year;if(pro.contract.endYear<requiredYear)return false;
  const from=pro.contract.club,value=contractValue(p,w.year,s.date);
  const options=s.players.filter(q=>q.id!==p.id&&q.teamId>=0&&q.teamId%10!==from&&q.professional?.contract&&q.professional.contract.endYear>=requiredYear&&q.professional.employment==="active"&&Math.abs(contractValue(q,w.year,s.date)-value)<=12)
    .filter(q=>canRemove(s,p)&&canRemove(s,q)&&!(w.stove&&!w.stove.closed&&w.stove.movedIds.includes(q.id))).sort((a,b)=>Math.abs(contractValue(a,w.year,s.date)-value)-Math.abs(contractValue(b,w.year,s.date)-value)||a.id.localeCompare(b.id));
  for(const q of options){const other=q.professional!,to=other.contract!.club,pc=pro.contract,qc=other.contract!;
    const future=Math.max(pc.endYear,qc.endYear);let affordable=true;
    for(let y=w.year;y<=future;y++)if(clubCost(s,from,y,[p.id,q.id])+(qc.startYear<=y&&qc.endYear>=y?qc.salary:0)>w.clubs[from].budget||clubCost(s,to,y,[p.id,q.id])+(pc.startYear<=y&&pc.endYear>=y?pc.salary:0)>w.clubs[to].budget)affordable=false;
    const pPlan=contractPlacement(s,p,to,p.proContract?.status==="developmental",[q.id]),qPlan=contractPlacement(s,q,from,q.proContract?.status==="developmental",[p.id]);
    if(!affordable||!pPlan||!qPlan)continue;
    for(const move of [...pPlan.moves,...qPlan.moves])setProSquad(s,move.player,move.level);
    p.teamId=pPlan.team;q.teamId=qPlan.team;pc.club=to;qc.club=from;
    if(w.stove&&!w.stove.closed)w.stove.movedIds.push(p.id,q.id);
    for(const [player,partner,old,dest] of [[p,q,from,to],[q,p,to,from]] as [Player,Player,number,number][]){
      const info=player.professional!;
      info.movements.push({date:s.date,from:old,to:dest,kind:"트레이드",reason:"구단 간 포지션 수요와 계약 조건을 반영한 1대1 교환",...(requestedByPlayer&&player.id===p.id?{requestedTrade:true as const}:{}),exchange:{id:partner.id,name:partner.name,position:partner.position}});
      const stint=info.service.at(-1);if(stint)stint.to=w.year;
      info.service.push({club:dest,from:requiredYear,to:requiredYear});info.lastRegistration=s.date;
    }
    const mine=p.id===s.playerId?p:q.id===s.playerId?q:undefined;
    if(mine&&s.postSchool?.pro){s.postSchool.pro.club=mine.teamId%10;s.postSchool.pro.level=proSquad(mine.teamId)!;}
    if(w.stage==='camp'||w.stage==='regular')activity.regular++;else activity.winter++;
    const userTeam=getPlayer(s).teamId;
    if(mine||userTeam>=0&&[from,to].includes(userTeam%10)){
      if(mine||w.stage==='regular')showTradeNotice(s,p,q,from,to);
      else proNews(s,`${clubName(s,from)} ↔ ${clubName(s,to)} · ${p.name} / ${q.name} 1대1 교환`);
    }
    return true;
  }return false;
}
function showTradeNotice(s:GameState,p:Player,q:Player,from:number,to:number){
  if(getPlayer(s).teamId>=0&&getPlayer(s).teamId%10===to){[p,q]=[q,p];[from,to]=[to,from];}
  const code=`trade:${s.date}:${p.id}:${q.id}`;
  proNotice(s,code,'트레이드 통보',`${clubName(s,from)} ${p.name} ↔ ${clubName(s,to)} ${q.name}`);
  const notice=[s.careerNotice,...(s.noticeQueue??[])].find(row=>row?.code===code);
  if(notice)notice.stoveReport={club:from,tradeOnly:true,moves:[{
    id:p.id,name:p.name,position:p.position,club:from,direction:'traded',otherClub:to,reason:'트레이드',
    exchange:{id:q.id,name:q.name,position:q.position},
  }]};
}
export function careerRequest(s:GameState,kind:"chance"|"position"|"manage"|"trade"|"release",position?:Position){
  const p=getPlayer(s),pro=p.professional!;
  if(kind==='release'&&!s.proWorld?.seasonClosed)throw new Error('방출 및 계약 해제는 시즌 종료 후에만 가능합니다.');
  if(kind==="position"){
    const blocked=positionRequestBlock(s,p);
    if(blocked)throw new Error(blocked);
    if(!position||!Object.hasOwn(positions,position)||position===p.position||!canPlayPosition(p,position))throw new Error("변경할 수 있는 다른 포지션을 선택해 주세요.");
    const aptitudeIssue=proRoleAptitudeIssue(p,position);
    if(!aptitudeIssue){
      beginProRoleTrial(s,position,"ROLE_REQUEST");
      proNotice(s,`request:${s.date}`,`${positions[position]} 전환 평가 시작`,`14일간 현재 포지션에서 평가를 받습니다. 정상 훈련 5일 이상을 채우고 평가 기준을 충족하면 ${positions[position]} 포지션으로 변경됩니다.`);
    }else{
      pro.requestAfter=addDays(s.date,28);
      proNotice(s,`request:${s.date}`,"포지션 변경 요청 결과",aptitudeIssue);
    }
    pro.positionRequestYear=s.calendar.seasonYear;
    return;
  }
  const winterTrade=kind==='trade'&&s.proWorld?.seasonClosed&&s.proWorld.stove&&!s.proWorld.stove.closed;
  const requestAfter=winterTrade?pro.tradeRequestAfter:kind==='trade'?[pro.requestAfter,pro.tradeRequestAfter].filter((date):date is string=>!!date).sort().at(-1):pro.requestAfter;
  if(requestAfter&&s.date<requestAfter)throw new Error(`${requestAfter} 이후 다시 요청할 수 있습니다.`);
  if(pro.employment!=="active")throw new Error("구단 소속 상태에서 요청할 수 있습니다.");
  if(!winterTrade)pro.requestAfter=addDays(s.date,28);
  if(kind==="trade"){
    pro.tradeRequestAfter=addDays(s.date,winterTrade?7:28);
    if(!tradePlayer(s,p,true))proNotice(s,`request:${s.date}`,"트레이드 요청 결과","현재 조건에 맞는 교환 상대와 구단 합의를 찾지 못했습니다.");return;
  }
  if(kind==="release"){
    if(canRemove(s,p)&&contractValue(p,s.proWorld!.year,s.date)<55){releasePlayer(s,p,"선수 요청과 구단 동의에 따른 계약 해제",s.proWorld!.year+1);s.proWorld!.market=undefined;}
    proNotice(s,`request:${s.date}`,"계약 해제 요청 결과",p.teamId<0?"구단이 요청에 동의했습니다. 다음 계약 시장에서 새 기회를 찾을 수 있습니다.":"구단이 현재 전력과 계약을 고려해 동의하지 않았습니다. 최종안 또는 은퇴를 검토할 수 있습니다.");return;
  }
  if(kind==="manage"){pro.managedUntil=addDays(s.date,14);proNotice(s,`request:${s.date}`,"몸 관리 기간을 조정했습니다","14일 동안 출전보다 몸 관리를 우선합니다. 훈련 설정과 실제 부상·피로 제한은 유지됩니다.");return;}
  if(kind==="chance"){pro.requestedEvaluationUntil=addDays(s.date,21);proNotice(s,`request:${s.date}`,"출전 기회 요청을 전달했습니다","앞으로 3주간 나이와 무관하게 수비 자격·경쟁자·컨디션에 맞춰 평가 출전을 검토합니다. 실제 과거 출전 날짜는 바꾸지 않고, 요청만으로 출전이나 결과가 보장되지는 않습니다.");}
}
export function finishRoleTrial(s:GameState){
  for(const p of s.players){const trial=p.professional?.roleTrial;if(!trial||trial.version===1||s.date<trial.until)continue;delete p.professional!.roleTrial;
    const pitching=["SP","RP","CP"].includes(trial.position);if(canPlayPosition(p,trial.position)&&ovr(p,pitching)>=45){const pos=trial.position;if(!p.eligiblePositions.includes(pos))p.eligiblePositions.push(pos);assignRole(p,pitching?pos==="SP"?"선발":pos==="CP"?"마무리":"중간계투":pos==="C"?"포수":["SS","2B","CF"].includes(pos)?"센터라인":"코너 야수");p.position=pos;if(p.twoWay){if(pitching)p.twoWay.pitchingPosition=pos;else p.twoWay.battingPosition=pos;}
      if(p.professional?.twoWayReview){const pair=p.professional.twoWayReview.positions;if(pitching)pair.pitchingPosition=pos;else pair.battingPosition=pos;}
      if(!p.twoWay)focusProRole(p,pitching);
      if(p.id===s.playerId)proNotice(s,`role:${s.date}`,"보직 평가를 마쳤습니다","새 보직을 적용했습니다. 능력·기록은 유지되며 해당 분야에서 경쟁합니다. 프로 겸업은 별도 기준과 감독 제안으로 결정됩니다.");}
  }
}

export function applySeasonExitPolicies(s:GameState){
  if(!s.proWorld?.seasonClosed||!s.proWorld.stove)return;
  let personal:{club:number;reason:string}|undefined;
  for(const p of s.players){
    if(p.id===s.playerId&&s.proWorld.pendingRetirement)continue;
    if((p.age??19)>=36&&p.professional?.contract?.source!=='fa'&&guaranteedProSquad(p,`${s.proWorld.year+1}-03-01`))continue;
    if(veteranRetirementReason(p,s.proWorld.year))continue;
    const decision=seasonExit(p,s.proWorld.year);if(!decision)continue;
    const pro=p.professional!,club=pro.contract?.club??p.teamId%10;
    pro.nonRenewal={year:s.proWorld.year,kind:decision.kind,reason:decision.reason,club};
    releasePlayer(s,p,decision.reason,s.proWorld.year+1);
    if(p.id===s.playerId)personal={club,reason:decision.reason};
  }
  if(personal){
    showStoveReport(s,'review',personal.club);
    proNotice(s,`non-renewal:${s.proWorld.year}`,"방출되었습니다",`${clubName(s,personal.club)} · ${personal.reason} 다른 구단에서 1년 신고 계약을 제안할 수 있습니다.`);
  }
}

export function needsContractUpgrade(s:GameState){
  if(s.careerMode!=="pro"||!s.proWorld)return false;
  const pending=s.proWorld.market;
  return s.proWorld.contractRulesVersion!==8||s.players.some(p=>p.professional&&(p.professional.assessments===undefined||p.professional.assessments.some(row=>row.war&&row.war.version!==3||row.firstTeam===undefined||row.secondOnly===undefined||row.firstGames===undefined)))
    ||needsSeasonRankings(s)||s.players.some(p=>p.professional?.assessments?.some(row=>row.year===s.calendar.seasonYear&&row.war&&row.score!==null&&(!row.seasonEvaluation||row.seasonEvaluation.postseason!==0||row.seasonEvaluation.national!==0||row.seasonEvaluation.honors!==0)))
    ||!!pending&&pending.kind==="released"&&!pending.settled&&pending.offers.some(offer=>releaseRecruitmentBlocked(getPlayer(s),offer.club,clubRoster(s,offer.club)));
}
export function upgradeContractRules(s:GameState){
  if(!needsContractUpgrade(s))return false;
  upgradeRawSeasonWar(s);
  for(const p of s.players){hydrateAssessments(s,p);if(p.professional?.nonRenewal&&!requiresDevelopmentalOffer(p,p.professional.nonRenewal.year))delete p.professional.nonRenewal;}
  const world=s.proWorld!;
  refreshSeasonEvaluations(s);
  if(world.seasonClosed)freezeSeasonRankings(s);
  if(world.seasonClosed&&!world.market?.settled)applySeasonExitPolicies(s);
  if(world.market&&!world.market.settled){
    const p=getPlayer(s);if(p.professional?.employment!=="active")world.market.kind="released";
    refreshOffers(s);
  }
  world.contractRulesVersion=8;return true;
}
