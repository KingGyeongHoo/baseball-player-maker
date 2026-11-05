import { budget, fatigueForecast, labels, policyForMode, ticketsUsed, validPolicy } from "../../lib/sim/engine";
import { scoreText, changeText } from "../../lib/display";
import type { Mode, Player, Policy, Ticket } from "../../lib/sim/types";

export const modeNames: Record<Mode, string> = { light: "약한 훈련", normal: "보통 훈련", hard: "강한 훈련", rest: "이전 휴식 설정" };
const modes = ["light", "normal", "hard"] as const;
const modeEffects = { light: "피로 천천히 감소", normal: "피로 천천히 증가", hard: "피로 빠르게 증가" };
const groups: { id: string; label: string; keys: Ticket[] }[] = [
  { id: "pitching", label: "투수 능력치", keys: ["velocity", "control", "movement"] },
  { id: "batting", label: "타자 능력치", keys: ["contact", "power", "speed", "defense"] },
  { id: "physical", label: "공통 피지컬", keys: ["physical"] },
];
const symbols: Record<Ticket, string> = { velocity: "V", control: "K", movement: "M", contact: "C", power: "P", speed: "S", defense: "D", physical: "PH" };

export default function TrainingEditor({ player, policy, setPolicy }: { player: Player; policy: Policy; setPolicy: (p: Policy) => void }) {
  const used = ticketsUsed(policy), max = budget(policy.mode), remaining = Math.max(0, max - used);
  const previous = policy.mode === "rest" ? policy.previousTraining : undefined;
  const allocated = previous ? ticketsUsed(previous) : used;
  const blockedModes = modes.filter(mode => allocated > budget(mode));
  const training = policy.mode !== "rest" && used > 0;
  return <>
    <div className="training-modes">{modes.map(mode => {
      const next = policyForMode(policy, mode), blocked = !validPolicy(next);
      return <button key={mode} className={policy.mode === mode ? "selected" : ""} disabled={blocked} aria-pressed={policy.mode === mode}
        title={blocked ? `${modeNames[mode]}은 티켓을 ${budget(mode)}장 이하로 줄인 후 선택할 수 있습니다.` : undefined}
        onClick={() => { if (validPolicy(next)) setPolicy(next); }}>
        <span>{modeNames[mode]}</span><b>{budget(mode)}<small>장</small></b><em className={`training-mode-effect ${mode}`}>{modeEffects[mode]}</em>
      </button>;
    })}</div>
    {blockedModes.length > 0 && <p className="training-mode-note">{previous ? `보관된 배분 ${allocated}장 · 강도를 낮추려면 이전 배분을 복원해 티켓을 줄여 주세요.` : `${blockedModes.map(mode => `${modeNames[mode]} ${budget(mode)}장`).join(" · ")} 이하로 배분을 줄이면 해당 강도를 선택할 수 있습니다.`}</p>}
    {policy.mode === "rest" && <div className="recovery-return"><div><b>이전 버전의 휴식 설정이 유지되어 있습니다.</b><p>약한 훈련이 회복을 겸합니다. 위에서 훈련 강도를 직접 선택해 주세요.</p></div>{previous && <button className="secondary" onClick={() => setPolicy(policyForMode(policy, previous.mode))}>이전 배분 복원</button>}</div>}
    <div className="ticket-summary"><div className="ticket-summary-main" role="status" aria-live="polite" aria-atomic="true">
      <div className="ticket-remaining"><span>남은 티켓</span><strong>{remaining}<small>장</small></strong></div>
      <div className="ticket-allocation"><b>{modeNames[policy.mode]} · 총 {max}장 중 {used}장 사용</b><span>{policy.mode === "rest" ? "훈련 강도를 선택하면 다시 배분할 수 있습니다." : used > max ? `${used - max}장 초과 · 배분을 줄여 주세요.` : remaining === 0 ? "배분 완료 · 변경하려면 다른 항목을 줄여 주세요." : "원하는 능력치의 + 버튼으로 배분하세요."}</span></div>
    </div><button className="ticket-reset" disabled={used === 0} onClick={() => setPolicy({ ...policy, tickets: Object.fromEntries(Object.keys(policy.tickets).map(k => [k, 0])) as Policy["tickets"] })}>배분 초기화</button>
      <div className="ticket-budget-track" aria-hidden="true">{Array.from({ length: max }, (_, i) => <i key={i} className={i < used ? "allocated" : ""} />)}</div>
    </div>
    <p className="training-mode-note">훈련에 참가하면 투수·타자 능력 모두 기본 성장합니다. 티켓을 넣은 항목은 추가로 성장합니다.</p>
    <div className="training-rows">{groups.map(group => <section className={`training-group ${group.id}`} key={group.id} aria-label={group.label}>
      <div className="training-group-heading"><h3>{group.label}</h3><span>{group.keys.reduce((sum, key) => sum + policy.tickets[key], 0)}장 배분</span></div>
      {group.keys.map(key => {
        const stat = key === "physical" ? (player.stats.stamina + player.stats.recovery + player.stats.arm) / 3 : player.stats[key];
        return <div className="training-row" key={key}>
          <span className="training-symbol">{symbols[key]}</span><div className="training-label"><b>{labels[key]}</b><small>{scoreText(stat)}</small>
            <small className="training-growth-hint">{training ? key === "physical" ? policy.tickets.physical>0?"피지컬 집중 성장":"티켓을 배분해 주세요" : <>기본 성장{policy.tickets[key]>0&&<span>집중 성장</span>}</> : "훈련 대기"}</small>
          </div>
          <div className="ticket-dots" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i className={i < policy.tickets[key] ? "filled" : ""} key={i} />)}</div>
          <div className="stepper"><button aria-label={`${labels[key]} 티켓 감소`} disabled={!policy.tickets[key]} onClick={() => setPolicy({ ...policy, tickets: { ...policy.tickets, [key]: policy.tickets[key] - 1 } })}>−</button><output aria-label={`${labels[key]} 티켓`}>{policy.tickets[key]}</output>
            <button aria-label={`${labels[key]} 티켓 증가`} disabled={remaining === 0 || policy.mode === "rest" || policy.tickets[key] >= 5} onClick={() => {
              if (ticketsUsed(policy) >= budget(policy.mode) || policy.mode === "rest" || policy.tickets[key] >= 5) return;
              setPolicy({ ...policy, tickets: { ...policy.tickets, [key]: policy.tickets[key] + 1 } });
            }}>+</button>
          </div>
        </div>;
      })}
    </section>)}</div>
    {!validPolicy(policy) && <p className="error" role="alert">예산을 {used - max}장 초과했습니다. 배분을 줄여 주세요.</p>}
    {policy.mode !== "rest" && used === 0 && <p className="error training-note">티켓이 0장이어서 훈련하지 않습니다. 능력치에 티켓을 배분하면 기본 성장과 집중 훈련이 적용됩니다.</p>}
    <TrainingFatigueForecast player={player} policy={policy} />
    <p className="micro muted training-note">성장은 소수 단위로 누적되고 점수는 정수 부분만 표시합니다. 실제 훈련일·경기 출전량에 따라 달라집니다. 피지컬은 세 능력에 나뉘며 남은 티켓은 이월되지 않습니다.</p>
  </>;
}

function TrainingFatigueForecast({ player, policy }: { player: Player; policy: Policy }) {
  const forecast = fatigueForecast(player, policy), delta = forecast.end - player.fatigue;
  return <div className="fatigue-forecast"><div className="training-forecast">
    <span>훈련에 따른 피로 <b>{changeText(forecast.weeklyTraining,10)}</b></span><span>회복에 따른 피로 <b>{changeText(-forecast.recoveryCapacity,10)}</b></span>
  </div><p className="forecast-result">회복 후 예상 피로 <b>{scoreText(forecast.end)}</b><span>현재 대비 {changeText(delta,10)} · 주중 최고 {scoreText(forecast.peak)}</span></p>
    <p className="micro muted training-note">약한 훈련은 회복 겸용, 보통은 느린 누적, 강한 훈련은 빠른 누적입니다. 정규 훈련 5일·비활동 2일 기준이며 경기 피로와 부상·강제 휴식은 별도로 반영됩니다.</p>
  </div>;
}
