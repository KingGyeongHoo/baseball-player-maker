import type { Game, GameState, Player } from "./types";

export type StateTransfer = { state: GameState; reusedHistories: string[]; gameOrder?: string[] };

// Evaluation histories are immutable observations. Share the receiver's existing
// arrays instead of cloning years of identical reports on every weekly message.
// The cache belongs to one worker connection and is reset with that connection.
export class StateTransferCache {
  private histories = new Map<string, NonNullable<Player["evaluationHistory"]>>();
  private games = new Map<string, Game>();

  encode(state: GameState): StateTransfer {
    const reusedHistories: string[] = [], next = new Map<string, NonNullable<Player["evaluationHistory"]>>();
    const players = state.players.map(player => {
      const history = player.evaluationHistory;
      if (!history) return player;
      next.set(player.id, history);
      if (this.histories.get(player.id) !== history) return player;
      reusedHistories.push(player.id);
      const copy = { ...player };
      delete copy.evaluationHistory;
      return copy;
    });
    this.histories = next;
    const games = new Map<string, Game>(), events: Game[] = [];
    for (const game of state.calendar.events) {
      // Completed games never change again. In-progress games, including event
      // checkpoints, always travel in full; season rollover replaces the cache.
      const finished = game.status === "completed" || game.status === "forfeit";
      if (!finished || this.games.get(game.id) !== game) events.push(game);
      if (finished) games.set(game.id, game);
    }
    this.games = games;
    const reusedGames = events.length !== state.calendar.events.length;
    return { state: { ...state, players, calendar: { ...state.calendar, events } }, reusedHistories,
      ...(reusedGames ? { gameOrder: state.calendar.events.map(game => game.id) } : {}) };
  }

  decode({ state, reusedHistories, gameOrder }: StateTransfer): GameState {
    const reused = new Set(reusedHistories), next = new Map<string, NonNullable<Player["evaluationHistory"]>>();
    for (const player of state.players) {
      if (reused.has(player.id)) {
        const history = this.histories.get(player.id);
        if (!history) throw new Error("커리어 동기화에 실패했습니다. 다시 시도해 주세요.");
        player.evaluationHistory = history;
      }
      if (player.evaluationHistory) next.set(player.id, player.evaluationHistory);
    }
    this.histories = next;
    if (gameOrder) {
      const changed = new Map(state.calendar.events.map(game => [game.id, game]));
      state.calendar.events = gameOrder.map(id => {
        const game = changed.get(id) ?? this.games.get(id);
        if (!game) throw new Error("경기 기록 동기화에 실패했습니다. 다시 시도해 주세요.");
        return game;
      });
    }
    this.games = new Map(state.calendar.events.filter(game => game.status === "completed" || game.status === "forfeit").map(game => [game.id, game]));
    return state;
  }
}
