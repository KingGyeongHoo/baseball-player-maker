import { useEffect, useId, useRef } from "react";
import { labels } from "../../lib/sim/engine";
import type { CareerEvent, CareerEventOutcome, Stat, Stats } from "../../lib/sim/types";

function Changes({ stats, reputation, fatigue }: { stats: Partial<Stats>; reputation: number; fatigue: number }) {
  const sign = (n: number) => `${n > 0 ? "+" : ""}${Number(n.toFixed(2))}`;
  return <div className="event-changes">{(Object.entries(stats) as [Stat, number][]).map(([key, amount]) => <span key={key}>{labels[key]} <b>{sign(amount)}</b></span>)}{reputation !== 0 && <span>평판 <b>{sign(reputation)}</b></span>}{fatigue !== 0 && <span>피로 <b>{sign(fatigue)}</b></span>}</div>;
}

export default function CareerEventDialog({ event, outcome, disabled, onChoose, onDone }: {
  event: CareerEvent | null; outcome: CareerEventOutcome | null; disabled: boolean;
  onChoose: (id: string) => void; onDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = dialog.current;
    el?.showModal(); heading.current?.focus();
    return () => el?.close();
  }, []);
  return <dialog className="modal career-event-modal" ref={dialog} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (outcome) onDone(); }}>
    <div className="modal-header"><h2 id={titleId} ref={heading} tabIndex={-1}>{outcome ? "선택의 결과" : event?.title}</h2><span className="position-tag">CAREER EVENT</span></div>
    {outcome ? <div className="guide-content"><p><b>{outcome.title}</b></p><p>{outcome.choice}</p><Changes {...outcome} /><p className="micro muted">표시된 실제 변화량이 선수에게 반영됐습니다. 자동 진행은 멈춘 상태이며 원할 때 다시 시작할 수 있습니다.</p><div className="modal-actions"><button className="primary" onClick={onDone}>확인</button></div></div>
      : <div className="guide-content"><p>{event?.description}</p><div className="career-event-choices">{event?.choices.map(choice => <button key={choice.id} disabled={disabled} onClick={() => onChoose(choice.id)}><b>{choice.label}</b><p>{choice.description}</p><Changes {...choice} /></button>)}</div><p className="micro muted">선택하면 표시된 능력치·평판·피로 변화가 적용됩니다.</p></div>}
  </dialog>;
}
