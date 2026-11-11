import { useEffect, useRef, useState } from "react";
import PositionPicker, { Ballpark } from "./position-picker";
import { createRandomCareer, createRandomProCareer, type PlayerKind } from "@/lib/player-creation";
import {randomJerseyNumber} from "@/lib/jersey-numbers";
import {handednessLabel} from "@/lib/player-handedness";
import { positionName } from "@/lib/sim/engine";
import type { GameState, PlayerHands, Position } from "@/lib/sim/types";

function RandomAssignmentCard({ name, position, mode, number, onReroll, disabled, hands }: { name: string; position: Position | null; mode:"school"|"pro";number:number|null;onReroll:()=>void;disabled:boolean;hands:PlayerHands }) {
  return <aside className="random-assignment-card">
    <span className="eyebrow">YOUR FIRST CHAPTER</span><span className="unrevealed-number" aria-hidden="true">{number??"—"}</span>
    <div className="unrevealed-jersey"><svg viewBox="0 0 100 110" aria-hidden="true"><path d="m26 10 16-7q8 9 16 0l16 7 25 23-17 19-6-9v62H24V43l-6 9L1 33Z" fill="currentColor" /><text x="50" y="76" textAnchor="middle" fill="white" fontFamily="Arial, sans-serif" fontSize="30" fontWeight="700">{number??"—"}</text></svg></div>
    <h2>{name.trim() || "나의 선수"}</h2><p className="unrevealed-position">{position ? positionName(position,mode==="pro"?"pro":undefined) : "포지션을 선택하세요"} · {handednessLabel(hands)}</p>
    <div className="jersey-setting"><span>등번호 <b aria-live="polite">{number??"—"}</b></span><button type="button" className="secondary" onClick={onReroll} disabled={disabled}>등번호 설정</button><p>{mode==="school"?"11~23번에서 무작위 재배정 · 주전이 되면 포지션 번호로 변경됩니다.":"1~99번에서 무작위로 다시 배정합니다."}</p></div>
  </aside>;
}

export default function PlayerSetup({ onStart }: { onStart: (state: GameState) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PlayerKind | null>(null);
  const [choices, setChoices] = useState<Record<PlayerKind, Position | null>>({ batter: null, pitcher: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode,setMode]=useState<"school"|"pro">("school");
  const [jerseyNumber,setJerseyNumber]=useState<number|null>(null);
  const [hands,setHands]=useState<PlayerHands>({throws:"R",bats:"R"});
  useEffect(()=>{const timer=setTimeout(()=>setJerseyNumber(randomJerseyNumber("school")),0);return()=>clearTimeout(timer);},[]);
  const creating = useRef(false);
  const position = kind ? choices[kind] : null;
  const start = () => {
    if (creating.current) return;
    if (!name.trim()) { setError("선수 이름을 입력해 주세요."); return; }
    if (!position) { setError("투수·타자와 희망 포지션을 선택해 주세요."); return; }
    creating.current = true;
    setBusy(true);
    setError("");
    setTimeout(() => {
      try { onStart(mode==="school"?createRandomCareer(name, position,globalThis.crypto,jerseyNumber??undefined,hands):createRandomProCareer(name,position,jerseyNumber??undefined,globalThis.crypto,hands)); }
      catch (error) { setError(error instanceof Error ? error.message : "선수 생성에 실패했습니다. 다시 시도해 주세요."); creating.current = false; setBusy(false); }
    }, 30);
  };

  return <>
    <div className="page-kicker"><span>YOUR CAREER STARTS HERE</span><span>2027 HIGH SCHOOL SEASON</span></div>
    <section className="setup-hero creation-hero">
      <div className="hero-copy"><span className="outline-tag">고교 야구 인생 시뮬레이션</span><h1>이름과 포지션을 정하고,<br /><em>나만의 첫 시즌으로.</em></h1><p>학교와 능력치는 시작하는 순간 무작위로 결정됩니다.<br />어떤 출발이 기다릴지, 당신의 야구 이야기를 열어보세요.</p></div>
      <div className="creation-hero-field"><Ballpark /></div><div className="hero-caption">EVERY LEGEND<br /><b>STARTS SOMEWHERE.</b></div>
    </section>
    <div className="creation-layout">
      <section className="panel player-creation-panel">
        <div className="panel-heading"><div><span className="eyebrow">NEW PLAYER</span><h2>나의 선수 만들기</h2></div><span className="small muted">이름 · 투타 손 · 포지션</span></div>
        <form className="player-creation-form" onSubmit={event => { event.preventDefault(); start(); }}>
          <label className="creation-name">선수 이름<input value={name} onChange={event => setName(event.target.value)} maxLength={16} placeholder="이름을 입력하세요" autoComplete="off" required disabled={busy} /></label>
          <div className="creation-hands">{([['throws','투구 손','우투','좌투'],['bats','타격 손','우타','좌타']] as const).map(([key,label,right,left])=><fieldset key={key} disabled={busy}><legend>{label}</legend><div className="segmented">{([['R',right],['L',left]] as const).map(([hand,text])=><button type="button" key={hand} aria-pressed={hands[key]===hand} className={hands[key]===hand?'selected':''} onClick={()=>setHands(previous=>({...previous,[key]:hand}))}>{text}</button>)}</div></fieldset>)}</div>
          <PositionPicker kind={kind} value={position} onKindChange={setKind} onChange={value => { if (kind) setChoices(previous => ({ ...previous, [kind]: value })); }} disabled={busy} mode={mode}/>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="creation-start"><div className="career-mode-picker" role="group" aria-label="시작할 커리어 선택">
            <button type="button" className={mode==="school"?"selected":""} aria-pressed={mode==="school"} disabled={busy} onClick={()=>{setMode("school");setJerseyNumber(randomJerseyNumber("school",jerseyNumber));}}><b>고교 선수로 시작하기</b><span>3년 동안 성장시켜 더 높은 능력치로 프로 입성을 노릴 수 있습니다.</span></button>
            <button type="button" className={mode==="pro"?"selected":""} aria-pressed={mode==="pro"} disabled={busy} onClick={()=>{setMode("pro");setJerseyNumber(randomJerseyNumber("pro",jerseyNumber));}}><b>프로 선수로 시작하기</b><span>무작위 능력치로 프로에 도전합니다. 현재 보직 기량에 따라 정식선수 또는 신고선수로 입단합니다.</span></button>
          </div><button className="primary start-button" type="submit" disabled={busy || !name.trim() || !position}><span>{busy ? "나의 선수와 소속을 배정하는 중…" : "나의 커리어 시작하기"}</span><span aria-hidden="true">→</span></button>
            <p className="micro muted center">커리어는 이 브라우저에 자동 저장됩니다. 저장·불러오기에서 이어갈 수 있습니다.</p>
          </div>
        </form>
      </section>
      <RandomAssignmentCard name={name} position={position} mode={mode} number={jerseyNumber} onReroll={()=>setJerseyNumber(randomJerseyNumber(mode,jerseyNumber))} disabled={busy} hands={hands}/>
    </div>
  </>;
}
