import { useRef, useState } from "react";
import PositionPicker, { Ballpark } from "./position-picker";
import { createRandomCareer, type PlayerKind } from "@/lib/player-creation";
import { positions } from "@/lib/sim/engine";
import type { GameState, Position } from "@/lib/sim/types";

function RandomAssignmentCard({ name, position }: { name: string; position: Position | null }) {
  return <aside className="random-assignment-card">
    <span className="eyebrow">YOUR FIRST CHAPTER</span><span className="unrevealed-number">01</span>
    <div className="unrevealed-jersey"><svg viewBox="0 0 100 110" aria-hidden="true"><path d="m29 10 13-7q8 9 16 0l13 7 26 23-16 19-11-9v62H30V43L19 52 3 33Z" fill="currentColor" /><text x="50" y="74" textAnchor="middle" fill="white" fontSize="38" fontWeight="700">?</text></svg></div>
    <h2>{name.trim() || "나의 선수"}</h2><p className="unrevealed-position">{position ? positions[position] : "나의 자리를 선택하세요"}</p>
    <div className="assignment-item"><span>입학할 학교</span><b>랜덤 배정</b><p>100개 학교 중 하나에서 첫 시즌이 시작됩니다.</p></div>
    <div className="assignment-item"><span>처음 만날 능력치</span><b>시작할 때 공개</b><div className="unknown-stat-bars" aria-hidden="true"><i /><i /><i /></div><p>모든 능력은 새 게임마다 무작위로 결정됩니다.</p></div>
    <div className="assignment-item"><span>타자 · 투수 재능</span><b>아직 모르는 가능성</b><p>재능은 처음에는 미상이며, 훈련 경험에 따라 드러납니다.</p></div>
    <div className="assignment-ticket"><span>이름과 포지션은 당신의 선택.</span><b>첫 출발은, 새로운 우연.</b></div>
  </aside>;
}

export default function PlayerSetup({ onStart }: { onStart: (state: GameState) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PlayerKind | null>(null);
  const [choices, setChoices] = useState<Record<PlayerKind, Position | null>>({ batter: null, pitcher: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      try { onStart(createRandomCareer(name, position)); }
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
        <div className="panel-heading"><div><span className="eyebrow">NEW PLAYER</span><h2>나의 선수 만들기</h2></div><span className="small muted">이름 · 유형 · 포지션</span></div>
        <form className="player-creation-form" onSubmit={event => { event.preventDefault(); start(); }}>
          <label className="creation-name">선수 이름<input value={name} onChange={event => setName(event.target.value)} maxLength={16} placeholder="이름을 입력하세요" autoComplete="off" required disabled={busy} /></label>
          <PositionPicker kind={kind} value={position} onKindChange={setKind} onChange={value => { if (kind) setChoices(previous => ({ ...previous, [kind]: value })); }} disabled={busy} />
          {error && <p role="alert" className="error">{error}</p>}
          <div className="creation-start"><p><b>학교·능력치 무작위 배정</b><span>시작 후에는 대시보드에서 나의 학교와 능력치를 확인할 수 있습니다.</span></p>
            <button className="primary start-button" type="submit" disabled={busy || !name.trim() || !position}><span>{busy ? "나의 학교와 선수를 배정하는 중…" : "나의 커리어 시작하기"}</span><span aria-hidden="true">→</span></button>
            <p className="micro muted center">플레이는 현재 브라우저에서만 유지되며, 새로고침하면 초기화됩니다.</p>
          </div>
        </form>
      </section>
      <RandomAssignmentCard name={name} position={position} />
    </div>
  </>;
}
