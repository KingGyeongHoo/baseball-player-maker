export const statKeys = ["contact", "power", "speed", "defense", "velocity", "control", "movement", "stamina", "recovery", "arm", "bq"] as const;
export type Stat = typeof statKeys[number];
export type Stats = Record<Stat, number>;
export const ticketKeys = ["contact", "power", "speed", "defense", "velocity", "control", "movement", "physical"] as const;
export type Ticket = typeof ticketKeys[number];
export type Mode = "light" | "normal" | "hard" | "rest";
export type CareerMode = "college" | "pro";
export type ProLevel = "first" | "second";
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
  age?: number;
  careerMode?: CareerMode;
  seasonByLevel?: Record<ProLevel, RecordLine>;
  primaryRole: Role;
  preferredRole: Role;
  position: Position;
  eligiblePositions: Position[];
  twoWay?: { pitchingPosition: Position; battingPosition: Position; nextAssignment: "pitching" | "batting"; reputationBonus: number };
  transferAdaptation?: { schoolId: number; weeksRemaining: number };
  proContract?: { status: "developmental" | "regular"; joinedDate: string; convertedDate?: string };
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
    schoolId?: number;
    schoolName?: string;
    careerMode?: CareerMode;
    age?: number;
    byLevel?: Record<ProLevel, RecordLine>;
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
  status: "scheduled" | "inProgress" | "completed" | "forfeit";
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
  sourceKind: "reference" | "fictional";
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
  round: number;
  slot: number;
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
  events?: number;
};
export type FatigueReport = {
  training: number;
  game: number;
  recovered: number;
  peak: number;
  days: FatigueDay[];
  events?: number;
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
export type MatchEffect = { hit?: number; hr?: number; bb?: number; k?: number };
export type EventRewardWeeks = 1 | 3 | 4 | 6 | 8 | 12;
export type CareerEventBranch = {
  weight: number; message: string; stats?: Partial<Stats>; weeks?: Partial<Record<Stat, EventRewardWeeks>>;
  reputation?: number; fatigue?: number; injury?: { severity: Injury["severity"]; days: number };
  role?: Role; match?: MatchEffect;
  recoveryPercent?: { min: number; max: number };
  skipTraining?: boolean;
  opportunity?: { action: "twoWay" | "transfer"; teamId?: number };
};
export type TransferOffer = { teamId: number; name: string; strength: number; competition: number; kind: "strong" | "playingTime"; twoWay: boolean };
export type PendingTransfer = { offerId: string; fromTeamId: number; toTeamId: number; effectiveDate: string; kind: TransferOffer["kind"] };
export type CareerOpportunityState = {
  rng: number; qualifiedWeeks: number; lastCountedWeek?: number; twoWayOfferedGrades: number[];
  transferRollYears: number[]; transferOffered: boolean; pendingTransfer?: PendingTransfer;
};
export type EventOpportunity = { definitionId: string; date: string; competitionId?: string; gameId?: string; targetRole?: Role };
export type EventScene = {
  gameId: string; inning: number; battingSide: number; outs: number; bases: (string | null)[];
  score: number[]; batting: boolean; batterName: string; pitcherName: string;
};
export type CareerEvent = {
  id: string;
  rewardVersion?: number;
  definitionId: string;
  kind: "training" | "person" | "tournament" | "game" | "special";
  date: string;
  title: string;
  description: string;
  choices: { id: string; label: string; outcomes: CareerEventBranch[] }[];
  competitionId?: string; targetRole?: Role; scene?: EventScene;
  twoWayProposal?: { pitchingPosition: Position; battingPosition: Position };
  transferOffers?: TransferOffer[];
};
export type CareerEventOutcome = {
  id: string; kind: CareerEvent["kind"]; title: string; date: string; choice: string;
  stats: Partial<Stats>; reputation: number; fatigue: number;
  definitionId: string; message: string; awakened: Stat[];
  injury?: Injury; positionChange?: { from: Position; to: Position }; match?: MatchEffect; scene?: EventScene;
  twoWay?: { pitchingPosition: Position; battingPosition: Position };
  transfer?: { from: string; to: string; effectiveDate: string; status: "scheduled" | "joined" };
};
export type WeekProgress = {
  remainingDays: number; beforeStats: Stats; report: Report & { fatigue: FatigueReport };
  policy: Policy; stance: Stance; opportunity: EventOpportunity | null;
  twoWayQualified?: boolean; adaptationTrained?: boolean;
  day?: {
    phase: "beforeGames" | "games" | "players" | "finish";
    fatigue: FatigueDay; recovery: [string, number][]; active: string[]; appearances: string[];
    gameIds: string[]; gameIndex: number; playerIndex: number;
    gameStartFatigue?: number; gameStartEventFatigue?: number;
    skipPlayerTraining?: boolean;
  };
};
export type MatchProgress = {
  gameId: string; sides: { field: string[]; order: string[]; starter: string; pitchers: string[] }[];
  original: { id: string; fatigue: number; lastPitched: string | null }[];
  pitchers: string[]; usedPitchers: string[][]; battingIndex: number[]; pitchOuts: number[];
  recentEvents: { playerId: string; record: RecordLine }[]; defense: number[]; arm: number[];
  inning: number; battingSide: number; outs: number; pa: number; runs: number;
  bases: ({ playerId: string; pitcherId: string } | null)[]; ready: boolean; eventFatigue: number;
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
  eventLedger?: { recent: string[]; centerGrades: number[]; nationalGrades: number[]; competitions: string[]; games: string[] };
  weekProgress?: WeekProgress; matchProgress?: MatchProgress;
  matchEffect?: MatchEffect & { gameId: string; batterId: string; pitcherId: string };
  careerOpportunities?: CareerOpportunityState;
  trainingFocus?: { rng: number; rolledWeek: number };
  careerMode?: CareerMode;
  draftOutcome?: { revealed: boolean; offer: DevelopmentalOffer | null };
  careerNotice?: { id: string; date: string; kind: "entry" | "promoted" | "demoted" | "tryoutFailed" | "seasonComplete" | "registered"; title: string; message: string };
  postSchool?: {
    graduationYear: number; graduationSchool: string; collegeYears: number;
    collegeDraft?: DraftPick[];
    tryouts: { year: number; score: number; chance: number; success: boolean }[];
    pro?: {
      club: number; rookieYear: number; level: ProLevel; nextReviewDate: string;
      entry: "draft" | "tryout" | "collegeDraft" | "developmental"; debutDate?: string;
      firstTeamWeeks: number; secondTeamWeeks: number;
      transactions: { date: string; from: ProLevel; to: ProLevel; reason: string; exchangedPlayerId: string }[];
    };
  };
};
export type DevelopmentalOffer = { club: string; reason: "nearCutoff" | "topSkill"; scoreGap: number | null; stat?: Stat; rank?: number };
