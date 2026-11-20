import Image from "next/image";
import { useId, type CSSProperties } from "react";
import { positions,positionName } from "@/lib/sim/engine";
import { fieldPositions, pitchingPositions, type PlayerKind } from "@/lib/player-creation";
import type { Position } from "@/lib/sim/types";
import Ballpark from './ballpark';

export default function PositionPicker({ kind, value, onKindChange, onChange, disabled,mode="school" }: {
  kind: PlayerKind | null;
  value: Position | null;
  onKindChange: (kind: PlayerKind) => void;
  onChange: (position: Position) => void;
  disabled: boolean;
  mode?:"school"|"pro";
}) {
  const id = useId();
  const selected = fieldPositions.find(p => p.id === value);
  const pitchingChoices=pitchingPositions;
  const name=(position:Position)=>positionName(position,mode==="pro"?"pro":undefined);
  return <div className="creation-position-picker">
    <fieldset className="creation-step" disabled={disabled}>
      <legend><span>01</span>어떤 선수로 시작할까요?</legend>
      <div className="player-kind-options">
        {([{ value: "pitcher", title: "투수", subtitle: "마운드에서 시작하는 나의 이야기", mark: "PITCHER" }, { value: "batter", title: "타자", subtitle: "타석에서 만드는 나의 이야기", mark: "BATTER" }] as const).map(option => <label className={`kind-option ${kind === option.value ? "selected" : ""}`} key={option.value}>
          <input type="radio" name={`${id}-kind`} value={option.value} checked={kind === option.value} onChange={() => onKindChange(option.value)} />
          <span className="kind-option-mark">{option.value === "batter" ? <svg viewBox="0 0 40 40" aria-hidden="true"><path d="m12 30 16-20q4-5 7-2t-2 7L15 33Z" fill="currentColor" /><path d="m8 34 5-6m-8 5 5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="11" cy="12" r="6" stroke="currentColor" strokeWidth="2" fill="none" /></svg> : <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="2" fill="none" /><path d="M10 9c12 7 12 15 0 22M30 9c-12 7-12 15 0 22" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}</span>
          <span><small>{option.mark}</small><b>{option.title}</b><em>{option.subtitle}</em></span><i aria-hidden="true">{kind === option.value ? "✓" : ""}</i>
        </label>)}
      </div>
    </fieldset>
    <fieldset className="creation-step position-step" disabled={disabled || !kind}>
      <legend><span>02</span>나의 포지션을 선택하세요.</legend>
      {!kind ? <div className="position-awaiting"><span>먼저 타자 또는 투수를 선택해 주세요.</span><p>타자는 그라운드에서, 투수는 투구 자세 카드에서 선택합니다.</p></div> : kind === "batter" ? <>
        <p className="position-instruction">그라운드 위에서 뛰고 싶은 자리를 눌러보세요.</p>
        <div className="ballpark-selector">
          <Ballpark />
          {fieldPositions.map(position => <label key={position.id} className={`field-position ${value === position.id ? "selected" : ""}`} style={{ "--field-x": `${position.x}%`, "--field-y": `${position.y}%` } as CSSProperties}>
            <input type="radio" name={`${id}-position`} value={position.id} checked={value === position.id} onChange={() => onChange(position.id)} />
            <span className="field-position-token"><b>{position.id}</b><span>{positions[position.id]}</span>{value === position.id && <i aria-hidden="true">✓</i>}</span>
          </label>)}
        </div>
        <p className="micro muted">지명타자는 수비 주전을 제외한 야수 중 타격이 가장 좋은 선수가 경기마다 맡습니다.</p>
        <div className="selected-position-note" role="status"><b>{value ? positions[value] : "포지션을 골라주세요"}</b><span>{value === "DH" ? "수비 부담을 줄이고 타격에 집중하는 자리입니다." : selected?.description ?? "각 포지션의 위치를 눌러 역할을 확인할 수 있습니다."}</span></div>
      </> : <>
        <p className="position-instruction">나만의 마운드, 어떤 순간을 책임질까요?</p>
        <div className="pitcher-position-cards">
          {pitchingChoices.map(position => <label key={position.id} className={`pitcher-position-card ${value === position.id ? "selected" : ""}`}>
            <input type="radio" name={`${id}-position`} value={position.id} checked={value === position.id} onChange={() => onChange(position.id)} />
            <span className="pitcher-card-code">{position.id}</span><i className="pitcher-card-check" aria-hidden="true">{value === position.id ? "✓" : ""}</i>
            <span className="pitcher-pose"><Image src={position.image} width={384} height={384} sizes="(max-width: 760px) 30vw, 200px" alt="" /></span>
            <span className="pitcher-card-copy"><b>{name(position.id)}</b><span>{position.description}</span></span>
          </label>)}
        </div>
        <div className="selected-position-note" role="status"><b>{value ? name(value) : "보직을 골라주세요"}</b><span>{pitchingChoices.find(position => position.id === value)?.description ?? "선발 · 중간계투 · 마무리 중 하나를 선택하세요."}</span></div>
      </>}
    </fieldset>
  </div>;
}
