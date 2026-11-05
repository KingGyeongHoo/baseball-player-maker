import { scoreText, changeText } from "../../lib/display";
import { useEffect, useId, useRef } from "react";
import { dateLabel, labels, positions } from "../../lib/sim/engine";
import type { CareerEvent, CareerEventOutcome, EventScene, MatchEffect, Stat } from "../../lib/sim/types";

const sign = changeText;
const awakeningPhrases: Record<Stat, string> = {
  contact: "정교한 타격에 눈을 떴다!", power: "공에 힘을 싣는 타격에 눈을 떴다!", speed: "폭발적인 첫발에 눈을 떴다!", defense: "타구를 읽는 수비에 눈을 떴다!",
  velocity: "힘을 전달하는 투구에 눈을 떴다!", control: "원하는 곳에 던지는 감각에 눈을 떴다!", movement: "공을 움직이는 손끝 감각에 눈을 떴다!",
  stamina: "오래 버티는 몸의 사용법에 눈을 떴다!", recovery: "자신의 몸을 회복시키는 요령에 눈을 떴다!", arm: "힘 있는 송구에 눈을 떴다!", bq: "경기를 읽는 눈을 떴다!",
};
function Scene({ scene }: { scene: EventScene }) {
  return <section className="event-scene" aria-label="현재 경기 상황"><b>{scene.inning}회{scene.battingSide === 1 ? "초" : "말"} · {scene.batting ? "나의 타석" : "나의 등판"}</b>
    <span>{scene.outs}아웃 · 홈 {scene.score[0]} : 원정 {scene.score[1]}</span>
    <span>타자 {scene.batterName} · 투수 {scene.pitcherName}</span>
    <span>{scene.bases.map((name, index) => `${index + 1}루 ${name ?? "없음"}`).join(" · ")}</span></section>;
}
function MatchChanges({ effect, batting }: { effect: MatchEffect; batting: boolean }) {
  const names: Record<keyof MatchEffect, string> = { hit: "안타", hr: "홈런 종류 판정", bb: "볼넷", k: "삼진" };
  return <div className="event-match-effect"><b>{batting ? "이번 타석" : "이번 상대 타자"}에 적용</b><div className="event-changes">{(Object.entries(effect) as [keyof MatchEffect, number][]).map(([key, amount]) => <span key={key}>{names[key]} <b>{changeText(amount * 100)}</b></span>)}</div></div>;
}
export default function CareerEventDialog({ event, outcome, disabled, onChoose, onDone }: {
  event: CareerEvent | null; outcome: CareerEventOutcome | null; disabled: boolean;
  onChoose: (id: string) => void; onDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), choosing = useRef(false);
  const titleId = useId();
  useEffect(() => { const el = dialog.current; el?.showModal(); heading.current?.focus(); return () => el?.close(); }, []);
  useEffect(() => { choosing.current = false; }, [event?.id]);
  const scene = outcome?.scene ?? event?.scene;
  return <dialog className="modal career-event-modal" ref={dialog} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (outcome) onDone(); }}>
    <div className="modal-header"><h2 id={titleId} ref={heading} tabIndex={-1}>{outcome ? "선택의 결과" : event?.title}</h2><span className="position-tag">CAREER EVENT</span></div>
    <div className="guide-content">
      {scene && <Scene scene={scene} />}
      {outcome ? <><p><b>{outcome.title}</b></p><p>{outcome.choice}</p><p className="event-result-message">{outcome.message}</p>
        {outcome.awakened.length > 0 && <div className="event-awakening" role="status"><b>{outcome.awakened.length === 11 ? "야구 전반의 새로운 감각에 눈을 떴다!" : outcome.awakened.length === 1 ? awakeningPhrases[outcome.awakened[0]] : `${outcome.awakened.map(key => labels[key]).join("·")}의 새로운 감각에 눈을 떴다!`}</b></div>}
        <div className="event-changes">{(Object.entries(outcome.stats) as [Stat, number][]).map(([key, amount]) => <span key={key}>{labels[key]} <b>{sign(amount)}</b></span>)}{outcome.reputation !== 0 && <span>평판 <b>{sign(outcome.reputation)}</b></span>}{outcome.fatigue !== 0 && <span>피로 <b>{changeText(outcome.fatigue,10)}</b></span>}</div>
        {!Object.keys(outcome.stats).length && !outcome.reputation && !outcome.fatigue && !outcome.injury && !outcome.positionChange && !outcome.match && !outcome.twoWay && !outcome.transfer && <p>능력치·평판·피로 변화가 없습니다.</p>}
        {outcome.twoWay && <div className="info-box">투타 겸업 시작 · {positions[outcome.twoWay.pitchingPosition]} / {positions[outcome.twoWay.battingPosition]}<br />양쪽 출전 기록이 쌓이면 평판에 유리합니다. 한 주에 타격·투구 모두 출전하면 추가 피로가 쌓입니다.</div>}
        {outcome.transfer && <div className="info-box">{outcome.transfer.from} → {outcome.transfer.to}<br />{outcome.transfer.status === "scheduled" ? `${dateLabel(outcome.transfer.effectiveDate)} 합류 예정 · 현재 학교에서 이번 시즌을 마무리합니다.` : "합류 완료 · 적응 기간은 실제 훈련에 참여한 첫 2주입니다."}</div>}
        {outcome.injury && <p className="error">{outcome.injury.severity === "moderate" ? "보통" : outcome.injury.severity === "severe" ? "심각한" : "경미한"} 부상 · {dateLabel(outcome.injury.unavailableUntil)} 복귀 예정</p>}
        {outcome.positionChange && <p>포지션 변경: {positions[outcome.positionChange.from]} → {positions[outcome.positionChange.to]}</p>}
        {outcome.match && <MatchChanges effect={outcome.match} batting={outcome.scene?.batting ?? false} />}
        <p className="micro muted">실제 변화가 반영됐습니다. 자동 진행은 멈춘 상태이며, 확인 후 직접 계속 진행할 수 있습니다.</p>
        <div className="modal-actions"><button className="primary" onClick={onDone}>확인</button></div>
      </> : <><p>{event?.description}</p>{event?.transferOffers?.map(offer => <section className="event-scene" key={offer.teamId}><b>{offer.name} · {offer.kind === "strong" ? "전력 상위권 학교" : "포지션 경쟁이 적은 학교"}</b><span>현재 팀 전력 {scoreText(offer.strength)} · 다음 학년 포지션 경쟁 선수 능력 {scoreText(offer.competition)}</span>{offer.twoWay && <span>투타 겸업을 검토할 수 있는 선수로 관심을 보이고 있습니다.</span>}</section>)}<div className="career-event-choices">{event?.choices.map(choice => <button key={choice.id} disabled={disabled} onClick={() => { if (choosing.current) return; choosing.current = true; onChoose(choice.id); }}><b>{choice.label}</b></button>)}</div></>}
    </div>
  </dialog>;
}
