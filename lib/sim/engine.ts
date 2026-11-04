import { buildCalendar, prepareCompetitions, finishCompetitionDay } from "./calendar";
import { createCareerEvent } from "./career-events";
import balance from "../../baseball_balance_v0_4.json";
import { statKeys, ticketKeys, type Stats, type Stat, type Ticket, type Mode, type Policy, type Position, type Role, type Player, type GameState, type Calendar, type Game, type RecordLine, type Stance, type DraftPick, type FatigueReport } from "./types";
export const params: Record<string, number> = Object.fromEntries(balance.parameters.map(p => [p.key, p.value]));
export const labels: Record<Ticket | Stat, string> = {
  contact: "컨택",
  power: "파워",
  speed: "스피드",
  defense: "수비",
  velocity: "구속",
  control: "제구",
  movement: "변화구",
  physical: "피지컬",
  stamina: "스태미나",
  recovery: "회복력",
  arm: "어깨",
  bq: "야구 지능"
};
export const positions: Record<Position, string> = {
  C: "포수",
  "1B": "1루수",
  "2B": "2루수",
  "3B": "3루수",
  SS: "유격수",
  LF: "좌익수",
  CF: "중견수",
  RF: "우익수",
  DH: "지명타자",
  SP: "선발투수",
  RP: "중간계투",
  CP: "마무리"
};
export const roles = Object.keys(balance.roleWeights) as Role[];
export const isPitcher = (role: Role) => ["선발", "중간계투", "마무리"].includes(role);
export const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
export const budget = (mode: Mode) => mode === "rest" ? 0 : params[`training.${mode}`];
export const emptyStats = () => Object.fromEntries(statKeys.map(k => [k, 0])) as Stats;
export const emptyRecord = (): RecordLine => ({
  batting: {
    PA: 0,
    AB: 0,
    H: 0,
    "2B": 0,
    "3B": 0,
    HR: 0,
    BB: 0,
    SO: 0,
    R: 0,
    RBI: 0,
    GB: 0,
    FB: 0
  },
  pitching: {
    BF: 0,
    outs: 0,
    H: 0,
    BB: 0,
    SO: 0,
    HR: 0,
    R: 0,
    ER: 0
  }
});
export function policyForMode(policy: Policy, mode: Mode): Policy {
  if (mode !== "rest") return { mode, tickets: { ...(policy.mode === "rest" ? policy.previousTraining?.tickets ?? policy.tickets : policy.tickets) } };
  const previousTraining = policy.mode === "rest" ? policy.previousTraining : { mode: policy.mode, tickets: policy.tickets };
  return {
    mode,
    tickets: Object.fromEntries(ticketKeys.map(key => [key, 0])) as Policy["tickets"],
    ...(previousTraining ? { previousTraining: { mode: previousTraining.mode, tickets: { ...previousTraining.tickets } } } : {}),
  };
}
export const ticketsUsed = (p: Policy) => Object.values(p.tickets).reduce((a, b) => a + b, 0);
export const validPolicy = (p: Policy) => ["light", "normal", "hard", "rest"].includes(p.mode) && ticketKeys.every(k => Number.isInteger(p.tickets[k]) && p.tickets[k] >= 0 && p.tickets[k] <= params["training.max_each"]) && ticketsUsed(p) <= budget(p.mode);
export function defaultPolicy(role: Role): Policy {
  const t = Object.fromEntries(ticketKeys.map(k => [k, 0])) as Record<Ticket, number>;
  const sets: Record<Role, Partial<Record<Ticket, number>>> = {
    "코너 야수": {
      contact: 3,
      power: 5,
      speed: 1,
      defense: 1
    },
    "센터라인": {
      contact: 2,
      speed: 4,
      defense: 4
    },
    "포수": {
      contact: 1,
      power: 1,
      defense: 5,
      physical: 3
    },
    "선발": {
      velocity: 2,
      control: 4,
      movement: 2,
      physical: 2
    },
    "중간계투": {
      velocity: 4,
      control: 2,
      movement: 4
    },
    "마무리": {
      velocity: 4,
      control: 2,
      movement: 4
    }
  };
  return {
    mode: "normal",
    tickets: {
      ...t,
      ...sets[role]
    }
  };
}
export const roleFor = (p: Position): Role => p === "C" ? "포수" : ["2B", "SS", "CF"].includes(p) ? "센터라인" : p === "SP" ? "선발" : p === "RP" ? "중간계투" : p === "CP" ? "마무리" : "코너 야수";
const eligible = (p: Position): Position[] => roleFor(p) === "코너 야수" ? ["1B", "3B", "LF", "RF", "DH"] : roleFor(p) === "센터라인" ? ["2B", "SS", "CF", "DH"] : p === "C" ? ["C", "DH"] : ["SP", "RP", "CP"];
export function hash(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function random(state: GameState, stream: keyof GameState["rngStates"]) {
  let a = state.rngStates[stream] += 0x6D2B79F5;
  a = Math.imul(a ^ a >>> 15, a | 1);
  a ^= a + Math.imul(a ^ a >>> 7, a | 61);
  state.rngStates[stream] >>>= 0;
  return ((a ^ a >>> 14) >>> 0) / 4294967296;
}
function normal(s: GameState) {
  return Math.sqrt(-2 * Math.log(1 - random(s, "generation"))) * Math.cos(2 * Math.PI * random(s, "generation"));
}
export const addDays = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dateLabel = (s: string) => s.replaceAll("-", ".");
export const calendar = (year: number): Calendar => buildCalendar(year, params["world.teams"]);
export const focusGrowth = (n: number) => n === 0 ? 0 : params["training.focus_min"] + params["training.focus_span"] * Math.log(n) / Math.log(params["training.max_each"]);
export function slowdown(s: number) {
  for (let i = 1; i <= 5; i++) if (s < params[`growth.break${i}`]) return params[`growth.factor${i - 1}`];
  return params["growth.factor5"];
}
export const interpolate = (s: number, a: number, b: number, c: number) => s <= 50 ? a + (b - a) * (s - 1) / 49 : b + (c - b) * (s - 50) / 50;
const accumulation = (s: number) => interpolate(s, params["physical.accum_low"], params["physical.accum_mid"], params["physical.accum_high"]);
const recovery = (s: number) => interpolate(s, params["physical.recovery_low"], params["physical.recovery_mid"], params["physical.recovery_high"]);
export const recoveryAmount = (mode: Mode, active: boolean, fatigue = 0) => mode === "rest"
  ? fatigue * params["fatigue.recovery_policy"]
  : params["fatigue.daily_recovery"] + (active ? 0 : params["fatigue.rest_bonus"]);
export function fatigueForecast(player: Player, policy: Policy) {
  const used = policy.mode === "rest" ? 0 : ticketsUsed(policy);
  const weeklyTraining = used * params["fatigue.ticket_cost"] * (params[`fatigue.mode_${policy.mode}`] ?? 0) * accumulation(player.stats.stamina);
  const dailyRecovery = params["fatigue.daily_recovery"] * recovery(player.stats.recovery);
  let end = player.fatigue;
  let peak = end;
  let recoveryCapacity = 0;
  for (let day = 0; day < 7; day++) {
    const trainingDay = used > 0 && day < params["training.days"];
    end = clamp(end + (trainingDay ? weeklyTraining / params["training.days"] : 0));
    peak = Math.max(peak, end);
    const recover = recoveryAmount(policy.mode, trainingDay, end) * recovery(player.stats.recovery);
    recoveryCapacity += recover;
    end = clamp(end - recover);
  }
  return { weeklyTraining, dailyRecovery, recoveryCapacity, peak, end };
}
export function train(p: Player, a: number) {
  const policy = p.trainingPolicy;
  if (!ticketsUsed(policy) || a <= 0) return;
  const pitch = isPitcher(p.primaryRole);
  for (const key of ticketKeys) {
    const g = focusGrowth(policy.tickets[key]);
    if (key === "physical") {
      for (const k of ["stamina", "recovery", "arm"] as const) p.stats[k] = clamp(p.stats[k] + g / 3 * slowdown(p.stats[k]) * a / params["training.days"], 1);
      continue;
    }
    const pitching = ["velocity", "control", "movement"].includes(key);
    const talent = p.talent[pitching ? "pitching" : "batting"];
    const mult = params["talent.min_mult"] + (talent - 1) / 9 * (params["talent.max_mult"] - params["talent.min_mult"]);
    p.stats[key] = clamp(p.stats[key] + ((pitching === pitch ? params["training.base"] : 0) + g) * mult * slowdown(p.stats[key]) * a / params["training.days"], 1);
  }
  p.stats.bq = clamp(p.stats.bq + params["training.bq"] * slowdown(p.stats.bq) * a / params["training.days"], 1);
  if (ticketKeys.slice(0, 4).some(k => policy.tickets[k])) p.talentExposure.batting += a / params["training.days"];
  if (ticketKeys.slice(4, 7).some(k => policy.tickets[k])) p.talentExposure.pitching += a / params["training.days"];
}
export const ovr = (p: Player, pitching = isPitcher(p.primaryRole)) => (pitching ? p.stats.velocity + p.stats.control + p.stats.movement : p.stats.contact + p.stats.power + p.stats.speed + p.stats.defense) / (pitching ? 3 : 4);
export const roleScore = (p: Player, role = p.primaryRole) => Object.entries(balance.roleWeights[role]).reduce((sum, [key, weight]) => sum + p.stats[key as Stat] * weight, 0);
export const reputationScore = (p: Player) => clamp(
  params["reputation.ability_weight"] * ovr(p)
  + params["reputation.performance_weight"] * (p.performanceReputation ?? params["reputation.unrated_performance"])
  + (p.reputationBonus ?? 0)
);
export function talentLabel(p: Player, type: "batting" | "pitching") {
  const n = p.talentExposure[type];
  return n < params["talent.hint"] ? "미상" : n < params["talent.reveal"] ? p.talent[type] <= 3 ? "낮음" : p.talent[type] <= 7 ? "보통" : "높음" : `${p.talent[type]} / 10`;
}
const surnames = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "송", "서", "오"];
const names = ["도현", "민준", "서준", "지훈", "준서", "현우", "태양", "우진", "시우", "건우", "성민", "승현", "재윤", "준혁", "정우", "진호", "동현", "성훈", "유찬", "태민"];
function makePlayer(s: GameState, teamId: number, grade: number, index: number, year: number, pos: Position): Player {
  const center = params["generation.mean"] + normal(s) * params["generation.player_sd"];
  const stats = Object.fromEntries(statKeys.map(k => [k, clamp(center + normal(s) * params["generation.stat_sd"], 1)])) as Stats;
  const role = roleFor(pos);
  const p: Player = {
    id: `${year}-${teamId}-${grade}-${index}`,
    name: surnames[Math.floor(random(s, "generation") * surnames.length)] + names[Math.floor(random(s, "generation") * names.length)],
    teamId,
    grade,
    primaryRole: role,
    preferredRole: role,
    position: pos,
    eligiblePositions: eligible(pos),
    stats,
    initialStats: {
      ...stats
    },
    talent: {
      batting: 1 + Math.floor(random(s, "generation") * 10),
      pitching: 1 + Math.floor(random(s, "generation") * 10)
    },
    talentExposure: {
      batting: 0,
      pitching: 0
    },
    fatigue: 0,
    forcedRest: false,
    injury: null,
    trainingPolicy: defaultPolicy(role),
    stance: {
      batting: "level",
      pitching: "command"
    },
    seasonStats: emptyRecord(),
    career: [],
    recentAppearances: [],
    reputation: null,
    performanceReputation: null,
    recentZ: 0,
    lastPitched: null,
    roleOffer: null,
    offerCandidate: null,
    offerWeeks: 0,
    offerCooldown: 0
  };
  for (let w = 0; w < 40 * (grade - 1); w++) train(p, params["training.days"] * .85);
  return p;
}
const slotPositions: Position[][] = [["C", "1B", "SS", "LF", "CF", "SP", "SP", "RP", "RP", "CP"], ["C", "2B", "3B", "RF", "LF", "SP", "SP", "RP", "RP", "CP"], ["C", "1B", "2B", "SS", "CF", "RF", "SP", "SP", "RP", "CP"]];
export function previewPlayer(seed: string, name: string, position: Position) {
  const s = skeleton(seed);
  const p = makePlayer(s, 0, 1, 0, 2027, position);
  p.name = name;
  return p;
}
function skeleton(seed: string): GameState {
  return {
    schemaVersion: 1,
    balanceVersion: balance.balanceVersion,
    seed,
    rngStates: {
      generation: hash(seed + ":generation"),
      training: hash(seed + ":training"),
      match: hash(seed + ":match"),
      injury: hash(seed + ":injury"),
      draft: hash(seed + ":draft"),
      events: hash(seed + ":events")
    },
    date: "2027-03-01",
    phase: "weekStart",
    playerId: "",
    teams: [],
    players: [],
    calendar: calendar(2027),
    records: emptyRecord(),
    pendingEvents: [],
    week: 1,
    report: null,
    history: [],
    draft: [],
    injuryDays: 0,
    careerEvent: null,
    careerEventHistory: [],
    lastCareerEventWeek: 0
  };
}
export function createGame(seed: string, name: string, position: Position, teamId = 0): GameState {
  if (!name.trim() || !seed.trim()) throw new Error("이름과 시드를 입력해 주세요.");
  if (!Object.hasOwn(positions, position)) throw new Error("희망 포지션을 선택해 주세요.");
  if (!Number.isInteger(teamId) || teamId < 0 || teamId >= params["world.teams"]) throw new Error("학교 배정이 올바르지 않습니다.");
  if (params["match.hr_max"] + params["match.double_max"] + params["match.triple_max"] > 1) throw new Error("안타 확률 설정이 올바르지 않습니다.");
  const s = skeleton(seed);
  const regions = ["서울", "부산", "인천", "대구", "광주", "대전", "수원", "청주", "전주", "제주"];
  const schools = ["중앙", "한빛", "동산", "청운", "대성", "해성", "명진", "백운", "신일", "우성"];
  for (let t = 0; t < params["world.teams"]; t++) {
    s.teams.push({
      id: t,
      name: regions[t % 10] + schools[Math.floor(t / 10)] + "고",
      shortName: t === 0 ? "서울중앙" : regions[t % 10] + schools[Math.floor(t / 10)],
      wins: 0,
      losses: 0,
      draws: 0
    });
    for (let g = 1; g <= 3; g++) for (let i = 0; i < params["world.grade_size"]; i++) s.players.push(makePlayer(s, t, g, i, 2027, t === teamId && g === 1 && i === 0 ? position : slotPositions[g - 1][i]));
  }
  const p = s.players[teamId * params["world.grade_size"] * 3];
  p.name = name.trim();
  s.playerId = p.id;
  updateReputation(s);
  s.history.push({
    week: 1,
    ovr: ovr(p),
    fatigue: 0
  });
  return s;
}
export const getPlayer = (s: GameState) => s.players.find(p => p.id === s.playerId)!;
export function effective(p: Player): Stats {
  const s = {
    ...p.stats
  };
  const penalty = p.injury?.penaltyRemaining ?? 0;
  const core: Stat[] = isPitcher(p.primaryRole) ? ["velocity", "control", "movement"] : ["contact", "power", "speed", "defense"];
  for (const k of core) s[k] -= penalty;
  const swing = params["stance.swing"];
  if (p.stance.batting !== "level") {
    const d = p.stance.batting === "down" ? 1 : -1;
    s.contact *= 1 + d * swing;
    s.power *= 1 - d * swing;
  }
  s.velocity *= params[`stance.${p.stance.pitching}_velocity`];
  s.control *= params[`stance.${p.stance.pitching}_control`];
  const f = p.fatigue < params["fatigue.high_start"] ? 1 : 1 - (1 - params["fatigue.effective_min"]) * (p.fatigue - params["fatigue.high_start"]) / (100 - params["fatigue.high_start"]);
  for (const k of statKeys) if (k !== "stamina" && k !== "recovery") s[k] = clamp(s[k] * f, 1, params["match.effective_max"]);
  return s;
}
export function probabilities(b: Stats, p: Stats, defense: number, arm: number) {
  const bounded = (prefix: string, diff: number) => clamp(params[`match.${prefix}_base`] + params[`match.${prefix}_slope`] * diff, params[`match.${prefix}_min`], params[`match.${prefix}_max`]);
  const attack = params["match.attack_contact"] * b.contact + params["match.attack_bq"] * b.bq;
  const pitch = params["match.pitch_velocity"] * p.velocity + params["match.pitch_control"] * p.control + params["match.pitch_movement"] * p.movement + params["match.pitch_bq"] * p.bq;
  return {
    bb: bounded("bb", b.bq - p.control),
    hit: clamp(params["match.hit_base"] + params["match.hit_slope"] * (attack - pitch) - params["match.defense_slope"] * (defense - params["match.defense_center"]), params["match.hit_min"], params["match.hit_max"]),
    hr: bounded("hr", b.power - p.movement),
    double: bounded("double", b.power - p.control),
    triple: bounded("triple", b.speed - arm),
    k: bounded("k", p.velocity - b.contact)
  };
}
export function mergeRecord(target: RecordLine, add: RecordLine) {
  for (const group of ["batting", "pitching"] as const) for (const k of Object.keys(target[group])) (target[group] as Record<string, number>)[k] += (add[group] as Record<string, number>)[k];
}
export function ops(r: RecordLine) {
  const b = r.batting;
  return b.PA && b.AB ? (b.H + b.BB) / b.PA + (b.H + b["2B"] + 2 * b["3B"] + 3 * b.HR) / b.AB : null;
}
const pitchingQ = (r: RecordLine) => r.pitching.BF ? (params["reputation.pitch_k"] * r.pitching.SO - params["reputation.pitch_bb"] * r.pitching.BB - params["reputation.pitch_hr"] * r.pitching.HR) / r.pitching.BF : 0;
const available = (p: Player, date: string) => !p.forcedRest && p.trainingPolicy.mode !== "rest" && !(p.injury && date < p.injury.unavailableUntil);
const selectionScore = (p: Player, role = p.primaryRole) => roleScore(p, role) - params["coach.fatigue_penalty"] * p.fatigue + params["coach.recent_max"] * clamp(p.recentZ, -1, 1);
const byScore = (a: Player, b: Player) => selectionScore(b) - selectionScore(a) || a.id.localeCompare(b.id);
function lineup(roster: Player[], date: string) {
  const candidates = roster.filter(p => available(p, date));
  const field: Player[] = [];
  for (const pos of ["C", "SS", "CF", "2B", "1B", "3B", "LF", "RF", "DH"] as Position[]) {
    const p = candidates.filter(p => p.eligiblePositions.includes(pos) && !field.includes(p)).sort((a, b) => selectionScore(b, roleFor(pos)) - selectionScore(a, roleFor(pos)) || a.id.localeCompare(b.id))[0];
    if (p) field.push(p);
  }
  const pitchers = candidates.filter(p => p.eligiblePositions.includes("SP") && !field.includes(p) && p.fatigue < params["coach.replace_fatigue"]);
  const starters = pitchers.filter(p => p.primaryRole === "선발" && p.fatigue < params["coach.starter_fatigue"] && (!p.lastPitched || date >= addDays(p.lastPitched, params["coach.starter_rest"] + 1))).sort(byScore);
  const starter = starters[0] ?? [...pitchers].sort((a, b) => a.fatigue - b.fatigue || byScore(a, b))[0];
  const top = [...field].sort((a, b) => b.stats.contact + b.stats.speed - a.stats.contact - a.stats.speed || a.id.localeCompare(b.id)).slice(0, 2);
  const middle = field.filter(p => !top.includes(p)).sort((a, b) => b.stats.power - a.stats.power || a.id.localeCompare(b.id)).slice(0, 3);
  const order = [...top, ...middle, ...field.filter(p => !top.includes(p) && !middle.includes(p)).sort((a, b) => b.stats.contact - a.stats.contact || a.id.localeCompare(b.id))];
  return {
    field,
    order,
    starter,
    pitchers
  };
}
type Runner = {
  player: Player;
  pitcher: Player;
};
export function advanceRunners<T>(bases: (T | null)[], batter: T, outcome: 0 | 1 | 2 | 3 | 4, extra: (runner: T) => boolean, score: (runner: T, homeRun: boolean) => void) {
  if (outcome === 0) {
    if (bases[0]) {
      if (bases[1]) {
        if (bases[2]) score(bases[2], false);
        bases[2] = bases[1];
      }
      bases[1] = bases[0];
    }
    bases[0] = batter;
    return;
  }
  for (let base = 2; base >= 0; base--) {
    const runner = bases[base];
    if (!runner) continue;
    bases[base] = null;
    let destination = base + outcome;
    if (outcome < 3 && destination < 3 && !bases[destination + 1] && extra(runner)) destination++;
    if (destination >= 3) score(runner, outcome === 4);else bases[destination] = runner;
  }
  if (outcome === 4) score(batter, true);else bases[outcome - 1] = batter;
}
export function simulateGame(s: GameState, game: Game, rosters: Player[][]) {
  const sides = rosters.map(r => lineup(r, game.date));
  if (sides.some(side => side.field.length < 9 || !side.starter)) {
    game.status = "forfeit";
    game.forfeitTeamId = sides[0].field.length < 9 || !sides[0].starter ? game.homeTeamId : game.awayTeamId;
    return;
  }
  game.status = "completed";
  game.lineup = sides.map(side => [...side.order.map(p => p.id), side.starter.id]);
  const original = rosters.flat().map(p => ({
    p,
    fatigue: p.fatigue,
    lastPitched: p.lastPitched
  }));
  const pitchers = sides.map(side => side.starter);
  const usedPitchers = sides.map(side => new Set([side.starter.id]));
  const battingIndex = [0, 0];
  const pitchOuts = [0, 0];
  const recentEvents: {
    player: Player;
    record: RecordLine;
  }[] = [];
  const line = (p: Player) => game.boxScore[p.id] ??= emptyRecord();
  const defense = sides.map(side => side.field.slice(0, 8).reduce((n, p) => n + effective(p).defense, 0) / 8);
  const arm = sides.map(side => [side.field[2], side.field[6], side.field[7]].reduce((n, p) => n + effective(p).arm / 3, 0));
  let ended = false;
  for (let inning = 1; inning <= params["match.max_innings"] && !ended; inning++) {
    for (const battingSide of [1, 0]) {
      if (battingSide === 0 && inning >= params["match.regular_innings"] && game.score[0] > game.score[1]) {
        ended = true;
        break;
      }
      const pitchingSide = 1 - battingSide;
      let outs = 0;
      let pa = 0;
      let runs = 0;
      const bases: (Runner | null)[] = [null, null, null];
      while (outs < 3) {
        if (++pa > params["match.max_pa"]) throw new Error(`타석 안전 한도 초과: seed=${s.seed}, game=${game.id}`);
        let pitcher = pitchers[pitchingSide];
        const limit = usedPitchers[pitchingSide].size === 1 ? params["coach.starter_outs"] : pitcher.primaryRole === "마무리" ? params["coach.closer_outs"] : params["coach.relief_outs"];
        if (pitchOuts[pitchingSide] >= limit || pitcher.fatigue >= params["coach.replace_fatigue"]) {
          const lead = game.score[pitchingSide] - game.score[battingSide];
          const next = sides[pitchingSide].pitchers.filter(p => !usedPitchers[pitchingSide].has(p.id) && p.fatigue < params["coach.replace_fatigue"]).sort((a, b) => (inning >= 9 && lead >= 1 && lead <= 3 ? Number(b.primaryRole === "마무리") - Number(a.primaryRole === "마무리") : 0) || byScore(a, b))[0];
          if (next) {
            pitcher = pitchers[pitchingSide] = next;
            usedPitchers[pitchingSide].add(next.id);
            pitchOuts[pitchingSide] = 0;
          } else {
            game.status = "forfeit";
            game.forfeitTeamId = pitchingSide === 0 ? game.homeTeamId : game.awayTeamId;
            game.boxScore = {};
            game.lineup = [];
            game.innings = [[], []];
            game.score = [0, 0];
            for (const item of original) {
              item.p.fatigue = item.fatigue;
              item.p.lastPitched = item.lastPitched;
            }
            return;
          }
        }
        const batter = sides[battingSide].order[battingIndex[battingSide] % 9];
        battingIndex[battingSide]++;
        const bat = line(batter).batting;
        const pit = line(pitcher).pitching;
        const b = effective(batter);
        const p = effective(pitcher);
        const probs = probabilities(b, p, defense[pitchingSide], arm[pitchingSide]);
        const batBefore = {
          ...bat
        };
        const pitBefore = {
          ...pit
        };
        bat.PA++;
        pit.BF++;
        pitcher.lastPitched = game.date;
        let walkoff = false;
        const score = (runner: Runner, hr = false) => {
          if (walkoff && !hr) return;
          game.score[battingSide]++;
          runs++;
          line(runner.player).batting.R++;
          line(runner.pitcher).pitching.R++;
          line(runner.pitcher).pitching.ER++;
          bat.RBI++;
          if (battingSide === 0 && inning >= 9 && game.score[0] > game.score[1]) walkoff = true;
        };
        if (random(s, "match") < probs.bb) {
          bat.BB++;
          pit.BB++;
          advanceRunners(bases, {
            player: batter,
            pitcher
          }, 0, () => false, score);
        } else {
          bat.AB++;
          if (random(s, "match") < probs.hit) {
            bat.H++;
            pit.H++;
            const kind = random(s, "match");
            const n = kind < probs.hr ? 4 : kind < probs.hr + probs.double ? 2 : kind < probs.hr + probs.double + probs.triple ? 3 : 1;
            if (n === 4) {
              bat.HR++;
              pit.HR++;
            } else if (n === 2) bat["2B"]++;else if (n === 3) bat["3B"]++;
            const extra = (r: Runner) => random(s, "match") < clamp(params["running.extra_base"] + params["running.extra_slope"] * (effective(r.player).speed - arm[pitchingSide]), params["running.extra_min"], params["running.extra_max"]);
            advanceRunners(bases, {
              player: batter,
              pitcher
            }, n, extra, score);
          } else {
            outs++;
            pit.outs++;
            pitchOuts[pitchingSide]++;
            if (random(s, "match") < probs.k) {
              bat.SO++;
              pit.SO++;
            } else if (random(s, "match") < params[`match.gb_${batter.stance.batting}`]) bat.GB++;else bat.FB++;
            pitcher.fatigue = clamp(pitcher.fatigue + params["fatigue.pitch_out"] * params[`stance.${pitcher.stance.pitching}_cost`] * accumulation(pitcher.stats.stamina));
          }
        }
        if (pit.outs === pitBefore.outs) pitcher.fatigue = clamp(pitcher.fatigue + params["fatigue.no_out_cost"] * params[`stance.${pitcher.stance.pitching}_cost`] * accumulation(pitcher.stats.stamina));
        const batRecent = emptyRecord();
        const pitRecent = emptyRecord();
        for (const key of Object.keys(bat)) (batRecent.batting as Record<string, number>)[key] = (bat as Record<string, number>)[key] - (batBefore as Record<string, number>)[key];
        for (const key of Object.keys(pit)) (pitRecent.pitching as Record<string, number>)[key] = (pit as Record<string, number>)[key] - (pitBefore as Record<string, number>)[key];
        // Commit recent samples only after the game succeeds, just like season totals.
        recentEvents.push({
          player: batter,
          record: batRecent
        }, {
          player: pitcher,
          record: pitRecent
        });
        if (walkoff) {
          ended = true;
          break;
        }
      }
      game.innings[battingSide].push(runs);
    }
    if (inning >= params["match.regular_innings"] && game.score[0] !== game.score[1]) ended = true;
  }
  for (let side = 0; side < 2; side++) {
    const outs = sides[side].pitchers.reduce((sum, p) => sum + (game.boxScore[p.id]?.pitching.outs ?? 0), 0);
    for (const p of sides[side].field.slice(0, 8)) p.fatigue = clamp(p.fatigue + params["fatigue.field_game"] * outs / 27 * accumulation(p.stats.stamina));
  }
  for (const [id, record] of Object.entries(game.boxScore)) {
    const p = rosters.flat().find(p => p.id === id)!;
    mergeRecord(p.seasonStats, record);
  }
  for (const {
    player,
    record
  } of recentEvents) {
    player.recentAppearances.push(record);
    if (player.recentAppearances.length > 350) player.recentAppearances.shift();
  }
  for (const item of original) {
    const p = item.p;
    let batting = 0,
      outs = 0;
    let keepFrom = p.recentAppearances.length;
    for (let i = p.recentAppearances.length - 1; i >= 0; i--) {
      batting += p.recentAppearances[i].batting.PA;
      outs += p.recentAppearances[i].pitching.outs;
      keepFrom = i;
      if (isPitcher(p.primaryRole) ? outs >= params["coach.recent_outs"] : batting >= params["coach.recent_pa"]) break;
    }
    p.recentAppearances = p.recentAppearances.slice(keepFrom);
  }
}
export function injuryRisk(f: number, trained = false) {
  const fatigueRisk = f < params["fatigue.risk_start"] ? 0 : f < params["fatigue.high_start"] ? params["injury.risk_at60"] + params["injury.risk_slope60"] * (f - params["fatigue.risk_start"]) : params["injury.risk_at80"] + params["injury.risk_slope80"] * (f - params["fatigue.high_start"]);
  return 1 - (1 - fatigueRisk) * (1 - (trained ? params["injury.training_base_risk"] : 0));
}
function npcPolicy(p: Player, date: string, hasGame: boolean) {
  const policy = defaultPolicy(p.primaryRole);
  const recovering = p.trainingPolicy.mode === "rest" && p.fatigue > params["coach.recover_target"];
  if (p.forcedRest || (p.injury && date < p.injury.unavailableUntil) || p.fatigue >= params[hasGame ? "coach.match_rest_fatigue" : "coach.rest_fatigue"] || (!hasGame && recovering)) {
    policy.mode = "rest";
    for (const k of ticketKeys) policy.tickets[k] = 0;
  } else if (hasGame || p.fatigue >= params["coach.recover_target"]) {
    policy.mode = "light";
    const keys = [...ticketKeys].sort((a, b) => policy.tickets[a] - policy.tickets[b] || a.localeCompare(b));
    for (const k of keys) while (policy.tickets[k] > 0 && ticketsUsed(policy) > 7) policy.tickets[k]--;
  }
  p.trainingPolicy = policy;
}
function updateReputation(s: GameState) {
  for (const recent of [false, true]) {
    const records = s.players.map(p => {
      if (!recent) return p.seasonStats;
      const r = emptyRecord();
      let count = 0;
      const pitching = isPitcher(p.primaryRole);
      for (const a of [...p.recentAppearances].reverse()) {
        if (count >= params[pitching ? "coach.recent_outs" : "coach.recent_pa"]) break;
        mergeRecord(r, a);
        count += pitching ? a.pitching.outs : a.batting.PA;
      }
      return r;
    });
    const total = emptyRecord();
    for (const r of records) mergeRecord(total, r);
    if (!recent) s.records = total;
    const zs = new Map<string, number>();
    for (const pitching of [false, true]) {
      const league = pitching ? pitchingQ(total) : ops(total) ?? 0;
      const prior = params[pitching ? "reputation.pitcher_prior" : "reputation.hitter_prior"];
      const evaluated = s.players.map((p, i) => ({
        p,
        r: records[i]
      })).filter(({
        r
      }) => pitching ? r.pitching.outs > 0 : r.batting.PA > 0).map(({
        p,
        r
      }) => {
        const n = pitching ? r.pitching.outs : r.batting.PA;
        return {
          p,
          adjusted: (n * (pitching ? pitchingQ(r) : ops(r) ?? 0) + prior * league) / (n + prior)
        };
      });
      const mean = evaluated.reduce((a, b) => a + b.adjusted, 0) / (evaluated.length || 1);
      const sd = Math.sqrt(evaluated.reduce((a, b) => a + (b.adjusted - mean) ** 2, 0) / (evaluated.length || 1));
      for (const {
        p,
        adjusted
      } of evaluated) if (isPitcher(p.primaryRole) === pitching) zs.set(p.id, sd ? (adjusted - mean) / sd : 0);
    }
    if (recent) {
      for (const p of s.players) p.recentZ = zs.get(p.id) ?? 0;
      continue;
    }
    const sorted = [...zs.values()].sort((a, b) => a - b);
    const ranks = new Map<number, number>();
    for (let i = 0; i < sorted.length;) {
      let j = i + 1;
      while (j < sorted.length && sorted[j] === sorted[i]) j++;
      ranks.set(sorted[i], sorted.length === 1 ? 50 : 100 * (i + (j - i - 1) / 2) / (sorted.length - 1));
      i = j;
    }
    // Keep the last performance assessment across promotions and role changes.
    // Current ability still contributes when there are no new appearances.
    for (const p of s.players) {
      if (zs.has(p.id)) p.performanceReputation = ranks.get(zs.get(p.id)!)!;
      p.reputation = reputationScore(p);
    }
  }
}
export const draftBoard = (players: Player[]) => players.filter(p => p.grade === 3)
  .sort((a, b) => ovr(b) - ovr(a) || roleScore(b) - roleScore(a) || a.id.localeCompare(b.id));
