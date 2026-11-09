import { scoreText } from "../../lib/display";
import { useEffect, useId, useRef } from "react";
import { roleScore } from "../../lib/sim/engine";
import type { Player } from "../../lib/sim/types";

export default function RoleOffer({ player, disabled, onAnswer }: { player: Player; disabled: boolean; onAnswer: (accept: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    heading.current?.focus();
    return () => el?.close();
  }, []);
  return <dialog className="modal role-offer-modal" ref={dialog} aria-labelledby={titleId} onCancel={event => event.preventDefault()}>
    <div className="modal-header"><h2 id={titleId} tabIndex={-1} ref={heading}>감독의 새로운 제안</h2><span className="position-tag">ROLE OFFER</span></div>
    <div className="guide-content"><p>{player.name} 선수, <b>{player.roleOffer}</b> 역할에서 새로운 가능성을 발견했습니다.</p>
      <div className="offer-comparison"><div><span>현재 역할</span><b>{player.primaryRole}</b><strong>{scoreText(roleScore(player))}</strong></div><span aria-hidden="true">→</span><div><span>제안받은 역할</span><b>{player.roleOffer}</b><strong>{scoreText(roleScore(player, player.roleOffer!))}</strong></div></div>
      <p className="small muted">수락하면 새 역할과 해당 포지션 출전 자격이 추가됩니다. 기존 출전 자격도 유지되어 투수와 야수로 겸업할 수 있습니다. 기존 능력치와 훈련 배분은 유지되며 새 주 역할의 OVR이 평판에 반영됩니다.</p>
      <div className="modal-actions"><button className="secondary" disabled={disabled} onClick={() => onAnswer(false)}>현재 역할 유지</button><button className="primary" disabled={disabled} onClick={() => onAnswer(true)}>새 역할 수락</button></div>
    </div>
  </dialog>;
}
