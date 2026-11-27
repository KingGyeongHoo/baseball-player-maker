import {currentProPosition,guaranteedProStarter} from "./pro-positions";
import {farmSelectionTier} from "./pro-farm-roster";
import { buildCalendar } from "./calendar";
import { seededPlayerName } from "./player-names";
import { createSchool, recruitmentProfile, updateSchoolPrestige } from "./school-recruiting";
import {createTalentCohort,talentFromRoll} from "./talent-generation";
import {schoolPositionIntake} from './position-generation';
import {talentBand,talentMultiplier} from './talent';
import { draftPlayers as selectSchoolDraft } from "./draft";
import { simulateGame } from "./match-engine";
import { advanceWeek, refreshWeekReport } from "./week-engine";
import { resolveCareerEvent } from "./event-system";
import { professionalGrowth,limitPhysicalGrowth } from "./pro-growth";
import {conditioningMultiplier,equipmentStats,trainingItemBonus} from './offseason-shop';
import {settleInjuryRetirements} from './injury-career';
import {injuryTrainingPolicy,injuryView} from './injury-system';
import {syncJerseyNumbers} from "../jersey-numbers";
import {captureEvaluationChange,capturePlayerEvaluations} from "./evaluation-lifecycle";
import {reputationBreakdown,updateEvaluationReputations} from "./evaluation-reputation";
import {mergeRecentRecord,recentSample} from "./recent-records";
import {mergeGameCounters} from "./game-records";
import {proSelectionScore,proManagementPenalty} from "./pro-selection";
export {proSelectionScore};
export { simulateGame, advanceWeek, refreshWeekReport };
export const answerCareerEvent = (...args:Parameters<typeof resolveCareerEvent>) => {const s=captureEvaluationChange(syncJerseyNumbers(resolveCareerEvent(...args)),getPlayer(args[0]));settleInjuryRetirements(s);return s;};
import balance from "../../baseball_balance_v0_4.json";
import { statKeys, ticketKeys, type Stats, type Stat, type Ticket, type Mode, type Policy, type Position, type Role, type Player, type GameState, type Calendar, type RecordLine } from "./types";
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
import {assertPositionEligible,canPlayPosition} from './position-eligibility';
import {randomPlayerHands,applySwitchContact,leftPitcherMultiplier} from './handedness';
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
export const roleLabel:(role:Role,mode?:Player["careerMode"])=>string=role=>role;
export const draftRoleLabel=(role:Role)=>role==="중간계투"||role==="마무리"?"불펜":role;
export const positionName:(position:Position,mode?:Player["careerMode"])=>string=position=>positions[position];
export const isPitcher = (role: Role) => ["선발", "중간계투", "마무리"].includes(role);
export const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
export const budget = (mode: Mode) => mode === "rest" ? 0 : ticketKeys.length * params["training.max_each"];
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
const defaultTicketSets: Record<Role, Partial<Record<Ticket, number>>> = {
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
const defaultTickets=Object.fromEntries(Object.entries(defaultTicketSets).map(([role,tickets])=>[role,{...Object.fromEntries(ticketKeys.map(key=>[key,0])),...tickets}])) as Record<Role,Policy["tickets"]>;
export function defaultPolicy(role: Role): Policy {
  // Every caller gets its own mutable plan; only the static defaults are shared.
  return {mode:"normal",tickets:{...defaultTickets[role]}};
}
export const roleFor = (p: Position): Role => p === "C" ? "포수" : ["2B", "SS", "CF"].includes(p) ? "센터라인" : p === "SP" ? "선발" : p === "RP" ? "중간계투" : p === "CP" ? "마무리" : "코너 야수";
const eligible = (p: Position): Position[] => roleFor(p) === "코너 야수" ? ["1B", "3B", "LF", "RF", "DH"] : roleFor(p) === "센터라인" ? ["2B", "SS", "CF", "DH"] : p === "C" ? ["C", "DH"] : ["SP", "RP", "CP"];
export function hash(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function random(state: Pick<GameState, "rngStates">, stream: keyof GameState["rngStates"]) {
  let a = state.rngStates[stream] += 0x6D2B79F5;
  a = Math.imul(a ^ a >>> 15, a | 1);
  a ^= a + Math.imul(a ^ a >>> 7, a | 61);
  state.rngStates[stream] >>>= 0;
  return ((a ^ a >>> 14) >>> 0) / 4294967296;
}
function normal(s: Pick<GameState, "rngStates">) {
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
  if(s<params["growth.break1"])return params["growth.factor0"];
  if(s<params["growth.break2"])return params["growth.factor1"];
  if(s<params["growth.break3"])return params["growth.factor2"];
  if(s<params["growth.break4"])return params["growth.factor3"];
  if(s<params["growth.break5"])return params["growth.factor4"];
  return params["growth.factor5"];
}
export const interpolate = (s: number, a: number, b: number, c: number) => s <= 50 ? a + (b - a) * (s - 1) / 49 : b + (c - b) * (s - 50) / 50;
export const accumulation = (s: number) => interpolate(s, params["physical.accum_low"], params["physical.accum_mid"], params["physical.accum_high"]);
export const recovery = (s: number) => interpolate(s, params["physical.recovery_low"], params["physical.recovery_mid"], params["physical.recovery_high"]);
export const recoveryAmount = (mode: Mode, active: boolean, fatigue = 0) => mode === "rest"
  ? fatigue * params["fatigue.recovery_policy"]
  : params["fatigue.daily_recovery"] + (mode === "light" ? params["fatigue.light_recovery"] : 0) + (active ? 0 : params["fatigue.rest_bonus"]);
export function trainingEffort(policy:Policy) {
  const batting=params["training.batting_fatigue_weight"],pitching=params["training.pitching_fatigue_weight"],physical=params["training.physical_fatigue_weight"],maximum=params["training.max_each"];
  let maxWeightedTickets=0,weightedTickets=0;
  // ticketKeys lists four batting skills, three pitching skills, then physical.
  for(let i=0;i<ticketKeys.length;i++){
    const weight=i<4?batting:i<7?pitching:physical;
    maxWeightedTickets+=maximum*weight;
    if(policy.mode!=="rest")weightedTickets+=policy.tickets[ticketKeys[i]]*weight;
  }
  const rawTickets=policy.mode==="rest"?0:ticketsUsed(policy);
  return {rawTickets,weightedTickets,maxWeightedTickets,equivalentTickets:weightedTickets/maxWeightedTickets*budget("normal")};
}
// Numeric input is the normalized 0-40 reference load; live plans pass Policy.
export function trainingLoad(recoveryStat:number,allocation:number|Policy,accumulationMultiplier=1) {
  const effort=typeof allocation==="number"?null:trainingEffort(allocation);
  const r=clamp(recoveryStat),maxTickets=budget("normal"),used=clamp(effort?effort.equivalentTickets:allocation as number,0,maxTickets);
  const maxRecovery=params["fatigue.plan_recovery_base"]+params["fatigue.plan_recovery_stat"]*r;
  const maxAccumulation=(params["fatigue.plan_accumulation_base"]-params["fatigue.plan_accumulation_stat"]*r)*accumulationMultiplier;
  const neutralRatio=params["fatigue.plan_neutral_base"]+params["fatigue.plan_neutral_stat"]*r,neutralTickets=neutralRatio*maxTickets;
  const delta=used<=neutralTickets?-maxRecovery*(1-used/neutralTickets)**params["fatigue.plan_recovery_curve"]:maxAccumulation*(used-neutralTickets)/(maxTickets-neutralTickets);
  const weeklyDelta=Math.abs(delta)<1e-9?0:delta;
  const marker=weeklyDelta<=0?50+50*weeklyDelta/maxRecovery:50+50*weeklyDelta/maxAccumulation;
  return {used,maxTickets,maxRecovery,maxAccumulation,neutralTickets,neutralRatio,weeklyDelta,marker,loadRatio:used/maxTickets,...(effort??{})};
}
export function trainingFatigueDay(fatigue:number,recoveryStat:number,allocation:number|Policy,accumulationMultiplier=1) {
  const delta=trainingLoad(recoveryStat,allocation,accumulationMultiplier).weeklyDelta/7;
  const end=clamp(fatigue+delta),applied=end-fatigue;
  return {end,training:Math.max(0,applied),recovered:Math.max(0,-applied)};
}
export function fatigueForecast(player: Player, policy: Policy, date?:string) {
  const load=trainingLoad(equipmentStats(player).recovery,policy,conditioningMultiplier(player));
  let end=player.fatigue,peak=end,weeklyTraining=0,recovered=0,forcedRest=player.forcedRest;
  for(let day=0;day<7;day++){
    if(end>=params["fatigue.force_rest"])forcedRest=true;
    if(forcedRest&&end<params["fatigue.ready_return"])forcedRest=false;
    const allowed=date?injuryTrainingPolicy(player,policy,addDays(date,day)):policy;
    const next=trainingFatigueDay(end,equipmentStats(player).recovery,forcedRest?0:allowed,conditioningMultiplier(player));
    end=next.end;weeklyTraining+=next.training;recovered+=next.recovered;peak=Math.max(peak,end);
    if(end>=params["fatigue.force_rest"])forcedRest=true;
  }
  return {...load,weeklyTraining,recoveryCapacity:Math.max(0,-load.weeklyDelta),recovered,peak,end};
}
export function train(p: Player, a: number, policy=p.trainingPolicy,rehab=false) {
  if (!ticketsUsed(policy) || a <= 0) return;
  const growthDays = a * growthMultiplier(p) * (p.transferAdaptation && p.transferAdaptation.weeksRemaining > 0 ? .9 : 1);
  for (const key of ticketKeys) {
    if(rehab&&!policy.tickets[key])continue;
    const g = focusGrowth(policy.tickets[key]);
    if (key === "physical") {
      for (const k of ["stamina", "recovery", "arm"] as const) p.stats[k] = clamp(limitPhysicalGrowth(p,k,p.stats[k] + g / 3 * (1+trainingItemBonus(p,k)) * slowdown(p.stats[k]) * growthDays * professionalGrowth(p,k) / params["training.days"]), 1);
      continue;
    }
    const pitching = ["velocity", "control", "movement"].includes(key);
    const talent = p.talent[pitching ? "pitching" : "batting"];
    const mult = talentMultiplier(talent,params['talent.min_mult'],params['talent.max_mult'])+trainingItemBonus(p,key);
    p.stats[key] = clamp(limitPhysicalGrowth(p,key,p.stats[key] + (params["training.base"] + g) * mult * slowdown(p.stats[key]) * growthDays * professionalGrowth(p,key) / params["training.days"]), 1);
  }
  p.stats.bq = clamp(p.stats.bq + params["training.bq"] * slowdown(p.stats.bq) * growthDays * professionalGrowth(p,"bq") / params["training.days"], 1);
  if (ticketKeys.slice(0, 4).some(k => policy.tickets[k])) p.talentExposure.batting += a / params["training.days"];
  if (ticketKeys.slice(4, 7).some(k => policy.tickets[k])) p.talentExposure.pitching += a / params["training.days"];
}
export const ovr = (p: Player, pitching = isPitcher(p.primaryRole)) => {const stats=equipmentStats(p);return (pitching ? stats.velocity + stats.control + stats.movement : stats.contact + stats.power + stats.speed + stats.defense) / (pitching ? 3 : 4);};
export const combinedOvr = (p: Player) => ovr(p, true) + ovr(p, false);
export const overall = (p: Player) => p.twoWay ? combinedOvr(p) / 2 : ovr(p);
export const positionLabel = (p: Player) => {const mode=p.careerMode??(p.professional?"pro":undefined);return p.twoWay ? `${roleLabel(roleFor(p.twoWay.pitchingPosition),mode)}/${positions[p.twoWay.battingPosition]}` : positionName(p.position,mode);};
export const pitchingRole = (p: Player) => p.twoWay?roleFor(p.twoWay.pitchingPosition):p.primaryRole;
export const twoWayReputation = (p: Player) => p.twoWay ? Math.max(p.twoWay.reputationBonus, 3 * Math.min(1, p.seasonStats.batting.PA / 20, p.seasonStats.pitching.BF / 15)) : 0;
const roleWeights=Object.fromEntries(Object.entries(balance.roleWeights).map(([role,weights])=>[role,Object.entries(weights)])) as Record<Role,[Stat,number][]>;
const positionWeights=Object.fromEntries(Object.entries(balance.positionWeights).map(([position,weights])=>[position,Object.entries(weights)])) as Partial<Record<Position,[Stat,number][]>>;
export function roleScore(p:Player,role=p.primaryRole,position?:Position){
  const target=position??(!isPitcher(role)&&p.twoWay?p.twoWay.battingPosition:p.position);
  const weights=roleFor(target)===role?positionWeights[target]??roleWeights[role]:roleWeights[role];
  const stats=equipmentStats(p);
  let score=0;for(const [key,weight]of weights)score+=stats[key]*weight;
  return score;
}
export const reputationScore = (p: Player) => p.careerMode==="pro"||p.professional?null:reputationBreakdown(p).total;
export function talentLabel(p: Player, type: "batting" | "pitching") {
  const n = p.talentExposure[type];
  return n < params["talent.hint"] ? "미상" : n < params["talent.reveal"] ? talentBand(p.talent[type]).label : `${p.talent[type]} / 10`;
}
// Newly generated school players keep one training plan throughout their past
// seasons. Hoist its constant factors, but preserve every weekly growth step.
function applySchoolTrainingHistory(p:Player,weeks:number){
  if(!weeks||!ticketsUsed(p.trainingPolicy))return;
  const days=params['training.days'],amount=days*.85,base=params['training.base'];
  const plan=ticketKeys.filter(key=>key!=='physical').map(key=>({key,focus:focusGrowth(p.trainingPolicy.tickets[key]),talent:talentMultiplier(p.talent[['velocity','control','movement'].includes(key)?'pitching':'batting'],params['talent.min_mult'],params['talent.max_mult']),growth:professionalGrowth(p,key)}));
  const physical=focusGrowth(p.trainingPolicy.tickets.physical),bq=params['training.bq'],bqGrowth=professionalGrowth(p,'bq');
  const battingExposure=ticketKeys.slice(0,4).some(key=>p.trainingPolicy.tickets[key]),pitchingExposure=ticketKeys.slice(4,7).some(key=>p.trainingPolicy.tickets[key]);
  for(let week=0;week<weeks;week++){
    for(const {key,focus,talent,growth}of plan)p.stats[key]=clamp(p.stats[key]+(base+focus)*talent*slowdown(p.stats[key])*amount*growth/days,1);
    for(const key of ['stamina','recovery','arm'] as const)p.stats[key]=clamp(p.stats[key]+physical/3*slowdown(p.stats[key])*amount/days,1);
    p.stats.bq=clamp(p.stats.bq+bq*slowdown(p.stats.bq)*amount*bqGrowth/days,1);
    if(battingExposure)p.talentExposure.batting+=amount/days;
    if(pitchingExposure)p.talentExposure.pitching+=amount/days;
  }
}
function makePlayer(s: Pick<GameState,'seed'|'rngStates'|'teams'>, teamId: number, grade: number, index: number, year: number, pos: Position, talent?:Player["talent"]): Player {
  const recruitment = recruitmentProfile(s.teams[teamId]);
  const center = params["generation.mean"] + recruitment.abilityOffset + normal(s) * params["generation.player_sd"];
  const stats = Object.fromEntries(statKeys.map(k => [k, clamp(center + normal(s) * params["generation.stat_sd"], 1)])) as Stats;
  const role = roleFor(pos);
  // Preserve the two legacy name draws so this change cannot reroll abilities,
  // talents or later players. Name selection itself uses its own two draws.
  random(s, "generation"); random(s, "generation");
  const rolledTalent={batting:talentFromRoll(random(s,"generation")),pitching:talentFromRoll(random(s,"generation"))};
  const p: Player = {
    id: `${year}-${teamId}-${grade}-${index}`,
    name: seededPlayerName(`${s.seed}:player-name:${year}-${teamId}-${grade}-${index}`),
    teamId,
    grade,
    ...(grade===1?{freshmanReserve:true}:{}),
    primaryRole: role,
    preferredRole: role,
    position: pos,
    eligiblePositions: eligible(pos),
    stats,
    initialStats: {
      ...stats
    },
    talent: talent??rolledTalent,
    talentExposure: {
      batting: 0,
      pitching: 0
    },
    fatigue: 0,
    forcedRest: false,
    injury: null,
    injuryHistory: [],
    trainingPolicy: defaultPolicy(role),
    stance: {
      batting: "level",
      pitching: "regular"
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
  // A per-player stream keeps the existing primary abilities, talent, names and
  // subsequent players' generation draws unchanged when secondary skills change.
  const secondary = { rngStates: { ...s.rngStates, generation: hash(`${s.seed}:secondary:${p.id}`) } };
  const exceptional = random(secondary, "generation") < params["generation.two_way_chance"];
  const secondaryCenter = (exceptional ? params["generation.mean"] : params["generation.secondary_mean"])
    + normal(secondary) * (exceptional ? params["generation.player_sd"] : params["generation.secondary_player_sd"]);
  const secondaryKeys: Stat[] = isPitcher(role) ? ["contact", "power", "speed", "defense"] : ["velocity", "control", "movement"];
  for (const key of secondaryKeys) {
    p.stats[key] = clamp(secondaryCenter + normal(secondary) * (exceptional ? params["generation.stat_sd"] : params["generation.secondary_stat_sd"]), 1);
  }
  const handSource={rngStates:{...s.rngStates,generation:hash(`${s.seed}:hands:${p.id}`)}};
  Object.assign(p,randomPlayerHands(pos,()=>random(handSource,'generation')));
  p.eligiblePositions=p.eligiblePositions.filter(position=>canPlayPosition(p,position));
  applySwitchContact(p);
  p.initialStats = { ...p.stats };
  applySchoolTrainingHistory(p,40*(grade-1));
  return p;
}
function schoolPositions(s:GameState,entryYear:number){
  const source={rngStates:{...s.rngStates,generation:hash(`${s.seed}:school-positions`)}};
  return schoolPositionIntake(s.teams.map(team=>team.id),entryYear,()=>random(source,'generation'),params['world.grade_size']);
}
export function generatedTalentCohort(players:Pick<Player,"id"|"primaryRole"|"teamId">[],seed:string,teams:GameState["teams"]=[]){
  const source={rngStates:{generation:hash(`${seed}:talent`),training:0,match:0,injury:0,draft:0,events:0}};
  return createTalentCohort(players.map(p=>({id:p.id,pitching:isPitcher(p.primaryRole),bias:recruitmentProfile(teams[p.teamId]).talentBias})),()=>random(source,"generation"));
}
function schoolTalentCohort(s:GameState,year:number,grade:number,intake:Map<number,Position[]>){
  const candidates=s.teams.flatMap(team=>Array.from({length:params["world.grade_size"]},(_,index)=>({
    id:`${year}-${team.id}-${grade}-${index}`,teamId:team.id,
    primaryRole:roleFor(intake.get(team.id)![index]),
  })));
  return generatedTalentCohort(candidates,`${s.seed}:school:${year}:${grade}`,s.teams);
}
export function previewPlayer(seed: string, name: string, position: Position) {
  const s = {...seededState(seed),teams:[createSchool(0)]};
  const p = makePlayer(s, 0, 1, 0, 2027, position);
  p.name = name;
  return p;
}
function seededState(seed:string):Pick<GameState,'seed'|'rngStates'>{
  return {seed,rngStates:{generation:hash(seed+':generation'),training:hash(seed+':training'),match:hash(seed+':match'),injury:hash(seed+':injury'),draft:hash(seed+':draft'),events:hash(seed+':events')}};
}
function skeleton(seed: string): GameState {
  return {
    schemaVersion: 1,
    proClubNamesVersion: 2,
    balanceVersion: balance.balanceVersion,
    ...seededState(seed),
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
  s.teams=Array.from({length:params["world.teams"]},(_,id)=>createSchool(id));
  const intakes=[1,2,3].map(grade=>schoolPositions(s,2028-grade)),own=intakes[0].get(teamId)!;
  const chosen=own.indexOf(position),replace=chosen>=0?chosen:own.indexOf('RP');
  if(replace>=0)[own[0],own[replace]]=[own[replace],own[0]];
  own[0]=position;
  const talents=[1,2,3].map(grade=>schoolTalentCohort(s,2027,grade,intakes[grade-1]));
  for (let t = 0; t < params["world.teams"]; t++) {
    for (let g = 1; g <= 3; g++) for (let i = 0; i < params["world.grade_size"]; i++) s.players.push(makePlayer(s, t, g, i, 2027, intakes[g-1].get(t)![i],talents[g-1].get(`2027-${t}-${g}-${i}`)));
  }
  const p = s.players[teamId * params["world.grade_size"] * 3];
  p.name = name.trim();
  s.playerId = p.id;
  syncJerseyNumbers(s);
  updateReputation(s);
  s.history.push({
    week: 1,
    ovr: overall(p), ovrScale: 100,
    fatigue: 0
  });
  capturePlayerEvaluations(s,"entry");
  return s;
}
export const getPlayer = (s: GameState) => s.players.find(p => p.id === s.playerId)!;
export function effective(p: Player, configuration:Record<string,number> = params): Stats {
  const params=configuration;
  const s = {
    ...equipmentStats(p)
  };
  const penalty = p.injury?.effects?0:p.injury?.penaltyRemaining ?? 0;
  const core: Stat[] = isPitcher(p.primaryRole) ? ["velocity", "control", "movement"] : ["contact", "power", "speed", "defense"];
  for (const k of core) s[k] -= penalty;
  for(const [key,value] of Object.entries(p.injury?.effects??{}))s[key as Stat]-=value!;
  const f = p.fatigue < params["fatigue.high_start"] ? 1 : 1 - (1 - params["fatigue.effective_min"]) * (p.fatigue - params["fatigue.high_start"]) / (100 - params["fatigue.high_start"]);
  for (const k of statKeys) if (k !== "stamina" && k !== "recovery") s[k] = clamp(s[k] * f, 1, params["match.effective_max"]);
  return s;
}
export function probabilities(b: Stats, p: Stats, defense: number, arm: number, configuration:Record<string,number> = params) {
  const params=configuration;
  const bounded = (prefix: string, diff: number) => clamp(params[`match.${prefix}_base`] + params[`match.${prefix}_slope`] * diff, params[`match.${prefix}_min`], params[`match.${prefix}_max`]);
  const attack = params["match.attack_contact"] * b.contact + params["match.attack_bq"] * b.bq;
  const pitch = params["match.pitch_velocity"] * p.velocity + params["match.pitch_control"] * p.control + params["match.pitch_movement"] * p.movement + params["match.pitch_bq"] * p.bq;
  // Professional high-power hitters turn more of their hits into home runs.
  // Keeping this inside the conditional hit branch preserves contact's impact
  // and never grants a season total or changes school batting parameters.
  const powerStart=params['match.hr_power_bonus_start']??70,powerFull=params['match.hr_power_bonus_full']??80;
  const powerBonus=(params['match.hr_power_bonus']??0)*clamp((b.power-powerStart)/Math.max(1,powerFull-powerStart),0,1)
    +(params['match.hr_elite_slope']??0)*Math.max(0,b.power-powerFull);
  return {
    bb: bounded("bb", b.bq - p.control),
    hit: clamp(params["match.hit_base"] + params["match.hit_slope"] * (attack - pitch) - params["match.defense_slope"] * (defense - params["match.defense_center"]), params["match.hit_min"], params["match.hit_max"]),
    hr: clamp(params['match.hr_base']+params['match.hr_slope']*(b.power-p.movement)+powerBonus,params['match.hr_min'],params['match.hr_max']),
    double: bounded("double", b.power - p.control),
    triple: bounded("triple", b.speed - arm),
    k: bounded("k", p.velocity - b.contact)
  };
}
export function mergeRecord(target: RecordLine, add: RecordLine) {
  if(add.fielding){
    const f=target.fielding??={version:1,chances:0,plays:0,expectedPlays:0,outs:{}};
    f.chances+=add.fielding.chances;f.plays+=add.fielding.plays;f.expectedPlays+=add.fielding.expectedPlays;
    for(const [position,outs]of Object.entries(add.fielding.outs))f.outs[position as Position]=(f.outs[position as Position]??0)+outs!;
  }
  mergeGameCounters(target,add);
  // The fixed record schema is merged on every evaluation and game. Avoid
  // allocating key arrays for every player, including when collecting totals.
  const b=target.batting,a=add.batting,p=target.pitching,q=add.pitching;
  b.PA+=a.PA;b.AB+=a.AB;b.H+=a.H;b["2B"]+=a["2B"];b["3B"]+=a["3B"];b.HR+=a.HR;
  b.BB+=a.BB;b.SO+=a.SO;b.R+=a.R;b.RBI+=a.RBI;
  if(a.SB!==undefined||b.SB!==undefined)b.SB=(b.SB??0)+(a.SB??0);
  if(a.CS!==undefined||b.CS!==undefined)b.CS=(b.CS??0)+(a.CS??0);
  p.BF+=q.BF;p.outs+=q.outs;p.H+=q.H;p.BB+=q.BB;p.SO+=q.SO;p.HR+=q.HR;p.R+=q.R;p.ER+=q.ER;
}
export function ops(r: RecordLine) {
  const b = r.batting;
  return b.PA && b.AB ? (b.H + b.BB) / b.PA + (b.H + b["2B"] + 2 * b["3B"] + 3 * b.HR) / b.AB : null;
}
const pitchingQ = (r: RecordLine) => r.pitching.BF ? (params["reputation.pitch_k"] * r.pitching.SO - params["reputation.pitch_bb"] * r.pitching.BB - params["reputation.pitch_hr"] * r.pitching.HR) / r.pitching.BF : 0;
export const available = (p: Player, date: string) => !p.injuryRetirement&&p.professional?.employment!=="retired" && !p.forcedRest && p.trainingPolicy.mode !== "rest" && !(p.injury && date < p.injury.unavailableUntil);
export const growthMultiplier = (p: Player) => p.proContract?.status === "developmental" ? .9 : 1;
export const selectionScore = (p: Player, role = p.primaryRole,position?:Position) => p.careerMode === "pro" || p.professional ? proSelectionScore(p, role,position) : roleScore(p, role,position)*leftPitcherMultiplier(p,role) - params["coach.fatigue_penalty"] * p.fatigue + params["coach.recent_max"] * clamp(p.recentZ, -1, 1) - (p.proContract?.status === "developmental" ? 6 : 0);
export const gameSelectionScore=(p:Player,role=p.primaryRole,date?:string,position?:Position)=>selectionScore(p,role,position)-proManagementPenalty(p,date);
// DH is a daily batting assignment, open to every remaining hitter.
export const canBatAsDH = (p: Player) => !isPitcher(p.primaryRole) || !!p.twoWay;
export const battingAbilityScore = (stats: Pick<Stats,'contact'|'power'|'bq'>) => stats.contact * .45 + stats.power * .45 + stats.bq * .1;
export function designatedHitterScore(p: Player) {
  return battingAbilityScore(effective(p));
}
export const compareDesignatedHitters = (a: Player, b: Player,date?:string) => designatedHitterScore(b)-proManagementPenalty(b,date) - designatedHitterScore(a)+proManagementPenalty(a,date) || a.id.localeCompare(b.id);
export function lineup(roster: Player[], date: string,selectedStarter?:Player) {
  const byPitchingScore=(a:Player,b:Player)=>gameSelectionScore(b,pitchingRole(b),date)-gameSelectionScore(a,pitchingRole(a),date)||a.id.localeCompare(b.id);
  const professional=roster.some(p=>p.careerMode==='pro'||!!p.professional);
  const candidates = roster.filter(p => available(p, date));
  const pitchingPool=candidates.filter(p=>p.eligiblePositions.includes('SP')&&p.fatigue<params['coach.replace_fatigue']&&(!professional||isPitcher(pitchingRole(p))));
  const chooseStarter=(pool:Player[])=>pool.filter(p=>pitchingRole(p)==='선발'&&p.fatigue<params['coach.starter_fatigue']&&(!p.lastPitched||date>=addDays(p.lastPitched,params['coach.starter_rest']+1))).sort(byPitchingScore)[0]??(professional?undefined:[...pool].sort((a,b)=>a.fatigue-b.fatigue||byPitchingScore(a,b))[0]);
  const plannedStarter=selectedStarter??chooseStarter(pitchingPool);
  const field: Player[] = [];
  for (const pos of ["C", "SS", "CF", "2B", "1B", "3B", "LF", "RF", "DH"] as Position[]) {
    if (pos === 'DH') {
      const hitter = candidates.filter(p => canBatAsDH(p) && !field.includes(p)).sort((a,b)=>compareDesignatedHitters(a,b,date))[0];
      if (hitter) field.push(hitter);
      continue;
    }
    // Pitching two-way players bat at DH, so they never occupy a defensive
    // position and the mound simultaneously. Resting starters can still field.
    const eligible=candidates.filter(p=>p.eligiblePositions.includes(pos)&&canPlayPosition(p,pos)&&!field.includes(p)&&
      (!p.twoWay||p!==plannedStarter&&pitchingRole(p)==='선발'));
    const natural=professional?eligible.filter(p=>currentProPosition(p,pos)):[];
    // Compete for the current job. Utility eligibility is only an emergency
    // cover when no available player currently holds that position.
    const p = (natural.length?natural:eligible).sort((a, b) => (professional?farmSelectionTier(a)-farmSelectionTier(b):0)||Number(professional&&guaranteedProStarter(b,pos,date))-Number(professional&&guaranteedProStarter(a,pos,date)) || gameSelectionScore(b, roleFor(pos),date,pos) - gameSelectionScore(a, roleFor(pos),date,pos) || a.id.localeCompare(b.id))[0];
    if (p) field.push(p);
  }
  const pitchers = pitchingPool.filter(p=>!field.includes(p)||!!p.twoWay);
  const starter = selectedStarter??chooseStarter(pitchers);
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
/** @deprecated Legacy balance API; live play and previews use injuryRiskEstimate. */
export function injuryRisk(f: number, trained = false) {
  const fatigueRisk = f < params["fatigue.risk_start"] ? 0 : f < params["fatigue.high_start"] ? params["injury.risk_at60"] + params["injury.risk_slope60"] * (f - params["fatigue.risk_start"]) : params["injury.risk_at80"] + params["injury.risk_slope80"] * (f - params["fatigue.high_start"]);
  return 1 - (1 - fatigueRisk) * (1 - (trained ? params["injury.training_base_risk"] : 0));
}
export function npcPolicy(p: Player, date: string, hasGame: boolean) {
  const policy = defaultPolicy(p.primaryRole);
  const recovering = ["light", "rest"].includes(p.trainingPolicy.mode) && p.fatigue > params["coach.recover_target"];
  if (p.injuryRetirement||p.forcedRest || (p.injury && date < p.injury.unavailableUntil&&injuryView(p,date).stage!=='rehab')) {
    policy.mode = "rest";
    for (const k of ticketKeys) policy.tickets[k] = 0;
  } else if (hasGame || p.fatigue >= params["coach.rest_fatigue"] || recovering) {
    policy.mode = "light";
    const keys = [...ticketKeys].sort((a, b) => policy.tickets[a] - policy.tickets[b] || a.localeCompare(b));
    const target=trainingLoad(equipmentStats(p).recovery,0).neutralTickets*.5;
    for (const k of keys) while (policy.tickets[k] > 0 && trainingEffort(policy).equivalentTickets > target) policy.tickets[k]--;
  }
  p.trainingPolicy = injuryTrainingPolicy(p,policy,date);
}
// Scoped to one synchronous advance: event resumes and edited states start fresh.
export type RecentReputationCache=Map<Player,{source:Player["recentAppearances"];length:number;last:Player["recentAppearances"][number]|undefined;pitching:boolean;limit:number;record:RecordLine}>;
export function updateReputation(s: GameState,cache?:RecentReputationCache) {
  for (const recent of [false, true]) {
    const records = s.players.map(p => {
      if (!recent) return p.seasonStats;
      const pitching = isPitcher(p.primaryRole);
      const source=p.recentAppearances,limit=params[pitching?"coach.recent_outs":"coach.recent_pa"],last=source.at(-1),previous=cache?.get(p);
      if(previous&&previous.source===source&&previous.length===source.length&&previous.last===last&&previous.pitching===pitching&&previous.limit===limit)return previous.record;
      const r = emptyRecord();
      let count = 0;
      for (let i = p.recentAppearances.length - 1; i >= 0; i--) {
        if (count >= limit) break;
        const a = p.recentAppearances[i];
        mergeRecentRecord(r, a);
        count += recentSample(a, pitching);
      }
      cache?.set(p,{source,length:source.length,last,pitching,limit,record:r});
      return r;
    });
    const total = emptyRecord();
    for (const r of records) mergeRecord(total, r);
    if (!recent) {s.records = total;continue;}
    const zs = new Map<string, number>();
    for (const pitching of [false, true]) {
      const league = pitching ? pitchingQ(total) : ops(total) ?? 0;
      const prior = params[pitching ? "reputation.pitcher_prior" : "reputation.hitter_prior"];
      const evaluated:{p:Player;adjusted:number}[]=[];
      for(let i=0;i<s.players.length;i++){
        const p=s.players[i],r=records[i];
        if(!(pitching?r.pitching.outs>0:r.batting.PA>0))continue;
        const n = pitching ? r.pitching.outs : r.batting.PA;
        evaluated.push({
          p,
          adjusted: (n * (pitching ? pitchingQ(r) : ops(r) ?? 0) + prior * league) / (n + prior)
        });
      }
      const mean = evaluated.reduce((a, b) => a + b.adjusted, 0) / (evaluated.length || 1);
      const sd = Math.sqrt(evaluated.reduce((a, b) => a + (b.adjusted - mean) ** 2, 0) / (evaluated.length || 1));
      for (const {
        p,
        adjusted
      } of evaluated) if (isPitcher(p.primaryRole) === pitching) zs.set(p.id, sd ? (adjusted - mean) / sd : 0);
    }
    for (const p of s.players) p.recentZ = zs.get(p.id) ?? 0;
  }
  updateEvaluationReputations(s);
}
export { draftBoard, draftPlayers, draftForecast, draftProjection, draftClubs,draftClubOrder } from "./draft";
export function promote(s: GameState) {
  capturePlayerEvaluations(s,"season-end");
  // Grade 1/2 careers also have graduating NPC seniors. Evaluate their draft
  // with a private stream so recruitment does not consume the live draft RNG.
  updateSchoolPrestige(s, selectSchoolDraft({ ...s, rngStates: { ...s.rngStates } }));
  for (const p of s.players) {
    p.career.push({
      year: s.calendar.seasonYear,
      grade: p.grade,
      schoolId: p.teamId,
      schoolName: s.teams[p.teamId].name,
      records: structuredClone(p.seasonStats),
      stats: {
        ...p.stats
      }
    });
    p.grade++;
    delete p.freshmanReserve;
    p.seasonStats = emptyRecord();
    p.recentAppearances = [];
    p.recentZ = 0;
  }
  s.players = s.players.filter(p => p.grade <= 3);
  const year = s.calendar.seasonYear + 1;
  const intake=schoolPositions(s,year),talents=schoolTalentCohort(s,year,1,intake);
  for (const t of s.teams) {
    t.wins = t.losses = t.draws = 0;
    for (let i = 0; i < params["world.grade_size"]; i++) s.players.push(makePlayer(s, t.id, 1, i, year, intake.get(t.id)![i],talents.get(`${year}-${t.id}-1-${i}`)));
  }
  s.calendar = calendar(year);
  syncJerseyNumbers(s);
  capturePlayerEvaluations(s,"season-start");
}
export function assignRole(p: Player, role: Role) {
  const pos = (["1B", p.throws==='L'?"CF":"SS", "C", "SP", "RP", "CP"] as Position[]).find(position => roleFor(position) === role)!;
  assertPositionEligible(p,pos);
  p.primaryRole = role; p.preferredRole = role; p.position = pos;
  if (p.twoWay) { if (isPitcher(role)) p.twoWay.pitchingPosition = pos; else p.twoWay.battingPosition = pos; }
  p.eligiblePositions = [...new Set([...p.eligiblePositions, ...eligible(pos)])].filter(position=>canPlayPosition(p,position));
  p.reputation = reputationScore(p);
}
export function answerOffer(input: GameState, accept: boolean) {
  const s = structuredClone(input);
  const p = getPlayer(s);
  if (p.roleOffer && accept) assignRole(p, p.roleOffer);
  s.pendingEvents = s.pendingEvents.filter(event => event.type !== "roleOffer");
  p.roleOffer = null;
  p.offerWeeks = 0;
  p.offerCooldown = params["coach.offer_cooldown"];
  syncJerseyNumbers(s);
  return captureEvaluationChange(s,getPlayer(input));
}
