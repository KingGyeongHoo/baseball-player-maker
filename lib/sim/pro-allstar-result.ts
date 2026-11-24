import type {AllstarLeague,AllstarLevel,AllstarMvp} from './pro-allstar-types';
import {singleGameWar,type ProWarContext} from './pro-war';

export function allstarMvps(entry:AllstarLeague){
  return entry.mvps??(entry.mvp?[entry.mvp]:[]);
}

export function selectAllstarMvps(entry:AllstarLeague,level:AllstarLevel,context:ProWarContext):AllstarMvp[]{
  const game=entry.game;
  if(game?.status!=='completed')return [];
  const candidates=(['blue','white'] as const).flatMap(side=>entry[side].roster.flatMap(member=>{
    const {playerId,name}=member,record=game.boxScore[playerId];
    if(!record||record.batting.PA<=0&&record.pitching.BF<=0)return [];
    return [{playerId,name,side,merit:singleGameWar(record,context,level),record}];
  }));
  const bestWar=Math.max(-Infinity,...candidates.map(row=>row.merit));
  const compare=(a:typeof candidates[number],b:typeof candidates[number])=>
    b.record.batting.HR-a.record.batting.HR||b.record.pitching.SO-a.record.pitching.SO||
    b.record.batting.RBI-a.record.batting.RBI||b.record.batting.H-a.record.batting.H;
  const leaders=candidates.filter(row=>bestWar-row.merit<=1e-9).sort(compare);
  return leaders.filter(row=>compare(row,leaders[0])===0).map(({playerId,name,side,merit})=>({playerId,name,side,merit}));
}
