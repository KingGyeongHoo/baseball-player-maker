import type {GameState} from "./types";

export const proClubNames=["서울 베어스","서울 트윈스","고양 히어로즈","인천 랜더스","수원 위즈","대전 이글스","광주 타이거즈","대구 라이온즈","창원 다이노스","부산 자이언츠"];
const legacyNames=["서울 파이오니어스","부산 웨이브스","인천 마리너스","대구 레드윙스","광주 타이탄스","대전 스파크스","수원 위저즈","창원 다이노스","청주 이글스","전주 라이온스"];
export function proTeamName(teamId:number){return `${proClubNames[teamId%10]} ${["","2군","잔류군(3군)","육성선수"][Math.floor(teamId/10)]??""}`.trim();}
export const proLevelPrefix=(level:'first'|'second')=>level==='second'?'2군 ':'';
export function mainLeagueName(text:string){
  for(const club of proClubNames)text=text.replaceAll(`${club} 1군`,club);
  return text.replace(/1군 (?=정규리그|정규시즌|와일드카드|준플레이오프|플레이오프|한국시리즈|포스트시즌|올스타|미스터 올스타)/g,'');
}

// Names change once; numeric club/team IDs, rosters, records and RNG stay intact.
// The version is essential because one old name also exists at a new index.
export function syncProClubNames(s:GameState){
  if(s.proClubNamesVersion===2)return false;
  const legacy=s.proClubNamesVersion!==1;
  const rename=(name:string)=>{const id=legacy?legacyNames.indexOf(name):-1;return id<0?name:proClubNames[id];};
  for(const picks of [s.draft,s.postSchool?.collegeDraft,...(s.proWorld?.seasons.map(season=>season.draft)??[])])for(const pick of picks??[])pick.club=rename(pick.club);
  if(s.draftOutcome?.offer)s.draftOutcome.offer.club=rename(s.draftOutcome.offer.club);
  if(s.careerMode==="pro")for(const team of s.teams)if(team.id>=0&&team.id<40){team.name=proTeamName(team.id);team.shortName=team.name;}
  for(const p of [...s.players,...(s.proWorld?.archive??[])]){
    for(const row of p.career)if(row.careerMode==="pro"&&typeof row.schoolId==="number"&&row.schoolId>=0&&row.schoolId<40)row.schoolName=proTeamName(row.schoolId);
    if(p.evaluationHistory)p.evaluationHistory=p.evaluationHistory.map(row=>row.mode==="pro"&&row.teamId>=0&&row.teamId<20?{...row,teamName:proTeamName(row.teamId)}:row);
  }
  for(const competition of s.calendar?.competitions??[])competition.name=mainLeagueName(competition.name);
  for(const row of s.proWorld?.news??[])row.text=mainLeagueName(row.text);
  for(const entry of s.nationalTeams??[])for(const member of entry.roster)member.team=mainLeagueName(member.team);
  for(const season of s.proWorld?.seasons??[])for(const award of season.awards??[])award.kind=mainLeagueName(award.kind);
  for(const notice of [s.careerNotice,...s.noticeQueue??[]])if(notice){notice.title=mainLeagueName(notice.title);notice.message=mainLeagueName(notice.message);}
  if(s.careerEvent){s.careerEvent.title=mainLeagueName(s.careerEvent.title);s.careerEvent.description=mainLeagueName(s.careerEvent.description);}
  s.proClubNamesVersion=2;
  return true;
}
