import {careerHonors,lifetimeRecords,type CareerHonor} from "./career-summary";
import {getPlayer} from "./sim/engine";
import {clubName} from "./sim/pro-world";
import {allstarDates} from "./sim/pro-allstar-calendar";
import type {GameState} from "./sim/types";

export type CareerMilestone={id:string;date:string;dateLabel:string;title:string;detail:string;kind:"school"|"entry"|"record"|"allstar"|"award"|"national"|"transfer"|"retirement"};
const first=(rows:CareerHonor[])=>[...rows].sort((a,b)=>a.year-b.year||a.title.localeCompare(b.title,"ko"))[0];
const nationalSelection=(row:CareerHonor)=>["청소년 국가대표","WBC 국가대표","성인 대표팀 합동훈련"].includes(row.title);

export function retirementSummary(state:GameState){
  const player=getPlayer(state),pro=player.professional!,world=state.proWorld!,retired=world.retired;
  const retiredDate=retired?.date??state.date,year=Number(retiredDate.slice(0,4)),honors=careerHonors(state);
  const visible=(rows:CareerHonor[])=>rows.filter(row=>row.year<=year);
  const allstars=visible(honors.allstar).filter(row=>row.title.endsWith(" 올스타")&&!row.title.includes("미스터"));
  const youthNationals=visible(honors.national).filter(row=>row.title==="청소년 국가대표");
  const nationals=visible(honors.national).filter(row=>nationalSelection(row)&&row.title!=="청소년 국가대표");
  const mvps=visible(honors.individual).filter(row=>row.title==="시즌 MVP");
  const awards=[...visible(honors.gold),...visible(honors.individual).filter(row=>!["시즌 MVP","영구결번"].includes(row.title)),
    ...visible(honors.allstar).filter(row=>row.title.endsWith("미스터 올스타")),...visible(honors.national).filter(row=>row.title.endsWith("MVP"))];
  const milestones:CareerMilestone[]=[];
  const add=(id:string,date:string,title:string,detail:string,kind:CareerMilestone["kind"],dateLabel=date.replaceAll("-","."))=>{
    if(date<=retiredDate)milestones.push({id,date,dateLabel,title,detail,kind});
  };
  const school=player.career.filter(row=>!row.careerMode).sort((a,b)=>a.year-b.year)[0];
  if(pro.entry!=="direct"){
    const entered=school?school.year-school.grade+1:state.postSchool?state.postSchool.graduationYear-2:undefined;
    if(entered!==undefined)add("school",`${entered}-03-01`,"고교 입학",school?.schoolName??state.postSchool?.graduationSchool??"고교 야구부","school",`${entered}년`);
  }
  const college=player.career.filter(row=>row.careerMode==="college").sort((a,b)=>a.year-b.year)[0];
  if(college)add("college",`${college.year}-03-01`,"대학 진학",college.schoolName??"대학 야구부","school",`${college.year}년`);
  const pick=[...state.draft,...state.postSchool?.collegeDraft??[]].find(row=>row.playerId===player.id);
  if(pick&&pro.entry!=="direct"){
    const draftYear=pro.rookieYear-1;
    add("entry",`${draftYear}-09-01`,"프로 지명",`${pick.club} · ${pick.round}라운드 · 전체 ${pick.overall}순위`,"entry",`${draftYear}년`);
  }else{
    const joined=pro.movements.find(row=>row.kind==="입단")?.date??player.proContract?.joinedDate??`${pro.rookieYear}-02-01`;
    add("entry",joined,"프로 입단",`${clubName(state,pro.firstClub)} · ${pro.entry==="direct"?"프로 직접 시작":pro.entry==="developmental"?"신고선수 입단":pro.entry==="tryout"?"입단 테스트 합격":"프로 선수 생활 시작"}`,"entry");
  }
  const labels={debut:"첫 1군 출전",start:"첫 선발 출전",hit:"첫 안타",homeRun:"첫 홈런",strikeout:"첫 탈삼진"};
  for(const key of Object.keys(labels) as (keyof typeof labels)[]){const date=pro.firsts[key];if(date)add(`first-${key}`,date,labels[key],"1군 무대에 남긴 첫 기록","record");}
  const allstar=first(allstars);
  if(allstar){const season=[...world.seasons.flatMap(row=>row.allstar?[row.allstar]:[]),...(world.allstar?[world.allstar]:[])].find(row=>row.year===allstar.year);
    add("first-allstar",season?.finalizedAt??`${allstar.year}-06-30`,"첫 올스타 선정",`${allstar.title}${allstar.detail?` · ${allstar.detail}`:""}`,"allstar",`${allstar.year}년`);
  }
  const awardTime=(row:CareerHonor)=>{
    const season=world.seasons.find(season=>season.year===row.year);
    if(row.title.endsWith("미스터 올스타")){const level=row.title.startsWith("1군")?"first":"second";return season?.allstar?.levels[level].game?.date??allstarDates(row.year)[level];}
    if(row.title.endsWith("MVP")&&row.title!=="시즌 MVP")return state.careerEventHistory?.find(event=>["P08","WBC01"].includes(event.definitionId)&&Number(event.date.slice(0,4))===row.year)?.date;
    return honors.gold.includes(row)||row.title==="시즌 MVP"?season?.awardsCeremony?.presentedAt??season?.endDate:season?.endDate;
  };
  const award=[...awards,...mvps].sort((a,b)=>(awardTime(a)??`${a.year}-09-01`).localeCompare(awardTime(b)??`${b.year}-09-01`)||a.title.localeCompare(b.title,"ko"))[0];
  if(award){const date=awardTime(award);add("first-award",date??`${award.year}-09-01`,"첫 수상",`${honors.gold.includes(award)?"골든글러브 · ":""}${award.title}`,"award",date?date.replaceAll("-","."):`${award.year}년`);}
  const addNational=(national:CareerHonor|undefined,milestoneId:string,title:string)=>{if(national){
    const id=national.title==="청소년 국가대표"?"P08":national.title==="WBC 국가대표"?"WBC01":"PE27";
    const event=state.careerEventHistory?.find(row=>row.definitionId===id&&Number(row.date.slice(0,4))===national.year);
    const date=event?.date??(id==="WBC01"?state.proEvents?.wbc?.[national.year]?.evaluatedAt:state.proEvents?.national[national.year]?.invitationDate)??`${national.year}-09-01`;
    add(milestoneId,date,title,national.title,"national",event?date.replaceAll("-","."):`${national.year}년`);
  }};
  addNational(first(youthNationals),"first-youth-national","첫 청소년대표 발탁");
  addNational(first(nationals),"first-national","첫 국가대표 발탁");
  for(const [index,move]of pro.movements.entries()){
    if(!["FA 잔류","FA 이적","트레이드","계약","방출"].includes(move.kind))continue;
    const route=move.from===move.to?clubName(state,move.to):move.from===null?clubName(state,move.to):`${clubName(state,move.from)} → ${clubName(state,move.to)}`;
    add(`move-${index}`,move.date,move.kind,route,"transfer");
  }
  if(retired)add("retirement",retired.date,"은퇴",`${player.age??"—"}세 · 프로 ${new Set(player.career.filter(row=>row.careerMode==="pro").map(row=>row.year)).size}시즌의 선수 생활을 마무리했습니다.`,"retirement");
  const order={school:0,entry:1,record:2,allstar:3,award:4,national:5,transfer:6,retirement:7};
  milestones.sort((a,b)=>a.date.localeCompare(b.date)||order[a.kind]-order[b.kind]||a.id.localeCompare(b.id));
  return {records:lifetimeRecords(player,state.calendar.seasonYear),milestones,counts:{allstar:allstars.length,individual:awards.length,mvp:mvps.length,national:nationals.length}};
}
