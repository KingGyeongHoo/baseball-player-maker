import type { GameState } from "./sim/types";

type Schedule = (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
type Cancel = (timer: ReturnType<typeof setTimeout>) => void;

// A single pending tick prevents overlapping requests. Pausing leaves an in-flight
// week intact and cancels only the next week, preserving the engine's atomic commit.
export class AutoProgress {
  active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor(
    private readonly delay = 500,
    private readonly scheduleTimer: Schedule = (callback, delay) => setTimeout(callback, delay),
    private readonly cancelTimer: Cancel = timer => clearTimeout(timer),
  ) {}

  start() {
    this.active = true;
  }

  schedule(step: () => void) {
    if (!this.active || this.timer !== null) return;
    const generation = this.generation;
    this.timer = this.scheduleTimer(() => {
      if (generation !== this.generation) return;
      this.timer = null;
      if (this.active) step();
    }, this.delay);
  }

  cancelScheduled() {
    this.generation++;
    if (this.timer !== null) this.cancelTimer(this.timer);
    this.timer = null;
  }

  pause() {
    this.active = false;
    this.cancelScheduled();
  }
}

export function autoPauseReason(previous: GameState, next: GameState): string | null {
  if (next.phase === "ended") return "드래프트가 완료되어 자동 진행을 종료했습니다.";
  const before = previous.players.find(p => p.id === previous.playerId)!;
  const after = next.players.find(p => p.id === next.playerId)!;
  if (after.roleOffer) return "감독의 역할 제안이 도착해 자동 진행을 멈췄습니다.";
  if (after.injury && after.injury.startDate !== before.injury?.startDate) {
    return "새로운 부상이 발생해 자동 진행을 멈췄습니다. 회복 방침을 확인하세요.";
  }
  if (after.forcedRest && !before.forcedRest) {
    return "강제 휴식이 필요해 자동 진행을 멈췄습니다.";
  }
  return null;
}
