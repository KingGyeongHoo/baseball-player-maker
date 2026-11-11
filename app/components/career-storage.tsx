"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {decodeCareerSave,encodeCareerSave,getCareerSave,listCareerSaves,type CareerSaveSummary} from "../../lib/career-save";
import {deleteCareerInBackground,saveCareerInBackground} from "../../lib/career-autosave";
import type {GameState} from "../../lib/sim/types";

export default function CareerStorage({state,onLoad,disabled=false}:{state:GameState|null;onLoad:(s:GameState)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false),[files,setFiles]=useState<CareerSaveSummary[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const input=useRef<HTMLInputElement>(null),openRef=useRef(false);
  const refresh=useCallback(()=>listCareerSaves().then(setFiles).catch(error=>setMessage(error.message)),[]);
  useEffect(()=>{if(!state)return;let current=true;void saveCareerInBackground(state).then(saved=>{if(current){setMessage(saved?`자동 저장 · ${state.date}`:"이 선수의 저장은 삭제됐습니다. 다시 보관하려면 수동 저장해 주세요.");if(openRef.current)void refresh();}}).catch(error=>{if(current)setMessage(error instanceof Error?error.message:"자동 저장 실패 · 현재 플레이는 유지됩니다.");});return()=>{current=false;};},[state,refresh]);
  const act=async(work:()=>Promise<void>)=>{if(busy||disabled)return;setBusy(true);try{await work();}catch(error){setMessage(error instanceof Error?error.message:"저장 작업에 실패했습니다.");}finally{setBusy(false);}};
  return <section className="career-storage"><div className="career-storage-bar"><span role="status">{message||"로컬 저장 · 선수별 자동 저장"}</span><button className="text-button" disabled={busy||disabled} onClick={()=>{openRef.current=!open;setOpen(!open);setDeleteId(null);if(!open)void refresh();}}>{open?"저장함 닫기":"저장·불러오기"}</button></div>
    {open&&<div className="career-storage-panel"><p className="micro muted">같은 선수는 자동·수동 저장을 하나의 슬롯에 덮어씁니다. 경기·선택·계약·난수와 중단 위치를 복원하며, 자동 진행은 불러오지 않습니다.</p>
      <div className="modal-actions">{state&&<><button className="secondary" disabled={busy||disabled} onClick={()=>void act(async()=>{await saveCareerInBackground(state,true);await refresh();setMessage("현재 선수의 저장을 덮어썼습니다.");})}>현재 커리어 저장</button><button className="secondary" disabled={busy||disabled} onClick={()=>{const file=encodeCareerSave(state,true),url=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=`baseball-${file.name}-${file.date}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>파일로 내보내기</button></>}
      <button className="secondary" disabled={busy||disabled} onClick={()=>input.current?.click()}>파일 불러오기</button><input ref={input} type="file" accept="application/json,.json" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void act(async()=>{const saved=decodeCareerSave(await file.text());await saveCareerInBackground(saved.state,true);onLoad(structuredClone(saved.state));openRef.current=false;setOpen(false);setMessage("파일을 불러왔습니다.");});event.target.value="";}}/></div>
      <div className="career-save-list">{files.map(file=><div key={file.id}><div><b>{file.name} · {file.date}</b><span>{file.manual?"수동 저장":"자동 저장"} · {file.retired?"은퇴 커리어":file.mode==="pro"?"프로":"고교"}</span></div><div className="career-save-actions"><button className="secondary" disabled={busy||disabled} aria-label={`${file.name} 저장 불러오기`} onClick={()=>void act(async()=>{const saved=await getCareerSave(file.id);onLoad(saved.state);openRef.current=false;setOpen(false);setMessage("커리어를 불러왔습니다.");})}>불러오기</button>{deleteId===file.id?<><button className="secondary career-save-delete" disabled={busy||disabled} onClick={()=>void act(async()=>{await deleteCareerInBackground(file.id);setDeleteId(null);await refresh();setMessage("저장을 삭제했습니다. 현재 플레이는 유지됩니다.");})}>삭제 확인</button><button className="text-button" disabled={busy||disabled} onClick={()=>setDeleteId(null)}>취소</button></>:<button className="text-button career-save-delete" disabled={busy||disabled} aria-label={`${file.name} 저장 삭제`} onClick={()=>setDeleteId(file.id)}>삭제</button>}</div></div>)}{!files.length&&<p>저장된 커리어가 없습니다.</p>}</div>
    </div>}
  </section>;
}
