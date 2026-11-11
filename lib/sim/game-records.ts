import type {Game,MatchProgress,RecordLine} from "./types";

export const gameCounterKeys=["batting","pitching","wins","losses","holds","saves"] as const;
export function mergeGameCounters(target:RecordLine,add:RecordLine){
  const targetBatting=target.batting.PA>0,targetPitching=target.pitching.BF>0,addBatting=add.batting.PA>0,addPitching=add.pitching.BF>0;
  for(const key of gameCounterKeys){
    const a=target.games?.[key],b=add.games?.[key];
    // Unknown legacy totals stay unknown; never turn missing history into zero.
    if(a===undefined&&(key==="batting"?targetBatting:targetPitching)||b===undefined&&(key==="batting"?addBatting:addPitching)){
      if(target.games)delete target.games[key];
    }else if(a!==undefined||b!==undefined){
      (target.games??={})[key]=(a??0)+(b??0);
    }
  }
  if(target.games&&!Object.keys(target.games).length)delete target.games;
}

export function pitcherEntered(m:MatchProgress,game:Game,id:string,side:number,starter=false){
  if(!m.scoring)return;
  const previous=m.scoring.stints.filter(row=>row.side===side).at(-1);
  if(previous)previous.exitLead=game.score[side]-game.score[1-side];
  m.scoring.stints.push({id,side,starter,lead:game.score[side]-game.score[1-side],runners:m.bases.filter(Boolean).length,blown:false});
}

export function recordLeadChange(m:MatchProgress,game:Game,battingSide:number,responsiblePitcher:string){
  const scoring=m.scoring;if(!scoring)return;
  const lead=game.score[battingSide]-game.score[1-battingSide];
  if(lead>=0){
    const active=scoring.stints.filter(row=>row.side===1-battingSide).at(-1);
    if(active&&active.lead>0)active.blown=true;
  }
  if(lead===0){delete scoring.winner;delete scoring.loser;}
  else if(lead===1){scoring.winner=m.pitchers[battingSide];scoring.loser=responsiblePitcher;}
}

export function finishGameRecords(game:Game,m:MatchProgress){
  const fielders=new Set(game.lineup.flatMap(side=>[...side.slice(0,9),...side.slice(10)]));
  const scoring=m.scoring,winningSide=game.score[0]===game.score[1]?null:game.score[0]>game.score[1]?0:1;
  let winner=winningSide===null?undefined:scoring?.winner;
  const loser=winningSide===null?undefined:scoring?.loser;
  if(winner&&scoring?.stints.find(row=>row.id===winner)?.starter&&(game.boxScore[winner]?.pitching.outs??0)<15){
    // No scorer judgement in the simulation: choose the longest relief outing,
    // then fewer charged runs and original entry order as deterministic ties.
    winner=scoring.stints.filter(row=>row.side===winningSide&&!row.starter&&(game.boxScore[row.id]?.pitching.BF??0)>0)
      .sort((a,b)=>(game.boxScore[b.id]?.pitching.outs??0)-(game.boxScore[a.id]?.pitching.outs??0)||(game.boxScore[a.id]?.pitching.R??0)-(game.boxScore[b.id]?.pitching.R??0))[0]?.id;
  }
  const finishing=scoring?.stints.filter(row=>row.side===winningSide).at(-1);
  const saveSituation=(row:NonNullable<typeof finishing>)=>row.lead>0&&(row.lead<=3||row.lead<=row.runners+2);
  const saves=new Set<string>(),holds=new Set<string>();
  if(finishing&&!finishing.starter&&finishing.id!==winner&&!finishing.blown){
    const outs=game.boxScore[finishing.id]?.pitching.outs??0;
    if(outs>=9||outs>=3&&finishing.lead>0&&finishing.lead<=3||outs>=1&&finishing.lead>0&&finishing.lead<=finishing.runners+2)saves.add(finishing.id);
  }
  for(const row of scoring?.stints??[]){
    const outs=game.boxScore[row.id]?.pitching.outs??0;
    if(!row.starter&&row.id!==winner&&!saves.has(row.id)&&row.exitLead!==undefined&&row.exitLead>0&&!row.blown&&outs>0&&saveSituation(row))holds.add(row.id);
  }
  for(const [id,record] of Object.entries(game.boxScore))record.games={
    batting:fielders.has(id)||record.batting.PA>0?1:0,
    pitching:record.pitching.BF>0?1:0,
    ...(scoring?{wins:Number(id===winner),losses:Number(id===loser),holds:Number(holds.has(id)),saves:Number(saves.has(id))}:{}),
  };
}
