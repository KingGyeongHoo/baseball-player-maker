import Image from "next/image";
import { useId, type CSSProperties } from "react";
import { positions,positionName } from "@/lib/sim/engine";
import { fieldPositions, pitchingPositions, type PlayerKind } from "@/lib/player-creation";
import type { Position } from "@/lib/sim/types";

export function Ballpark() {
  return <svg viewBox="0 0 600 500" className="selection-ballpark" aria-hidden="true">
    <defs>
      <pattern id="mownGrass" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="40" height="80" fill="#fff" fillOpacity=".035" /></pattern>
      <clipPath id="fairTerritory"><path d="M300 450 28.47 178.47A384 384 0 0 1 571.53 178.47Z" /></clipPath>
    </defs>
    <path d="M300 465 12.16 177.16A407 407 0 0 1 587.84 177.16Z" fill="#c4a078" />
    <path d="M300 450 28.47 178.47A384 384 0 0 1 571.53 178.47Z" fill="#507b5b" />
    <path d="M300 450 28.47 178.47A384 384 0 0 1 571.53 178.47Z" fill="url(#mownGrass)" />
    <path d="M300 440 137.37 277.37A230 230 0 0 1 462.63 277.37Z" fill="#c4a078" />
    <path d="m300 419-89-89 89-89 89 89Z" fill="#507b5b" />
    <path d="m300 450-271.53-271.53M300 450l271.53-271.53" stroke="#f8f6ea" strokeWidth="3.5" />
    <path d="m300 440-110-110 110-110 110 110Z" stroke="#f8f6ea" strokeOpacity=".75" strokeWidth="2" fill="none" />
    <circle cx="300" cy="330" r="17" fill="#c4a078" /><rect x="294" y="326" width="12" height="3" rx="1" fill="#fffdf1" />
    <circle cx="300" cy="439" r="25" fill="#c4a078" />
    {[ [190,330], [300,220], [410,330] ].map(([x,y]) => <rect key={x} x={x-5} y={y-5} width="10" height="10" fill="#fffdf1" transform={`rotate(45 ${x} ${y})`} />)}
    <path d="M294 438h12v7l-6 5-6-5Z" fill="#fffdf1" />
    <path d="M275 431h9v18h-9Zm41 0h9v18h-9Z" stroke="#f8f6ea" strokeWidth="1.4" fill="none" />
    <path d="M300 450 5 155M300 450 595 155" stroke="#fff" strokeOpacity=".18" strokeWidth="1" strokeDasharray="3 5" clipPath="url(#fairTerritory)" />
    <text x="300" y="81" textAnchor="middle" fill="#e1eadf" fillOpacity=".6" fontFamily="Arial,sans-serif" fontSize="9" letterSpacing="3">FIND YOUR PLACE</text>
  </svg>;
}

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
        <label className={`designated-hitter ${value === "DH" ? "selected" : ""}`}><input type="radio" name={`${id}-position`} value="DH" checked={value === "DH"} onChange={() => onChange("DH")} /><b>DH</b><span>지명타자</span><small>수비 대신 타격에 집중</small><i aria-hidden="true">{value === "DH" ? "✓" : "+"}</i></label>
        <div className="selected-position-note" role="status"><b>{value ? positions[value] : "포지션을 골라주세요"}</b><span>{value === "DH" ? "수비 부담을 줄이고 타격에 집중하는 자리입니다." : selected?.description ?? "각 포지션의 위치를 눌러 역할을 확인할 수 있습니다."}</span></div>
      </> : <>
        <p className="position-instruction">나만의 마운드, 어떤 순간을 책임질까요?</p>
        <div className="pitcher-position-cards">
          {pitchingChoices.map(position => <label key={position.id} className={`pitcher-position-card ${value === position.id ? "selected" : ""}`}>
            <input type="radio" name={`${id}-position`} value={position.id} checked={value === position.id} onChange={() => onChange(position.id)} />
            <span className="pitcher-card-code">{position.id}</span><i className="pitcher-card-check" aria-hidden="true">{value === position.id ? "✓" : ""}</i>
            <span className="pitcher-pose"><Image src={position.image} width={384} height={384} sizes="(max-width: 760px) 30vw, 200px" alt="" /></span>
            <span className="pitcher-card-copy"><small>{position.pose}</small><b>{name(position.id)}</b><span>{position.description.split(" · ")[0]}</span></span>
          </label>)}
        </div>
        <div className="selected-position-note" role="status"><b>{value ? name(value) : "보직을 골라주세요"}</b><span>{pitchingChoices.find(position => position.id === value)?.description.split(" · ")[1] ?? "선발 · 중간계투 · 마무리 중 하나를 선택하세요."}</span></div>
      </>}
    </fieldset>
  </div>;
}
