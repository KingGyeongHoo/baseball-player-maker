import type {GameState,Player} from './types';
import {contractFor} from './pro-world';

export const conversionYear=(p:Player)=>p.proContract?.status==='regular'&&p.proContract.convertedDate?Number(p.proContract.convertedDate.slice(0,4)):undefined;
function falseConversionRelease(s:GameState,p:Player){
  const pro=p.professional,year=conversionYear(p),denied=pro?.nonRenewal;
  if(!pro||pro.employment!=='freeAgent'||pro.contract||year!==s.calendar.seasonYear||!s.proWorld?.seasonClosed||!['summary','offseason'].includes(s.proWorld.stage)||denied?.year!==year||denied.kind!=='reserve')return;
  const row=pro.assessments?.find(r=>r.year===year),last=pro.movements.at(-1);
  if(!row?.salary||!last||last.kind!=='방출'||last.from!==denied.club||last.reason!==denied.reason||!last.reason.includes('잔류군·신고선수'))return;
  if(pro.guarantees?.some(r=>r.club===denied.club&&r.year>year!))return;
  const members=s.players.filter(q=>q.teamId>=0&&q.teamId%10===denied.club&&q.professional?.employment==='active');
  if(members.length>=75||members.filter(q=>q.teamId>=10).length>=45)return;
  return {year:year!,club:denied.club,salary:row.salary,last};
}
export function needsConversionRepair(s:GameState){
  return s.careerMode==='pro'&&!!s.proWorld&&!s.matchProgress&&!s.weekProgress&&s.players.some(p=>p.proContract?.status==='regular'&&p.professional?.employment==='active'&&p.teamId>=30||!!falseConversionRelease(s,p));
}
export function repairConversionRegistrations(s:GameState){
  if(s.matchProgress)return false;
  let changed=false;
  for(const p of s.players){
    const repair=falseConversionRelease(s,p);
    if(repair){const pro=p.professional!;pro.employment='active';pro.contract=contractFor(repair.club,repair.year,repair.salary);p.teamId=repair.club+20;pro.lastSquad='third';delete pro.nonRenewal;repair.last.kind='방출 취소';repair.last.reason+=' · 정식 전환 등록 오류 복구';pro.movements.push({date:s.date,from:repair.club,to:repair.club,kind:'복구',reason:'정식 전환한 해의 잘못된 잔류 누적 방출을 취소했습니다.'});if(p.id===s.playerId&&s.postSchool?.pro){s.postSchool.pro.club=repair.club;s.postSchool.pro.level='third';}changed=true;}
    if(p.proContract?.status!=='regular'||p.professional?.employment!=='active'||p.teamId<30)continue;
    p.teamId=p.teamId%10+20;changed=true;
    if(p.professional.lastSquad==='developmental')p.professional.lastSquad='third';
    if(p.id===s.playerId&&s.postSchool?.pro)s.postSchool.pro.level='third';
  }
  if(changed&&s.proWorld?.goal==='정식 선수 전환'&&s.players.find(p=>p.id===s.playerId)?.proContract?.status==='regular')s.proWorld.goal='1군 승격';
  return changed;
}
