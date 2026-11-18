import {reservedJerseyNumbers} from '../permanent-retired-numbers';
import {getPlayer,emptyRecord} from "./engine";
import {retirementEligibility} from './retirement-honors';
import {meetsCareerRegistration} from './pro-career-evaluation';
import {clubName,proNews,proNotice} from "./pro-world";
import type {GameState,Player} from "./types";

export function veteranRetirementReason(p:Player,year:number){
  const age=p.age??19,pro=p.professional;
  if(age<36||!pro||pro.employment==='retired')return;
  const rows=pro.assessments??[];
  const latest=rows.find(row=>row.year===year);
  if(!latest)return;
  if(age>=42){
    if(latest.seasonRank?.level!=='first'||!['S','A'].includes(latest.seasonRank.grade)||!meetsCareerRegistration(latest.honorRegistration)){
      return `${age}세 시즌에 1군 등록 기준과 S·A 시즌 평가를 함께 충족하지 못해 은퇴했습니다.`;
    }
    return;
  }
  const required=age>=40?2:3;
  const lowestPassingGrade=age>=40?'B':'C';
  const poorGrades=age>=40?['C','D','E','F']:['D','E','F'];
  for(let offset=0;offset<required;offset++){
    const row=rows.find(row=>row.year===year-offset);
    if(!row)return;
    const low=poorGrades.includes(row.seasonRank?.grade??row.grade);
    if(!low&&meetsCareerRegistration(row.honorRegistration))return;
  }
  return `${age}세 시즌까지 ${required}시즌 연속으로 1군 등록 기준을 충족하지 못했거나 시즌 평가가 ${lowestPassingGrade}에 미치지 못했습니다.`;
}

export function archiveProfessionalSeason(s:GameState,p:Player){
  const year=s.calendar.seasonYear;if(p.career.some(r=>r.year===year))return;
  p.career.push({year,grade:p.grade,careerMode:"pro",age:p.age,records:structuredClone(p.seasonStats),stats:{...p.stats},schoolId:p.teamId,
    schoolName:p.teamId<0?"무소속":clubName(s,p.teamId%10),byLevel:structuredClone(p.seasonByLevel!),postseason:structuredClone(p.seasonPostseason??emptyRecord()),farmPostseason:structuredClone(p.seasonFarmPostseason??emptyRecord()),spring:structuredClone(p.seasonSpring??emptyRecord()),byClub:structuredClone(p.seasonByClub??{})});
}

export function registerRetiredNumber(s:GameState,p:Player){
  const w=s.proWorld,pro=p.professional;if(!w||!pro)return;
  const existing=w.retiredNumbers?.find(row=>row.playerId===p.id);if(existing)return existing;
  const eligibility=retirementEligibility(s,p),number=p.jerseyNumber,club=eligibility.club;
  if(!eligibility.retiredNumber||club===undefined||eligibility.score===null||!Number.isInteger(number)||number!<1||number!>99||reservedJerseyNumbers(s,club).has(number!))return;
  const honor={club,number:number!,playerId:p.id,playerName:p.name,date:s.date,score:eligibility.score,grade:eligibility.grade};
  (w.retiredNumbers??=[]).push(honor);
  proNews(s,`${clubName(s,club)} · ${p.name}의 등번호 ${number}번을 영구결번으로 지정했습니다.`,`retired-number:${p.id}`);
  return honor;
}

export function registerRetirementFarewell(s:GameState,p:Player){
  const w=s.proWorld!,eligibility=retirementEligibility(s,p),tour=eligibility.tour;
  if(eligibility.club!==undefined&&eligibility.score!==null&&(eligibility.ceremony||tour)){
    const honors=w.retirementHonors??=[];
    if(!honors.some(row=>row.playerId===p.id))honors.push({club:eligibility.club,playerId:p.id,playerName:p.name,date:s.date,score:eligibility.score,grade:eligibility.grade,seasons:eligibility.seasons,consecutive:eligibility.consecutive,ceremony:eligibility.ceremony,tour:!!tour});
    if(eligibility.ceremony)proNews(s,`${clubName(s,eligibility.club)} · ${p.name}의 은퇴식을 열었습니다.`,`retirement-ceremony:${p.id}`);
    if(tour)proNews(s,`${clubName(s,eligibility.club)} · ${p.name}의 은퇴 투어 예우를 확정했습니다.`,`retirement-tour:${p.id}`);
  }
  return eligibility;
}
export function retireProfessional(s:GameState,reason="시즌 결산에서 은퇴를 선택했습니다."){
  const w=s.proWorld!,p=getPlayer(s),pro=p.professional!;if(w.retired)return;
  archiveProfessionalSeason(s,p);const contract=pro.contract,forfeited=contract?Math.max(0,contract.endYear-w.year)*contract.salary:0;
  const eligibility=registerRetirementFarewell(s,p),honor=registerRetiredNumber(s,p);
  if(p.teamId>=0)pro.movements.push({date:s.date,from:p.teamId%10,to:null,kind:"은퇴",reason});
  pro.employment="retired";pro.contract=null;p.teamId=-1;w.stage="retired";s.phase="ended";
  if(w.market){w.market.offers=[];w.market.settled=true;}
  delete w.resumeCampAfterAwards;
  const proYears=p.career.filter(row=>row.careerMode==="pro").length,clubs=new Set(pro.service.map(v=>v.club)).size;
  w.retired={date:s.date,reason,forfeited,summary:`${pro.entry==="developmental"?"신고선수":"지명 선수"}로 시작해 프로 ${proYears}시즌, ${clubs}개 구단의 기록을 남겼습니다.${p.proContract?.convertedDate?` ${p.proContract.convertedDate} 정식 전환을 이뤘습니다.`:""}${pro.firsts.debut?` 첫 1군 출전은 ${pro.firsts.debut}입니다.`:" 1군 정착을 향한 도전도 커리어에 남습니다."}`};
  proNotice(s,`retirement:${w.year}`,honor?`${clubName(s,honor.club)} ${honor.number}번 영구결번`:eligibility.ceremony?`${p.name}의 은퇴식`:"나의 야구 커리어를 보관했습니다",reason+(honor?` 한 구단에서 이어 온 선수 생활을 기려 ${p.name}의 ${honor.number}번을 영구결번으로 지정했습니다.`:eligibility.ceremony?` ${clubName(s,eligibility.club!)}에서 함께한 시간을 기리는 은퇴식을 열었습니다.`:"")+" 기록과 주요 사건을 확인한 뒤 새 선수를 만들 수 있습니다.");
}
