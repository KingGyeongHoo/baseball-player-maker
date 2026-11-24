import {clamp,hash,random,roleScore} from './engine';
import {qualifiedFaSeasons,settleFaService} from './fa-service';
import type {GameState,Player} from './types';

export function needsNpcFaHistoryUpgrade(s:GameState){
  return s.players.some(p=>p.id!==s.playerId&&p.professional&&p.professional.employment!=='retired'&&!p.professional.faHistorySeeded);
}

export function seedNpcFaHistory(s:GameState,p:Player){
  const pro=p.professional;
  if(p.id===s.playerId||!pro||pro.faHistorySeeded||pro.employment==='retired')return;
  pro.faHistorySeeded=true;
  if(pro.entry!=='veteran')return;
  // Only fill the years before this NPC entered the simulated world.
  const arrival=Math.min(s.calendar.seasonYear,...pro.service.map(row=>row.from),...(pro.assessments??[]).map(row=>row.year),...pro.movements.filter(row=>row.kind==='입단').map(row=>Number(row.date.slice(0,4))));
  const years=new Set(qualifiedFaSeasons(pro));
  const probability=.08+.84*clamp((roleScore(p)-45)/40,0,1);
  let added=0;
  for(let year=pro.rookieYear;year<arrival;year++){
    const source={rngStates:{...s.rngStates,generation:hash(`${s.seed}:npc-fa-history:${p.id}:${year}`)}};
    const chance=Math.max(0,probability-(year===pro.rookieYear ? .15 : year===pro.rookieYear+1 ? .07 : 0));
    if(random(source,'generation')<chance&&!years.has(year)){years.add(year);added++;}
  }
  if(!added)return;
  pro.faSeasons=[...years].sort((a,b)=>a-b);
  pro.faDays+=added*150;
  settleFaService(pro,s.calendar.seasonYear);
}
