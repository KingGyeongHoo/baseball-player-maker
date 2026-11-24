import {proNotice} from './pro-world';
import type {GameState,Player,Position,ProSquad} from './types';

type StovePlayer={id:string;name:string;position:Position};
export type StoveMove=StovePlayer&{club:number;direction:'joined'|'released'|'traded'|'retired'|'fa';reason:string;date?:string;otherClub?:number;exchange?:StovePlayer;from?:number;to?:number;retiredNumber?:number;squad?:ProSquad};
export type StoveReport={club:number;moves:StoveMove[];tradeOnly?:true};

function arrivalLabel(m:NonNullable<Player['professional']>['movements'][number],p?:Player){
  if(m.kind==='입단'){
    if(m.reason==='draft'||m.reason==='collegeDraft')return '드래프트';
    if(m.reason==='developmental')return '신고';
  }
  if(m.kind==='계약'&&(m.registration==='developmental'||m.reason.includes('신고')))return '신고';
  if(m.kind==='계약'&&m.from===null&&p?.professional?.movements.some(row=>row.kind==='방출'&&row.date<=m.date))return '신규계약';
}

export function clubStoveMoves(rows:StoveMove[],club:number,players?:Player[]){
  const unique=new Map<string,StoveMove>();
  let playerIndex:Map<string,Player>|undefined;
  const findPlayer=(id:string)=>{
    if(!players)return;
    playerIndex??=new Map(players.map(p=>[p.id,p]));
    return playerIndex.get(id);
  };
  for(const saved of rows){
    if(saved.club!==club)continue;
    const row=saved.direction==='released'&&!saved.squad?{...saved,squad:findPlayer(saved.id)?.professional?.lastSquad}:saved;
    const key=row.direction==='traded'?`trade:${row.date}:${row.id}:${row.otherClub}:${row.exchange?.id}`:`${row.direction}:${row.id}`;
    if((row.direction==='joined'||row.direction==='released')&&['FA','FA 이적'].includes(row.reason)){
      const m=findPlayer(row.id)?.professional?.movements.findLast(m=>m.kind==='FA 이적'&&(row.direction==='joined'?m.to:m.from)===club);
      unique.set(`fa:${row.id}`,{...row,direction:'fa',from:m?.from??(row.direction==='released'?club:undefined),to:m?.to??(row.direction==='joined'?club:undefined)});
    }
    else if(row.direction==='joined'&&!['드래프트','신고','신규계약','FA','트레이드'].includes(row.reason)){
      const p=findPlayer(row.id),movement=p?.professional?.movements.findLast(m=>m.kind===row.reason&&m.to===club);
      const reason=movement&&arrivalLabel(movement,p);
      if(reason)unique.set(key,{...row,reason});
    }else unique.set(key,row);
  }
  return [...unique.values()];
}

export function stovePlayerMoves(p:Player,start:string,end:string):StoveMove[]{
  const moves:StoveMove[]=[];
  for(const m of p.professional?.movements??[]){
    if(m.date<start||m.date>end)continue;
    const player={id:p.id,name:p.name,position:p.position};
    if((m.kind==='FA 이적'||m.kind==='FA 잔류')&&m.from!==null&&m.to!==null){
      for(const club of new Set([m.from,m.to]))moves.push({...player,club,direction:'fa',from:m.from,to:m.to,reason:m.kind});
      continue;
    }
    if(m.from===m.to)continue;
    if(m.kind==='방출'&&m.from!==null)moves.push({...player,club:m.from,direction:'released',reason:m.reason,date:m.date,squad:m.squad??p.professional?.lastSquad});
    else if(m.kind==='은퇴'&&m.from!==null)moves.push({...player,club:m.from,direction:'retired',reason:m.reason});
    else if(m.kind==='트레이드'&&m.from!==null&&m.to!==null){
      moves.push({...player,club:m.from,direction:'traded',date:m.date,otherClub:m.to,exchange:m.exchange,reason:m.kind});
    }
    else if(m.to!==null){
      const reason=arrivalLabel(m,p);
      if(reason)moves.push({...player,club:m.to,direction:'joined',reason});
    }
  }
  return moves;
}

export function reconcileStoveReport(s:GameState,report:StoveReport,end=s.date):StoveReport{
  const year=s.proWorld?.year,start=s.proWorld?.seasons.find(row=>row.year===year)?.endDate;
  if(!start||start>end)return report;
  const arrivals=s.players.flatMap(p=>stovePlayerMoves(p,start,end)).filter(row=>row.direction==='joined');
  return {...report,moves:clubStoveMoves([...report.moves,...arrivals],report.club,s.players)};
}

export function showStoveReport(s:GameState,stage:'review'|'final',club:number){
  const w=s.proWorld!,year=w.year,start=w.seasons.find(season=>season.year===year)?.endDate??(stage==='review'?s.date:w.stove?.openedAt??s.date);
  const rows=[...(w.departedStoveMoves??[]),...s.players.flatMap(p=>stovePlayerMoves(p,start,s.date))];
  const moves=clubStoveMoves(rows,club,s.players);
  for(const move of moves)if(move.direction==='retired'){
    move.retiredNumber=w.retiredNumbers?.find(row=>row.club===club&&row.playerId===move.id)?.number;
  }
  for(const move of moves)if(move.direction==='traded'&&!move.exchange){
    const peers=rows.filter(row=>row.direction==='traded'&&row.date===move.date&&row.club===move.otherClub&&row.otherClub===club);
    if(peers.length===1){const {id,name,position}=peers[0];move.exchange={id,name,position};}
  }
  const code=`stove-report:${year}:${stage}`;
  proNotice(s,code,`${stage==='review'?year+' 시즌 결산':(year+1)+' 스토브리그'} 선수 이동`,`FA ${moves.filter(m=>m.direction==='fa').length}명 · 신규 입단 ${moves.filter(m=>m.direction==='joined').length}명 · 재계약 불가 ${moves.filter(m=>m.direction==='released').length}명 · 트레이드 ${moves.filter(m=>m.direction==='traded').length}건 · 은퇴 ${moves.filter(m=>m.direction==='retired').length}명`);
  const notice=[s.careerNotice,...s.noticeQueue??[]].find(n=>n?.code===code);
  if(notice)notice.stoveReport={club,moves};
  return moves;
}
