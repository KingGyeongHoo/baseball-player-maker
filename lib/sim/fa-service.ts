import type {ProfessionalPlayer} from './pro-types';

export function qualifiedFaSeasons(pro:ProfessionalPlayer){
  return pro.faSeasons??(pro.assessments??[]).filter(row=>
    Object.values(row.honorRegistration?.firstDaysByClub??{}).reduce((sum,days)=>sum+days,0)>=150
  ).map(row=>row.year);
}

export function settleFaService(pro:ProfessionalPlayer,year:number){
  const years=new Set(qualifiedFaSeasons(pro));
  if(pro.registration.year===year){
    if(pro.registration.days>=150)years.add(year);
    else years.delete(year);
  }
  pro.faSeasons=[...years].sort((a,b)=>a-b);
  if(!pro.lastFaTerm&&pro.contract?.source==='fa'){
    pro.lastFaTerm={start:pro.contract.startYear,end:pro.contract.endYear};
  }
  const term=pro.lastFaTerm;
  if(!term){pro.faEligible=pro.faSeasons.filter(y=>y<=year).length>=8;return;}
  const complete=pro.faSeasons.filter(y=>y>=term.start&&y<=term.end).length===term.end-term.start+1;
  const extra=pro.faSeasons.filter(y=>y>term.end&&y<=year).length;
  pro.faEligible=year>=term.end&&(complete||extra>=2)&&!(pro.contract&&pro.contract.endYear>year);
}

export function faServiceText(pro:ProfessionalPlayer){
  if(pro.faEligible)return 'FA 자격 취득';
  const years=qualifiedFaSeasons(pro),term=pro.lastFaTerm;
  const progress=!term?`첫 FA 인정 시즌 ${years.length}/8`:
    pro.registration.year<=term.end?`FA 계약 ${term.start}~${term.end}년`:`재FA 추가 인정 시즌 ${years.filter(y=>y>term.end).length}/2`;
  return `${progress} · 올해 1군 등록 ${pro.registration.days}/150일`;
}
