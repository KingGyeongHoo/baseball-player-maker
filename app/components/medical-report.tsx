"use client";

import {useEffect,useId,useRef} from 'react';
import {labels} from '../../lib/sim/engine';
import {injuryBodies,injuryRules} from '../../lib/sim/injury-rules';
import type {InjuryEpisode} from '../../lib/sim/injury-system';
import type {Stats} from '../../lib/sim/types';

const effects=(values:Partial<Stats>)=>Object.entries(values).filter(([,value])=>value!>0)
  .map(([key,value])=>`${labels[key as keyof Stats]} −${value!.toFixed(1)}`).join(', ');

export default function MedicalReport({injury,returnDate=injury.unavailableUntil,onClose}:{injury:InjuryEpisode;returnDate?:string;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),titleId=useId();
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();heading.current?.focus();return ()=>dialog?.close();},[]);
  const temporary=effects(injury.temporary),permanent=effects(injury.permanent);
  const impact=injury.retired?['경기·훈련 복귀 불가','시즌 일정과 시상을 마친 뒤 은퇴']:[
    `${injury.requiredDays}일 출전 불가`,temporary&&`일시 감소: ${temporary}`,permanent&&`영구 감소: ${permanent}`,
  ].filter(Boolean);
  return <dialog ref={ref} className="modal career-event-modal medical-report" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="modal-header"><h2 ref={heading} id={titleId} tabIndex={-1}>메디컬 리포트</h2><span className="position-tag">MEDICAL</span></div>
    <div className="guide-content">
      <dl className="medical-report-fields">
        <div><dt>부상 부위</dt><dd className="medical-report-body">{injuryBodies[injury.body].name}</dd></div>
        <div><dt>심각도</dt><dd><span className="medical-report-severity">{injuryRules.grades[injury.severity].name}</span></dd></div>
        <div><dt>영향</dt><dd className="medical-report-impact">{impact.map((line,index)=><span key={index}>{line}</span>)}</dd></div>
        <div className="medical-report-return"><dt>예상 복귀일자</dt><dd>{injury.retired?'복귀 불가 (시즌 마무리 후 은퇴)':<time dateTime={returnDate}>{returnDate}</time>}</dd></div>
      </dl>
      <div className="modal-actions"><button className="primary" onClick={onClose}>확인</button></div>
    </div>
  </dialog>;
}
