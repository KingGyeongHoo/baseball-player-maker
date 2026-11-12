import {useState} from 'react';
import {getPlayer,ovr} from '../../lib/sim/engine';
import {releaseTwoWay} from '../../lib/two-way-release';
import type {GameState} from '../../lib/sim/types';

export default function TwoWayRelease({state,onChange,disabled=false}:{state:GameState;onChange:(s:GameState)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  const p=getPlayer(state);
  if(!p.twoWay)return null;
  const locked=disabled||state.phase==='ended'||!!state.weekProgress||!!state.matchProgress||!!state.careerEvent||!!state.careerNotice||!!state.pendingEventOutcome;
  const choose=(focus:'pitching'|'batting')=>{try{onChange(releaseTwoWay(state,focus));setOpen(false);setError('');}catch(error){setError(error instanceof Error?error.message:'겸업 해제에 실패했습니다.');}};
  return <div className="two-way-release">
    {open?<><p>겸업을 해제하고 집중할 분야를 선택하세요.</p><div className="two-way-release-actions"><button type="button" className="secondary" disabled={locked} onClick={()=>choose('pitching')}>투수에 집중 · OVR {ovr(p,true).toFixed(1)}</button><button type="button" className="secondary" disabled={locked} onClick={()=>choose('batting')}>타자에 집중 · OVR {ovr(p,false).toFixed(1)}</button><button type="button" className="text-button" disabled={locked} onClick={()=>setOpen(false)}>취소</button></div></>:<button type="button" className="secondary" disabled={locked} onClick={()=>setOpen(true)}>겸업 해제 신청</button>}
    {error&&<p role="alert" className="error">{error}</p>}
  </div>;
}
