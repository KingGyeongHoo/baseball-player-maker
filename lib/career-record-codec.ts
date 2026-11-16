import {emptyRecord,isPitcher} from './sim/engine';
import type {GameState,Player} from './sim/types';

const recordFields=['seasonStats','seasonByLevel','seasonPostseason','seasonFarmPostseason','seasonSpring','seasonByClub','career'] as const;
type ObjectValue=Record<string,unknown>;
const object=(value:unknown):value is ObjectValue=>!!value&&typeof value==='object'&&!Array.isArray(value);
const batting=(value:unknown)=>object(value)&&typeof value.PA==='number';
const pitching=(value:unknown)=>object(value)&&typeof value.BF==='number';
const empty=(value:unknown)=>object(value)&&Object.values(value).every(n=>n===0);
function transform(value:unknown,field:'batting'|'pitching'|'restore'):unknown{
  if(Array.isArray(value))return value.map(row=>transform(row,field));
  if(!object(value))return value;
  if(batting(value.batting)||pitching(value.pitching)){
    const copy={...value};
    if(field==='restore'){
      if(!batting(copy.batting))copy.batting=emptyRecord().batting;
      if(!pitching(copy.pitching))copy.pitching=emptyRecord().pitching;
    }else if(empty(copy[field]))delete copy[field];
    return copy;
  }
  return Object.fromEntries(Object.entries(value).map(([key,row])=>[key,transform(row,field)]));
}
function mapPlayers(state:GameState,restore:boolean):GameState{
  return {...state,players:state.players.map(p=>{
    if(!restore&&(p.id===state.playerId||p.twoWay))return p;
    const copy={...p} as Player&ObjectValue;
    for(const key of recordFields)if(p[key])copy[key]=transform(p[key],restore?'restore':isPitcher(p.primaryRole)?'batting':'pitching') as never;
    return copy;
  })};
}
// The sparse representation is only a file format. The engine always receives
// complete records. Real off-role appearances from a former role are retained.
export const packNpcRecordFields=(state:GameState)=>mapPlayers(state,false);
export const unpackNpcRecordFields=(state:GameState)=>mapPlayers(state,true);
