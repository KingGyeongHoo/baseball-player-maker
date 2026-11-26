import {archiveProfessionalSeason,retireProfessional,registerRetirementFarewell,registerRetiredNumber} from './pro-retirement';
import {proNews} from './pro-world';
import {archiveCareerSeason} from './pro-career';
import type {GameState} from './types';
export function settleInjuryRetirements(s:GameState){
  for(const p of s.players){
    const retirement=p.injuryRetirement;if(!retirement||retirement.handled)continue;
    if(p.professional&&s.proWorld){
      if(p.professional.employment==='retired'){retirement.handled=true;continue;}
      // Unavailability starts immediately; career/contract settlement waits for
      // the complete season and every award notice, including on save reload.
      if(!s.proWorld.seasonClosed)continue;
      if(p.id===s.playerId)s.proWorld.pendingRetirement={year:s.proWorld.year,reason:retirement.reason};
      const season=s.proWorld.seasons.find(row=>row.year===s.proWorld!.year);
      if(!season||!season.awardsCeremony?.presentedAt&&(season.awardsCeremony||season.awards.length||season.individualAwards?.length))continue;
      if(s.careerNotice||s.careerEvent||s.pendingEventOutcome||s.noticeQueue?.length)continue;
      retirement.handled=true;
      if(p.id===s.playerId)retireProfessional(s,retirement.reason);
      else {
        archiveProfessionalSeason(s,p);const eligibility=registerRetirementFarewell(s,p);registerRetiredNumber(s,p,eligibility);
        p.professional.movements.push({date:s.date,from:p.teamId<0?null:p.teamId%10,to:null,kind:'은퇴',reason:retirement.reason});
        p.professional.employment='retired';p.professional.contract=null;p.teamId=-1;
        proNews(s,`${p.name} · 부상으로 은퇴 · ${retirement.reason}`,`injury-retired:${p.id}`);
      }
    }else if(p.id===s.playerId){
      if(s.phase!=='ended'&&!(s.careerMode===undefined&&p.grade<3&&s.date>=s.calendar.seasonEnd))continue;
      if(s.careerNotice||s.careerEvent||s.pendingEventOutcome)continue;
      retirement.handled=true;
      archiveCareerSeason(s,p);
      s.phase='ended';s.careerNotice={id:`injury-retired:${p.id}`,date:s.date,kind:'pro',title:'부상으로 선수 생활을 마칩니다',message:`${retirement.reason} 통산 기록과 부상 이력을 커리어에 보존합니다.`};
    }
  }
}
