"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {importCareerSave,exportCareerSave,getCareerSave,listCareerSaves,refreshSavedRetiredNumbers,type CareerSaveSummary} from "../../lib/career-save";
import {deleteCareerInBackground,saveCareerInBackground} from "../../lib/career-autosave";
import type {GameState} from "../../lib/sim/types";
import {careerSaveCheckpoint,shouldAutoSaveCareer} from "../../lib/career-autosave-policy";

export default function CareerStorage({state,onLoad,disabled=false}:{state:GameState|null;onLoad:(s:GameState)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false),[files,setFiles]=useState<CareerSaveSummary[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const input=useRef<HTMLInputElement>(null),openRef=useRef(false);
  const checkpoint=useRef<ReturnType<typeof careerSaveCheckpoint>|null>(null);
  const refresh=useCallback(()=>listCareerSaves().then(setFiles).catch(error=>setMessage(error.message)),[]);
  const loadCareer=(saved:GameState)=>{checkpoint.current=careerSaveCheckpoint(saved);onLoad(saved);};
  useEffect(()=>{
    if(!state){checkpoint.current=null;return;}
    const save=shouldAutoSaveCareer(checkpoint.current,state);
    checkpoint.current=careerSaveCheckpoint(state);
    if(!save)return;
    const id=checkpoint.current.id;
    void saveCareerInBackground(state).then(saved=>{if(checkpoint.current?.id===id){setMessage(saved?`시즌 전환 자동 저장 · ${state.date}`:"이 선수의 저장은 삭제됐습니다. 다시 보관하려면 수동 저장해 주세요.");if(openRef.current)void refresh();}}).catch(error=>{if(checkpoint.current?.id===id)setMessage(error instanceof Error?error.message:"자동 저장 실패 · 현재 플레이는 유지됩니다.");});
  },[state,refresh]);
  const act=async(work:()=>Promise<void>)=>{if(busy||disabled)return;setBusy(true);try{await work();}catch(error){setMessage(error instanceof Error?error.message:"저장 작업에 실패했습니다.");}finally{setBusy(false);}};
  return <section className="career-storage"><div className="career-storage-bar"><span role="status">{message||"다음 시즌 시작 시 자동 저장 · 수동 저장 가능"}</span><button className="text-button" disabled={busy||disabled} onClick={()=>{openRef.current=!open;setOpen(!open);setDeleteId(null);if(!open)void refresh();}}>{open?"저장함 닫기":"저장·불러오기"}</button></div>
    {open&&<div className="career-storage-panel"><p className="micro muted">프로는 시즌을 마치고 다음 캠프에 들어갈 때, 고교·대학은 다음 시즌 시작 시 자동 저장합니다. 시즌 중 선택은 자동 저장하지 않으며, 현재 진행은 수동으로 저장할 수 있습니다. 같은 선수는 자동·수동 저장을 하나의 슬롯에 덮어씁니다.</p>
      <div className="modal-actions">{state&&<><button className="secondary" disabled={busy||disabled} onClick={()=>void act(async()=>{await saveCareerInBackground(state,true);await refresh();setMessage("현재 선수의 저장을 덮어썼습니다.");})}>현재 커리어 저장</button><button className="secondary" disabled={busy||disabled} onClick={()=>void act(async()=>{const {file,blob,extension}=await exportCareerSave(state),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`baseball-${file.name}-${file.date}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);})}>파일로 내보내기</button></>}
      <button className="secondary" disabled={busy||disabled} onClick={()=>input.current?.click()}>파일 불러오기</button><input ref={input} type="file" accept="application/json,application/gzip,.json,.json.gz,.gz" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void act(async()=>{const saved=await importCareerSave(file);await saveCareerInBackground(saved.state,true);loadCareer(await refreshSavedRetiredNumbers(saved.state));openRef.current=false;setOpen(false);setMessage("파일을 불러왔습니다.");});event.target.value="";}}/></div>
      <div className="career-save-list">{files.map(file=><div key={file.id}><div><b>{file.name} · {file.date}</b><span>{file.manual?"수동 저장":"자동 저장"} · {file.retired?"은퇴 커리어":file.mode==="pro"?"프로":"고교"}</span></div><div className="career-save-actions"><button className="secondary" disabled={busy||disabled} aria-label={`${file.name} 저장 불러오기`} onClick={()=>void act(async()=>{const saved=await getCareerSave(file.id);loadCareer(saved.state);openRef.current=false;setOpen(false);setMessage("커리어를 불러왔습니다.");})}>불러오기</button>{deleteId===file.id?<><button className="secondary career-save-delete" disabled={busy||disabled} onClick={()=>void act(async()=>{await deleteCareerInBackground(file.id);if(state)loadCareer(await refreshSavedRetiredNumbers(state));setDeleteId(null);await refresh();setMessage("저장을 삭제했습니다. 현재 플레이는 유지됩니다.");})}>삭제 확인</button><button className="text-button" disabled={busy||disabled} onClick={()=>setDeleteId(null)}>취소</button></>:<button className="text-button career-save-delete" disabled={busy||disabled} aria-label={`${file.name} 저장 삭제`} onClick={()=>setDeleteId(file.id)}>삭제</button>}</div></div>)}{!files.length&&<p>저장된 커리어가 없습니다.</p>}</div>
    </div>}
  </section>;
}
