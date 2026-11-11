import {getPlayer,emptyRecord} from "./engine";
import {firstTeamRetention} from "./pro-assessment";
import {clubName,proNews,proNotice} from "./pro-world";
import type {GameState,Player} from "./types";

export function archiveProfessionalSeason(s:GameState,p:Player){
  const year=s.calendar.seasonYear;if(p.career.some(r=>r.year===year))return;
  p.career.push({year,grade:p.grade,careerMode:"pro",age:p.age,records:structuredClone(p.seasonStats),stats:{...p.stats},schoolId:p.teamId,
    schoolName:p.teamId<0?"무소속":clubName(s,p.teamId%10),byLevel:structuredClone(p.seasonByLevel!),postseason:structuredClone(p.seasonPostseason??emptyRecord()),byClub:structuredClone(p.seasonByClub??{})});
}

export function registerRetiredNumber(s:GameState,p:Player){
  const w=s.proWorld,pro=p.professional;if(!w||!pro)return;
  const existing=w.retiredNumbers?.find(row=>row.playerId===p.id);if(existing)return existing;
  const clubs=new Set(pro.service.map(row=>row.club));
  if(pro.firstClub>=0)clubs.add(pro.firstClub);
  if(pro.contract)clubs.add(pro.contract.club);
  for(const move of pro.movements){if(move.from!==null)clubs.add(move.from);if(move.to!==null)clubs.add(move.to);}
  const assessment=firstTeamRetention(p,w.year),number=p.jerseyNumber;
  if(clubs.size!==1||assessment.grade!=="S"||assessment.cumulative===null||!Number.isInteger(number)||number!<1||number!>99)return;
  const club=[...clubs][0];if(club<0||club>=10||w.retiredNumbers?.some(row=>row.club===club&&row.number===number))return;
  const honor={club,number:number!,playerId:p.id,playerName:p.name,date:s.date,score:assessment.cumulative};
  (w.retiredNumbers??=[]).push(honor);
  proNews(s,`${clubName(s,club)} · ${p.name}의 등번호 ${number}번을 영구결번으로 지정했습니다.`,`retired-number:${p.id}`);
  return honor;
}

export function retireProfessional(s:GameState,reason="시즌 결산에서 은퇴를 선택했습니다."){
  const w=s.proWorld!,p=getPlayer(s),pro=p.professional!;if(w.retired)return;
  archiveProfessionalSeason(s,p);const contract=pro.contract,forfeited=contract?Math.max(0,contract.endYear-w.year)*contract.salary:0;
  const honor=registerRetiredNumber(s,p);
  pro.employment="retired";pro.contract=null;p.teamId=-1;w.stage="retired";s.phase="ended";
  if(w.market){w.market.offers=[];w.market.settled=true;}
  delete w.resumeCampAfterAwards;
  const proYears=p.career.filter(row=>row.careerMode==="pro").length,clubs=new Set(pro.service.map(v=>v.club)).size;
  w.retired={date:s.date,reason,forfeited,summary:`${pro.entry==="developmental"?"신고선수":"지명 선수"}로 시작해 프로 ${proYears}시즌, ${clubs}개 구단의 기록을 남겼습니다.${p.proContract?.convertedDate?` ${p.proContract.convertedDate} 정식 전환을 이뤘습니다.`:""}${pro.firsts.debut?` 첫 1군 출전은 ${pro.firsts.debut}입니다.`:" 1군 정착을 향한 도전도 커리어에 남습니다."}`};
  proNotice(s,`retirement:${w.year}`,honor?`${clubName(s,honor.club)} ${honor.number}번 영구결번`:"나의 야구 커리어를 보관했습니다",reason+(honor?` 한 구단에서 이어 온 선수 생활과 누적 평가 S를 기려 ${p.name}의 ${honor.number}번을 영구결번으로 지정했습니다.`:"")+" 기록과 주요 사건을 확인한 뒤 새 선수를 만들 수 있습니다.");
}
