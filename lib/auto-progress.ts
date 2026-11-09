import type { GameState } from "./sim/types";

type Schedule = (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
type Cancel = (timer: ReturnType<typeof setTimeout>) => void;

export function cancelPendingSimulation(runtime:{worker:{current:{terminate:()=>void}|null};request:{current:number};locked:{current:boolean};timer:{current:ReturnType<typeof setTimeout>|null}}) {
  // Invalidate first: even an already queued message cannot commit after recovery.
  runtime.request.current++;runtime.locked.current=false;
  if(runtime.timer.current!==null)clearTimeout(runtime.timer.current);
  runtime.timer.current=null;
  const worker=runtime.worker.current;runtime.worker.current=null;worker?.terminate();
}

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

// Waiting for a choice suspends the next tick, not the user's auto-run intent.
export function autoWaitingForDecision(state: GameState, pendingOutcome = false): boolean {
  return !!(state.careerEvent || state.careerNotice || pendingOutcome || state.pendingEventOutcome || state.players.find(p => p.id === state.playerId)?.roleOffer);
}
export function autoPauseReason(previous: GameState, next: GameState): string | null {
  if (next.careerMode && next.phase === "ended") return "시즌을 마쳐 자동 진행을 종료했습니다.";
  if (next.phase === "ended") return "드래프트가 완료되어 자동 진행을 종료했습니다.";
  return null;
}
