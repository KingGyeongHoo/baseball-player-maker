import type {GameState} from "./sim/types";

// Names can collide or change; the seed and original player ID identify a career.
export const careerSaveId=(state:Pick<GameState,"seed"|"playerId">)=>`career:${JSON.stringify([state.seed,state.playerId])}`;