export function draftPlayers(s: GameState): DraftPick[] {
  const candidates = draftBoard(s.players);
  const ranks = new Map(candidates.map((p, i) => [p.id, i + 1]));
  const selected = new Set<string>();
  const clubs = ["서울 파이오니어스", "부산 웨이브스", "인천 마리너스", "대구 레드윙스", "광주 타이탄스", "대전 스파크스", "수원 위저즈", "창원 다이노스", "청주 이글스", "전주 라이온스"];
  const needs = clubs.map(() => Object.fromEntries(roles.map(role => [role, random(s, "draft")]))) as Record<Role, number>[];
  const picks: DraftPick[] = [];
  for (let i = 0; i < Math.round(candidates.length * params["draft.ratio"]); i++) {
    const club = i % params["world.clubs"];
    const remaining = candidates.filter(p => !selected.has(p.id));
    const best = remaining.map(p => {
      const qualified = [...new Set(p.eligiblePositions.map(roleFor))].filter(role => isPitcher(role) === isPitcher(p.primaryRole));
      return qualified.map(role => {
        const ability = ovr(p);
        const talent = p.talent[isPitcher(role) ? "pitching" : "batting"];
        const reputation = p.reputation ?? reputationScore(p);
        const fit = params["draft.fit_role_weight"] * roleScore(p, role) + params["draft.fit_need_weight"] * needs[club][role] * 100;
        const components = {
          talent: params["draft.talent_weight"] * (talent - 1) / 9 * 100,
          reputation: params["draft.reputation_weight"] * reputation,
          fit: params["draft.fit_weight"] * fit,
        };
        const score = Object.values(components).reduce((sum, points) => sum + points, 0);
        return {
          p,
          role,
          ability,
          talent,
          reputation,
          fit,
          components,
          score
        };
      }).sort((a, b) => b.score - a.score || b.ability - a.ability || b.talent - a.talent || a.p.id.localeCompare(b.p.id))[0];
    }).sort((a, b) => b.score - a.score || b.ability - a.ability || b.talent - a.talent || a.p.id.localeCompare(b.p.id))[0];
    selected.add(best.p.id);
    needs[club][best.role] = Math.max(0, needs[club][best.role] - params["draft.need_decay"]);
    picks.push({
      playerId: best.p.id,
      playerName: best.p.name,
      teamName: s.teams[best.p.teamId].name,
      club: clubs[club],
      overall: i + 1,
      role: best.role,
      score: best.score,
      ability: best.ability,
      abilityRank: ranks.get(best.p.id)!,
      reputation: best.reputation,
      talent: best.talent,
      fit: best.fit,
      components: best.components,
    });
  }
  return picks;
}
function promote(s: GameState) {
  for (const p of s.players) {
    p.career.push({
      year: s.calendar.seasonYear,
      grade: p.grade,
      records: structuredClone(p.seasonStats),
      stats: {
        ...p.stats
      }
    });
    p.grade++;
    p.seasonStats = emptyRecord();
    p.recentAppearances = [];
    p.recentZ = 0;
  }
  s.players = s.players.filter(p => p.grade <= 3);
  const year = s.calendar.seasonYear + 1;
  for (const t of s.teams) {
    t.wins = t.losses = t.draws = 0;
    for (let i = 0; i < params["world.grade_size"]; i++) s.players.push(makePlayer(s, t.id, 1, i, year, slotPositions[0][i]));
  }
  s.calendar = calendar(year);
}
export function advanceWeek(input: GameState, policy: Policy, stance: Stance): GameState {
  if (input.phase === "ended") throw new Error("종료된 커리어입니다.");
  if (input.careerEvent) throw new Error("진행 중인 이벤트에서 선택을 먼저 완료해 주세요.");
  if (!validPolicy(policy)) throw new Error("훈련 티켓 배분을 확인해 주세요.");
  const s = structuredClone(input);
  const player = getPlayer(s);
  const before = {
    ...player.stats
  };
  const report = {
    from: s.date,
    to: s.date,
    growth: emptyStats(),
    fatigueBefore: player.fatigue,
    fatigueAfter: player.fatigue,
    fatigue: { training: 0, game: 0, recovered: 0, peak: player.fatigue, days: [] } as FatigueReport,
    games: [] as string[],
    messages: [] as string[],
    records: emptyRecord(),
    reputationBefore: player.reputation,
    reputationAfter: player.reputation
  };
  player.trainingPolicy = structuredClone(policy);
  player.stance = {
    ...stance
  };
  let rosters: Player[][] = s.teams.map(() => []);
  for (const p of s.players) rosters[p.teamId].push(p);
  for (let day = 0; day < 7; day++) {
    const date = s.date;
    if (date > s.calendar.seasonEnd) {
      promote(s);
      rosters = s.teams.map(() => []);
      for (const p of s.players) rosters[p.teamId].push(p);
      report.messages.push("새 학년이 시작되었습니다. 신입생이 입학했습니다.");
    }
    const training = s.calendar.trainingDays.includes(date);
    const fatigueDay = { date, start: player.fatigue, training: 0, game: 0, recovered: 0, peak: player.fatigue, end: player.fatigue };
    const active = new Set<string>();
    const appearances = new Set<string>();
    const dailyRecovery = new Map(s.players.map(p => [p.id, recovery(p.stats.recovery)]));
    for (const p of s.players) {
      if (p.forcedRest && p.fatigue < params["fatigue.ready_return"]) p.forcedRest = false;
    }
    prepareCompetitions(s.calendar, date, s.seed);
    const games = s.calendar.events.filter(g => g.date === date && g.status === "scheduled");
    const playingTeams = new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId]));
    for (const p of s.players) if (p.id !== s.playerId) npcPolicy(p, date, playingTeams.has(p.teamId));
    for (const game of games) {
      simulateGame(s, game, [rosters[game.homeTeamId], rosters[game.awayTeamId]]);
      if (game.boxScore[s.playerId]) mergeRecord(report.records, game.boxScore[s.playerId]);
      for (const id of game.lineup.flat()) {
        appearances.add(id);
        active.add(id);
      }
      for (const id of Object.keys(game.boxScore)) {
        appearances.add(id);
        active.add(id);
      }
      if (s.calendar.competitions.find(c => c.id === game.competitionId)?.kind === "tournament") {
        game.advancingTeamId = game.status === "forfeit"
          ? game.forfeitTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
          : game.score[0] === game.score[1]
            ? (random(s, "match") < 0.5 ? game.homeTeamId : game.awayTeamId)
            : game.score[0] > game.score[1] ? game.homeTeamId : game.awayTeamId;
      }
      const home = s.teams[game.homeTeamId],
        away = s.teams[game.awayTeamId];
      const outcome = game.status === "forfeit" ? game.forfeitTeamId === home.id ? -1 : 1 : Math.sign(game.score[0] - game.score[1]);
      if (outcome > 0) {
        home.wins++;
        away.losses++;
      } else if (outcome < 0) {
        home.losses++;
        away.wins++;
      } else {
        home.draws++;
        away.draws++;
      }
      if (game.homeTeamId === player.teamId || game.awayTeamId === player.teamId) report.games.push(game.id);
    }
    finishCompetitionDay(s.calendar, date);
    fatigueDay.game = Math.max(0, player.fatigue - fatigueDay.start);
    for (const p of s.players) {
      const injured = !!p.injury && date < p.injury.unavailableUntil;
      let trained = false;
      if (p.fatigue >= params["fatigue.force_rest"]) p.forcedRest = true;
      if (p.id === s.playerId && injured) s.injuryDays++;
      if (training && available(p, date) && ticketsUsed(p.trainingPolicy)) {
        const hasGame = games.some(g => g.homeTeamId === p.teamId || g.awayTeamId === p.teamId);
        const a = hasGame ? appearances.has(p.id) ? params["training.game_fraction"] : params["training.bench_fraction"] : 1;
        const accum = accumulation(p.stats.stamina);
        train(p, a);
        const beforeTraining = p.fatigue;
        p.fatigue = clamp(p.fatigue + ticketsUsed(p.trainingPolicy) * params["fatigue.ticket_cost"] * params[`fatigue.mode_${p.trainingPolicy.mode}`] * a / params["training.days"] * accum);
        if (p.id === s.playerId) fatigueDay.training = p.fatigue - beforeTraining;
        active.add(p.id);
        trained = true;
      }
      if (p.fatigue >= params["fatigue.force_rest"]) p.forcedRest = true;
      if (active.has(p.id) && !injured && random(s, "injury") < injuryRisk(p.fatigue, trained)) {
        const roll = random(s, "injury");
        const severity = roll < params["injury.mild.weight"] ? "mild" : roll < params["injury.mild.weight"] + params["injury.moderate.weight"] ? "moderate" : "severe";
        const prefix = `injury.${severity}`;
        const duration = params[`${prefix}.min_days`] + Math.floor(random(s, "injury") * (params[`${prefix}.max_days`] - params[`${prefix}.min_days`] + 1));
        const penalty = Math.max(p.injury?.penaltyRemaining ?? 0, params[`${prefix}.penalty`]);
        p.injury = {
          severity,
          startDate: date,
          unavailableUntil: addDays(date, duration + 1),
          originalPenalty: Math.max(p.injury?.originalPenalty ?? 0, params[`${prefix}.penalty`]),
          penaltyRemaining: penalty,
          penaltyRecoverDays: Math.max(p.injury?.penaltyRecoverDays ?? 0, params[`${prefix}.recovery_days`])
        };
        if (p.id === s.playerId) report.messages.push(`활동 후 ${severity === "mild" ? "경미한" : severity === "moderate" ? "보통" : "심각한"} 부상 발견 · ${duration}일 결장`);
      }
      const beforeRecovery = p.fatigue;
      const recoveryMode = p.forcedRest || injured ? "rest" : p.trainingPolicy.mode;
      p.fatigue = clamp(p.fatigue - recoveryAmount(recoveryMode, active.has(p.id), p.fatigue) * dailyRecovery.get(p.id)!);
      if (p.id === s.playerId) {
        fatigueDay.peak = Math.max(fatigueDay.start, beforeRecovery);
        fatigueDay.recovered = beforeRecovery - p.fatigue;
        fatigueDay.end = p.fatigue;
      }
      if (p.injury && date >= p.injury.unavailableUntil) {
        p.injury.penaltyRemaining = Math.max(0, p.injury.penaltyRemaining - (p.injury.penaltyRecoverDays ? p.injury.originalPenalty / p.injury.penaltyRecoverDays : 0));
        if (!p.injury.penaltyRemaining) p.injury = null;
      }
    }
    report.fatigue.training += fatigueDay.training;
    report.fatigue.game += fatigueDay.game;
    report.fatigue.recovered += fatigueDay.recovered;
    report.fatigue.peak = Math.max(report.fatigue.peak, fatigueDay.peak);
    report.fatigue.days.push(fatigueDay);
    if (player.grade === 3 && date >= s.calendar.draftDate) {
      updateReputation(s);
      s.draft = draftPlayers(s);
      s.phase = "ended";
      s.pendingEvents = [{
        type: "draft",
        date,
        playerId: s.playerId
      }];
      report.messages.push("고교 3시즌의 여정이 끝났습니다. 드래프트 결과를 확인하세요.");
      report.to = date;
      break;
    }
    s.date = addDays(date, 1);
    report.to = date;
  }
  updateReputation(s);
  for (const k of statKeys) report.growth[k] = player.stats[k] - before[k];
  report.fatigueAfter = player.fatigue;
  report.reputationAfter = player.reputation;
  if (!Object.values(report.growth).some(n => n > 0)) report.messages.push(player.injury && s.date < player.injury.unavailableUntil ? "부상으로 훈련에 참가하지 못했습니다." : policy.mode === "rest" ? "회복 방침으로 훈련과 출전을 쉬었습니다." : ticketsUsed(policy) === 0 ? "사용한 티켓이 없어 성장하지 않았습니다." : "비시즌으로 정규 훈련이 없습니다.");
  if (player.offerCooldown > 0) player.offerCooldown--;
  if (!player.roleOffer && !player.offerCooldown) {
    const best = [...roles].sort((a, b) => roleScore(player, b) - roleScore(player, a))[0];
    if (best !== player.primaryRole && roleScore(player, best) - roleScore(player) >= params["coach.offer_gap"]) {
      player.offerWeeks = player.offerCandidate === best ? player.offerWeeks + 1 : 1;
      player.offerCandidate = best;
      if (player.offerWeeks >= params["coach.offer_weeks"]) player.roleOffer = best;
    } else {
      player.offerWeeks = 0;
      player.offerCandidate = null;
    }
  }
  if (player.roleOffer && !s.pendingEvents.some(event => event.type === "roleOffer")) s.pendingEvents.push({
    type: "roleOffer",
    date: s.date,
    playerId: s.playerId
  });
  s.week++;
  s.report = report;
  s.history.push({
    week: s.week,
    ovr: ovr(player),
    fatigue: player.fatigue
  });
  if (s.phase !== "ended" && !player.roleOffer && !player.forcedRest && !(player.injury && s.date < player.injury.unavailableUntil)
    && policy.mode !== "rest" && report.fatigue.training > 0 && s.week - (s.lastCareerEventWeek ?? 0) >= params["events.gap_weeks"]
    && random(s, "events") < params["events.weekly_chance"]) {
    const kinds: ("coach" | "condition" | "scout")[] = ["coach", "condition"];
    if (player.seasonStats.batting.PA || player.seasonStats.pitching.BF) kinds.push("scout");
    const previousKind = s.careerEventHistory?.at(-1)?.kind;
    const pool = kinds.filter(kind => kind !== previousKind);
    const kind = pool[Math.floor(random(s, "events") * pool.length)];
    s.careerEvent = createCareerEvent(kind, player, s.date, s.week);
    s.lastCareerEventWeek = s.week;
  }
  return s;
}
export function answerCareerEvent(input: GameState, choiceId: string): GameState {
  if (input.phase === "ended" || !input.careerEvent) throw new Error("선택할 이벤트가 없습니다.");
  const choice = input.careerEvent.choices.find(c => c.id === choiceId);
  if (!choice) throw new Error("유효하지 않은 이벤트 선택입니다.");
  const s = structuredClone(input), p = getPlayer(s), event = s.careerEvent!;
  const changes: Partial<Stats> = {};
  for (const [key, amount] of Object.entries(choice.stats) as [Stat, number][]) {
    const before = p.stats[key];
    p.stats[key] = clamp(before + amount, 1);
    changes[key] = p.stats[key] - before;
  }
  const oldReputation = p.reputation ?? 50, oldFatigue = p.fatigue;
  p.reputationBonus = (p.reputationBonus ?? 0) + choice.reputation;
  p.reputation = reputationScore(p);
  p.fatigue = clamp(p.fatigue + choice.fatigue);
  s.careerEventHistory ??= [];
  s.careerEventHistory.push({ id: event.id, kind: event.kind, title: event.title, date: event.date, choice: choice.label,
    stats: changes, reputation: p.reputation - oldReputation, fatigue: p.fatigue - oldFatigue });
  s.careerEvent = null;
  const point = s.history.at(-1);
  if (point) { point.ovr = ovr(p); point.fatigue = p.fatigue; }
  return s;
}
export function answerOffer(input: GameState, accept: boolean) {
  const s = structuredClone(input);
  const p = getPlayer(s);
  if (p.roleOffer && accept) {
    const map: Record<Role, Position> = {
      "코너 야수": "1B",
      "센터라인": "SS",
      "포수": "C",
      "선발": "SP",
      "중간계투": "RP",
      "마무리": "CP"
    };
    p.primaryRole = p.roleOffer;
    p.preferredRole = p.roleOffer;
    p.position = map[p.roleOffer];
    p.eligiblePositions = [...new Set([...p.eligiblePositions, ...eligible(p.position)])];
    p.reputation = reputationScore(p);
  }
  s.pendingEvents = s.pendingEvents.filter(event => event.type !== "roleOffer");
  p.roleOffer = null;
  p.offerWeeks = 0;
  p.offerCooldown = params["coach.offer_cooldown"];
  return s;
}
