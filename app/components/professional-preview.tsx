"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createProfessionalDemo } from "../../lib/sim/pro-career";
import type { GameState } from "../../lib/sim/types";
import ProLife from "./pro-life";
import CareerContinuation from "./career-continuation";
import { getPlayer } from "../../lib/sim/engine";
import DraftResultGate from "./draft-result-gate";
import CareerStorage from "./career-storage";

export default function ProfessionalPreview() {
  const [state,setState]=useState<GameState|null>(null),[name,setName]=useState("김신인"),[position,setPosition]=useState<"SS"|"SP">("SS"),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    if(!new URLSearchParams(window.location.search).has("handoff")||!window.opener)return;
    const source=window.location.origin;
    const listener=(event:MessageEvent)=>{if(event.origin!==source||event.source!==window.opener||event.data?.type!=="BASEBALL_CAREER_TRANSFER")return;
      const s=event.data.state as GameState;
      if(s?.schemaVersion!==1||s.phase!=="ended"||!Array.isArray(s.players)||!Array.isArray(s.draft)||!s.players.some(p=>p.id===s.playerId)){setError("선수 기록을 확인할 수 없습니다.");return;}
      setState(s);window.opener.postMessage({type:"BASEBALL_PRO_RECEIVED"},source);clearInterval(timer);
    };
    window.addEventListener("message",listener);const ready=()=>window.opener?.postMessage({type:"BASEBALL_PRO_READY"},source),timer=setInterval(ready,500);ready();
    return ()=>{window.removeEventListener("message",listener);clearInterval(timer);};
  },[]);
  if(state&&!state.careerMode)return <main className="app-main pro-demo"><CareerStorage state={state} onLoad={setState}/><div className="pro-demo-intro"><span className="eyebrow">YOUR NEXT CHAPTER</span><h1>{getPlayer(state).name}의<br/>야구 인생은 계속됩니다.</h1><p>고교 커리어와 능력치·재능을 전달받았습니다. 원래 창의 기록도 유지됩니다.</p></div>{state.draftOutcome?.revealed ? <CareerContinuation state={state} onChange={setState} onRetire={()=>setState(null)}/> : <DraftResultGate state={state} onChange={setState}/>}</main>;
  if(state)return <ProLife state={state} onChange={setState} onReset={()=>setState(null)}/>;
  return <main className="app-main pro-demo"><CareerStorage state={state} onLoad={setState}/><div className="pro-demo-intro"><span className="eyebrow">PRO LIFE · ROOKIE SEASON</span><h1>다음 무대에서,<br/>다시 시작하는 나의 야구.</h1><p>상위 지명 유망주 샘플로 프로 신인 시즌을 바로 체험합니다.<br/>고교에서 직접 키운 선수는 드래프트 결과에서 구단 입단을 선택해 이어갈 수 있습니다.</p></div>
    <section className="panel"><div className="panel-heading"><h2>프로 라이프 체험</h2></div><form className="guide-content" onSubmit={e=>{e.preventDefault();if(busy||!name.trim())return;setBusy(true);setError("");setTimeout(()=>{try{setState(createProfessionalDemo(`pro-demo-${position}`,name,position));}catch(error){setError(error instanceof Error?error.message:"체험을 시작하지 못했습니다.");}finally{setBusy(false);}},30);}}>
      <label>선수 이름<input aria-label="프로 체험 선수 이름" value={name} maxLength={16} onChange={e=>setName(e.target.value)} required disabled={busy}/></label>
      <div className="segmented"><button type="button" className={position==="SS"?"selected":""} onClick={()=>setPosition("SS")} disabled={busy}>타자 · 유격수</button><button type="button" className={position==="SP"?"selected":""} onClick={()=>setPosition("SP")} disabled={busy}>투수 · 선발</button></div>
      <p>잔류군(3군)에서 시작해 2군·1군 승격에 도전하세요. 훈련·피로·부상·이벤트와 실제 1·2군 출전 기록이 이어집니다.</p>
      <button className="primary" type="submit" disabled={busy||!name.trim()}>{busy?"구단을 준비하는 중…":"신인 시즌 시작하기 →"}</button>
      {error&&<p className="error" role="alert">{error}</p>}<p className="micro muted">체험은 별도 샘플 커리어입니다. 저장함에서 이어서 플레이할 수 있습니다. <Link href="/">고교 커리어로 시작하기 →</Link></p>
    </form></section>
  </main>;
}
