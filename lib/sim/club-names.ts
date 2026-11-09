import type {GameState} from "./types";

export const proClubNames=["서울 베어스","서울 트윈스","고양 히어로즈","인천 랜더스","수원 위즈","대전 이글스","광주 타이거즈","대구 라이온즈","창원 다이노스","부산 자이언츠"];
const legacyNames=["서울 파이오니어스","부산 웨이브스","인천 마리너스","대구 레드윙스","광주 타이탄스","대전 스파크스","수원 위저즈","창원 다이노스","청주 이글스","전주 라이온스"];
export function proTeamName(teamId:number){return `${proClubNames[teamId%10]} ${["1군","2군","잔류군(3군)","육성선수"][Math.floor(teamId/10)]??""}`.trim();}

// Names change once; numeric club/team IDs, rosters, records and RNG stay intact.
// The version is essential because one old name also exists at a new index.
export function syncProClubNames(s:GameState){
  if(s.proClubNamesVersion===1)return false;
  const rename=(name:string)=>{const id=legacyNames.indexOf(name);return id<0?name:proClubNames[id];};
  for(const picks of [s.draft,s.postSchool?.collegeDraft,...(s.proWorld?.seasons.map(season=>season.draft)??[])])for(const pick of picks??[])pick.club=rename(pick.club);
  if(s.draftOutcome?.offer)s.draftOutcome.offer.club=rename(s.draftOutcome.offer.club);
  if(s.careerMode==="pro")for(const team of s.teams)if(team.id>=0&&team.id<20){team.name=proTeamName(team.id);team.shortName=team.name;}
  for(const p of [...s.players,...(s.proWorld?.archive??[])]){
    for(const row of p.career)if(row.careerMode==="pro"&&typeof row.schoolId==="number"&&row.schoolId>=0&&row.schoolId<20)row.schoolName=proTeamName(row.schoolId);
    if(p.evaluationHistory)p.evaluationHistory=p.evaluationHistory.map(row=>row.mode==="pro"&&row.teamId>=0&&row.teamId<20?{...row,teamName:proTeamName(row.teamId)}:row);
  }
  s.proClubNamesVersion=1;
  return true;
}
