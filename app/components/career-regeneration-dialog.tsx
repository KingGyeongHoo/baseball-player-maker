"use client";
import {useEffect,useId,useRef} from "react";

export default function CareerRegenerationDialog({busy,onChoose,onClose}:{busy:boolean;onChoose:(save:boolean)=>void;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null),titleId=useId();
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  return <dialog className="modal" ref={ref} aria-labelledby={titleId} aria-busy={busy} onCancel={event=>{if(busy)event.preventDefault();else onClose();}}>
    <div className="modal-header"><h2 id={titleId}>선수를 재생성할까요?</h2><button className="secondary" disabled={busy} onClick={onClose}>닫기</button></div>
    <div className="guide-content"><p>현재 선수의 기록을 저장할까요?</p><div className="modal-actions"><button className="primary" disabled={busy} onClick={()=>onChoose(true)}>저장</button><button className="secondary" disabled={busy} onClick={()=>onChoose(false)}>저장하지 않음</button></div></div>
  </dialog>;
}
