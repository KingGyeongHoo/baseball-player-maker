"use client";
import {useEffect,useRef,useState} from "react";
import {decodeCareerSave,encodeCareerSave,getCareerSave,listCareerSaves,putCareerSave,type CareerSaveSummary} from "../../lib/career-save";
import {saveCareerInBackground} from "../../lib/career-autosave";
import type {GameState} from "../../lib/sim/types";

export default function CareerStorage({state,onLoad,disabled=false}:{state:GameState|null;onLoad:(s:GameState)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false),[files,setFiles]=useState<CareerSaveSummary[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const refresh=()=>listCareerSaves().then(setFiles).catch(error=>setMessage(error.message));
  useEffect(()=>{if(!state)return;let current=true;void saveCareerInBackground(state).then(()=>{if(current)setMessage(`자동 저장 · ${state.date}`);}).catch(error=>{if(current)setMessage(error instanceof Error?error.message:"자동 저장 실패 · 현재 플레이는 유지됩니다.");});return()=>{current=false;};},[state]);
  const act=async(work:()=>Promise<void>)=>{if(busy||disabled)return;setBusy(true);try{await work();}catch(error){setMessage(error instanceof Error?error.message:"저장 작업에 실패했습니다.");}finally{setBusy(false);}};
  return <section className="career-storage"><div className="career-storage-bar"><span role="status">{message||"로컬 저장 · 커리어별 자동 저장"}</span><button className="text-button" disabled={disabled} onClick={()=>{setOpen(!open);if(!open)void refresh();}}>{open?"저장함 닫기":"저장·불러오기"}</button></div>
    {open&&<div className="career-storage-panel"><p className="micro muted">자동 진행은 불러오지 않습니다. 경기·선택·계약·난수와 중단 위치를 그대로 복원합니다. 다른 커리어의 저장은 유지됩니다.</p>
      <div className="modal-actions">{state&&<><button className="secondary" disabled={busy||disabled} onClick={()=>void act(async()=>{await putCareerSave(encodeCareerSave(state,true));await refresh();setMessage("수동 보관 완료");})}>현재 커리어 보관</button><button className="secondary" disabled={busy||disabled} onClick={()=>{const file=encodeCareerSave(state,true),url=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=`baseball-${file.name}-${file.date}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>파일로 내보내기</button></>}
      <button className="secondary" disabled={busy||disabled} onClick={()=>input.current?.click()}>파일 불러오기</button><input ref={input} type="file" accept="application/json,.json" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void act(async()=>{const saved=decodeCareerSave(await file.text());await putCareerSave({...saved,id:`manual:import:${saved.id}`,manual:true});onLoad(structuredClone(saved.state));setOpen(false);setMessage("파일을 불러왔습니다.");});event.target.value="";}}/></div>
      <div className="career-save-list">{files.map(file=><div key={file.id}><div><b>{file.name} · {file.date}</b><span>{file.manual?"수동 보관":"자동 저장"} · {file.retired?"은퇴 커리어":file.mode==="pro"?"프로":"고교"}</span></div><button className="secondary" disabled={busy||disabled} onClick={()=>void act(async()=>{const saved=await getCareerSave(file.id);onLoad(saved.state);setOpen(false);setMessage("커리어를 불러왔습니다.");})}>불러오기</button></div>)}{!files.length&&<p>저장된 커리어가 없습니다.</p>}</div>
    </div>}
  </section>;
}
