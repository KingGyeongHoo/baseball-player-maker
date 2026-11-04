export const statKeys = ["contact", "power", "speed", "defense", "velocity", "control", "movement", "stamina", "recovery", "arm", "bq"] as const;
export type Stat = typeof statKeys[number];
export type Stats = Record<Stat, number>;
export const ticketKeys = ["contact", "power", "speed", "defense", "velocity", "control", "movement", "physical"] as const;
export type Ticket = typeof ticketKeys[number];
export type Mode = "light" | "normal" | "hard" | "rest";
export type Role = "코너 야수" | "센터라인" | "포수" | "선발" | "중간계투" | "마무리";
export type Position = "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "DH" | "SP" | "RP" | "CP";
export type Policy = {
  mode: Mode;
  tickets: Record<Ticket, number>;
  previousTraining?: {
    mode: Exclude<Mode, "rest">;
    tickets: Record<Ticket, number>;
  };
};
export type Stance = {
  batting: "down" | "level" | "up";
  pitching: "full" | "command";
};
export type Batting = {
  PA: number;
  AB: number;
  H: number;
  "2B": number;
  "3B": number;
  HR: number;
  BB: number;
  SO: number;
  R: number;
  RBI: number;
  GB: number;
  FB: number;
};
export type Pitching = {
  BF: number;
  outs: number;
  H: number;
  BB: number;
  SO: number;
  HR: number;
  R: number;
  ER: number;
};
export type RecordLine = {
  batting: Batting;
  pitching: Pitching;
};
export type Injury = {
  severity: "mild" | "moderate" | "severe";
  startDate: string;
  unavailableUntil: string;
  originalPenalty: number;
  penaltyRemaining: number;
  penaltyRecoverDays: number;
};
export type Player = {
  id: string;
  name: string;
  teamId: number;
  grade: number;
  primaryRole: Role;
  preferredRole: Role;
  position: Position;
  eligiblePositions: Position[];
  stats: Stats;
  initialStats: Stats;
  talent: {
    batting: number;
    pitching: number;
  };
  talentExposure: {
    batting: number;
    pitching: number;
  };
  fatigue: number;
  forcedRest: boolean;
  injury: Injury | null;
  trainingPolicy: Policy;
  stance: Stance;
  seasonStats: RecordLine;
  career: {
    year: number;
    grade: number;
    records: RecordLine;
    stats: Stats;
  }[];
  recentAppearances: RecordLine[];
  reputation: number | null;
  performanceReputation?: number | null;
  reputationBonus?: number;
  recentZ: number;
  lastPitched: string | null;
  roleOffer: Role | null;
  offerCandidate: Role | null;
  offerWeeks: number;
  offerCooldown: number;
};
export type Team = {
  id: number;
  name: string;
  shortName: string;
  wins: number;
  losses: number;
  draws: number;
};
export type Game = {
  id: string;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  competitionId: string;
  rulesetId: string;
  status: "scheduled" | "completed" | "forfeit";
  score: [number, number];
  innings: [number[], number[]];
  lineup: string[][];
  boxScore: Record<string, RecordLine>;
  forfeitTeamId?: number;
  round?: number;
  advancingTeamId?: number;
};
export type Competition = {
  id: string;
  name: string;
  kind: "league" | "tournament";
  startDate: string;
  endDate: string;
  entryRule: string;
  participantTeamIds: number[];
  initialized: boolean;
  round: number;
  roundDates: string[];
  byes: number[];
  championTeamId: number | null;
};
export type Calendar = {
  seasonYear: number;
  sourceKind: "reference";
  sourceUrl: string;
  referenceYear: number;
  competitions: Competition[];
  trainingDays: string[];
  events: Game[];
  draftDate: string;
  seasonEnd: string;
};
export type DraftPick = {
  playerId: string;
  playerName: string;
  teamName: string;
  club: string;
  overall: number;
  role: Role;
  score: number;
  ability: number;
  abilityRank: number;
  reputation: number;
  talent: number;
  fit: number;
  components: { reputation: number; talent: number; fit: number };
};
export type FatigueDay = {
  date: string;
  start: number;
  training: number;
  game: number;
  recovered: number;
  peak: number;
  end: number;
};
export type FatigueReport = {
  training: number;
  game: number;
  recovered: number;
  peak: number;
  days: FatigueDay[];
};
export type Report = {
  from: string;
  to: string;
  growth: Stats;
  fatigueBefore: number;
  fatigueAfter: number;
  fatigue?: FatigueReport;
  games: string[];
  messages: string[];
  records: RecordLine;
  reputationBefore: number | null;
  reputationAfter: number | null;
  processingMs?: number;
};
export type CareerEvent = {
  id: string;
  kind: "coach" | "condition" | "scout";
  date: string;
  title: string;
  description: string;
  choices: { id: string; label: string; description: string; stats: Partial<Stats>; reputation: number; fatigue: number }[];
};
export type CareerEventOutcome = {
  id: string; kind: CareerEvent["kind"]; title: string; date: string; choice: string;
  stats: Partial<Stats>; reputation: number; fatigue: number;
};
export type GameState = {
  schemaVersion: number;
  balanceVersion: string;
  seed: string;
  rngStates: Record<"generation" | "training" | "match" | "injury" | "draft" | "events", number>;
  date: string;
  phase: "weekStart" | "ended";
  playerId: string;
  teams: Team[];
  players: Player[];
  calendar: Calendar;
  records: RecordLine;
  pendingEvents: {
    type: "roleOffer" | "draft";
    date: string;
    playerId: string;
  }[];
  week: number;
  report: Report | null;
  history: {
    week: number;
    ovr: number;
    fatigue: number;
  }[];
  draft: DraftPick[];
  injuryDays: number;
  careerEvent?: CareerEvent | null;
  careerEventHistory?: CareerEventOutcome[];
  lastCareerEventWeek?: number;
};
