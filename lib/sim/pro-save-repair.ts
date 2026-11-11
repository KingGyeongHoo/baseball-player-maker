import {getPlayer,roleScore} from "./engine";
import {clubGamesShortage} from "./pro-assessment";
import {contractFor,proNotice} from "./pro-world";
import {proSquad} from "./pro-squads";
import {rosterGrade} from "../roster-grades";
import {releasePlayer} from "./pro-market";
import type {GameState} from "./types";

// Explicit, opt-in repair for an exported career. It never reruns old games,
// invents performance, refunds earned pay or changes the source state.
export function repairFarmShortageRetirement(input:GameState):GameState{
  const s=structuredClone(input),p=getPlayer(s),w=s.proWorld,pro=p.professional,year=s.calendar.seasonYear;
  if(!w||!pro||w.stage!=="retired"||!w.seasonClosed)throw new Error("시즌 종료 뒤 은퇴한 프로 저장만 복구할 수 있습니다.");
  const refused=pro.nonRenewal,retry=pro.developmentalRetry,row=pro.assessments?.find(r=>r.year===year);
  if(!refused||refused.year!==year||refused.kind!=="reserve"||!retry||retry.year>year||p.proContract?.status!=="developmental"||!row)
    throw new Error("구단 경기 부족으로 인한 마지막 신고 재도전 방출을 확인할 수 없습니다.");
  const club=refused.club,season=p.career.find(r=>r.year===year&&r.careerMode==="pro");
  const salary=pro.salaries.filter(r=>r.year===year&&r.club===club).at(-1)?.salary??row.salary;
  if(!salary||!season||season.schoolId===undefined||season.schoolId<10||season.schoolId%10!==club)
    throw new Error("당시 소속·연봉 원본 기록이 없어 복구하지 않았습니다.");
  p.teamId=season.schoolId;pro.contract=contractFor(club,year,salary,1,"released");pro.employment="active";
  if(!clubGamesShortage(s,p))throw new Error("실제 몰수 일정으로 확인되는 구단 경기 부족 시즌이 아닙니다.");
  const members=()=>s.players.filter(q=>q.teamId>=0&&q.teamId%10===club&&q.professional?.employment==="active");
  while(members().length>75||members().filter(q=>q.teamId>=10).length>45){
    const excess=members().filter(q=>q.id!==p.id&&q.teamId>=20&&q.professional!.contract&&q.professional!.contract!.endYear<=year)
      .sort((a,b)=>roleScore(a)-roleScore(b)||a.id.localeCompare(b.id))[0];
    if(!excess)throw new Error("복구 선수의 자리를 확보할 만료 계약이 없습니다. 원본은 변경하지 않았습니다.");
    releasePlayer(s,excess,"복구 선수 재등록을 위한 하위 군 만료 계약 정리",year+1);
  }
  row.clubGamesShortage=true;
  const values=(pro.assessments??[]).filter(r=>r.year<=year&&!r.clubGamesShortage&&r.score!==null).map(r=>r.score!);
  row.cumulative=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;row.cumulativeGrade=rosterGrade(row.cumulative,true);
  retry.deadlineYear=year+1;
  const latestRelease=[...pro.movements].reverse().find(r=>r.kind==="방출"&&r.date.startsWith(`${year}-`)&&r.from===club);
  if(latestRelease){latestRelease.kind="방출 보류";latestRelease.reason+=" · 구단 경기 부족 확인으로 재도전 기한 유예";}
  // The prior valid refusal remains history. The active, deferred trial gets
  // a renewal opportunity, without granting free-agent or regular status.
  delete pro.nonRenewal;
  const old=[...pro.movements].reverse().find(r=>r.kind==="방출"&&r.from!==null&&Number(r.date.slice(0,4))<year&&r.reason.includes("정식 전환"));
  if(old)pro.nonRenewal={year:Number(old.date.slice(0,4)),kind:"reserve",club:old.from!,reason:old.reason};
  pro.movements.push({date:s.date,from:club,to:club,kind:"복구",reason:"구단의 대규모 2군 몰수로 인한 마지막 방출·은퇴 보류, 재도전 1시즌 연장"});
  if(s.postSchool?.pro){s.postSchool.pro.club=club;s.postSchool.pro.level=proSquad(p.teamId)!;}
  w.stage="summary";delete w.retired;delete w.market;delete w.stove;delete w.resumeCampAfterAwards;
  s.phase="ended";delete s.careerNotice;s.noticeQueue=[];s.careerEvent=null;delete s.pendingEventOutcome;
  proNotice(s,`farm-repair:${year}`,"구단 경기 부족으로 선수 생활을 복구했습니다",`${year}년 실제 경기 기록과 수령액은 보존했습니다. 마지막 방출과 은퇴를 보류하고 신고 재도전 기한을 ${year+1}년까지 연장했습니다. 스토브리그에서 다음 시즌 계약을 결정할 수 있습니다.`);
  return s;
}
