import type {LeaderField} from '../league-leaders';

export const titleNames:Record<LeaderField,Record<string,string>>={batting:{avg:'타격왕',H:'안타왕',HR:'홈런왕',RBI:'타점왕',R:'득점왕',SB:'도루왕',obp:'출루율왕',slg:'장타율왕'},pitching:{wins:'다승왕',era:'평균자책점왕',SO:'탈삼진왕',winRate:'승률왕',holds:'홀드왕',saves:'세이브왕'}};
const recordNames:Record<LeaderField,Record<string,string>>={batting:{avg:'타율',H:'안타',HR:'홈런',RBI:'타점',R:'득점',SB:'도루',obp:'출루율',slg:'장타율'},pitching:{wins:'승',era:'평균자책점',SO:'탈삼진',winRate:'승률',holds:'홀드',saves:'세이브'}};
export function individualTitleName(row:{field?:LeaderField;metric?:string;label?:string}){
  if(row.metric)return row.field?titleNames[row.field][row.metric]:titleNames.batting[row.metric]??titleNames.pitching[row.metric];
  return individualTitleFromKind(row.label??'');
}
export function individualTitleFromKind(kind:string){
  for(const field of ['batting','pitching'] as const)for(const [id,name] of Object.entries(titleNames[field])){
    if(kind===name||kind===recordNames[field][id])return name;
  }
}
