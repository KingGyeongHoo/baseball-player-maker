import type { GameState, Player, ProLevel, RecordLine } from "./types";
import type { ProWarAssessment, ProWarLine } from "./pro-types";
import { validFieldingRecord } from "./fielding";

// Game WAR, not official fWAR/bWAR. Ability produces game outcomes; it is never
// added to this record-based score. Legacy missing fielding is not fabricated.
export const proWarRules = {
  battingWeights: { BB: 0.69, single: 0.89, double: 1.27, triple: 1.62, HR: 2.1 },
  battingScale: 1.2,
  replacementBattingRunsPerPA: 20 / 600,
  replacementPitchingRunsPerNine: 1,
  leaguePriorPA: 600,
  leaguePriorIP: 180,
  leagueWoba: 0.32,
  leagueFipCore: 0.9,
  leagueEra: 4,
  fipWeight: 0.7,
  eraWeight: 0.3,
  scoreAtZero: 71,
  scorePerWin: 2,
  farmWeight: 0.35,
  farmMaxWins: 2,
  battingSeasonPA: 600,
  starterSeasonOuts: 540,
  relieverSeasonOuts: 180,
  relieverWinScale: 3,
  fieldingRunValue: 0.75,
  positionalRuns: { C:12.5,SS:7.5,CF:2.5,"2B":2.5,"1B":-12.5,"3B":2.5,LF:-7.5,RF:-7.5,DH:-17.5 },
  positionalSeasonOuts: 4050,
  fieldingPriorChances: 500,
} as const;

type League = { woba: number; fipCore: number; era: number; runsPerWin: number;fieldingResidual:number };
export type ProWarContext = { year: number } & Record<ProLevel, League>;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const rules = proWarRules;
function validBatting(r: RecordLine) {
  const b = r.batting;
  return [b.PA, b.AB, b.H, b.BB, b["2B"], b["3B"], b.HR].every(n => Number.isFinite(n) && n >= 0)
    && b.PA > 0 && b.AB + b.BB > 0 && b.PA >= b.AB + b.BB && b.H <= b.AB
    && b["2B"] + b["3B"] + b.HR <= b.H;
}
function validPitching(r: RecordLine) {
  const q = r.pitching;
  return [q.BF, q.outs, q.HR, q.BB, q.SO, q.ER].every(n => Number.isFinite(n) && n >= 0)
    && q.BF > 0 && q.SO <= q.outs && q.outs <= q.BF && q.HR + q.BB + q.SO <= q.BF;
}
function battingRuns(r: RecordLine) {
  const b = r.batting, w = rules.battingWeights;
  return b.BB * w.BB + (b.H - b["2B"] - b["3B"] - b.HR) * w.single
    + b["2B"] * w.double + b["3B"] * w.triple + b.HR * w.HR;
}
const fipCoreRuns = (r: RecordLine) => 13 * r.pitching.HR + 3 * r.pitching.BB - 2 * r.pitching.SO;

// Aggregate once for season settlement; UI projections use the same live context.
// Retired-player totals keep a retirement from changing the league baseline.
export function createProWarContext(s: GameState): ProWarContext {
  const league = (level: ProLevel): League => {
    let pa = 0, weighted = 0, ip = 0, core = 0, er = 0,chances=0,residual=0;
    const add = (r?: RecordLine) => {
      if (!r) return;
      if (validBatting(r)) { pa += r.batting.PA; weighted += battingRuns(r); }
      if (validPitching(r)) { ip += r.pitching.outs / 3; core += fipCoreRuns(r); er += r.pitching.ER; }
      if(validFieldingRecord(r.fielding)){chances+=r.fielding.chances;residual+=r.fielding.plays-r.fielding.expectedPlays;}
    };
    for (const p of s.players) if (p.professional) add(p.seasonByLevel?.[level]);
    add(s.proWorld?.retiredRecords?.[`${s.calendar.seasonYear}:${level}`]);
    const era = (er * 9 + rules.leagueEra * rules.leaguePriorIP) / (ip + rules.leaguePriorIP);
    return {
      woba: (weighted + rules.leagueWoba * rules.leaguePriorPA) / (pa + rules.leaguePriorPA),
      fipCore: (core + rules.leagueFipCore * rules.leaguePriorIP) / (ip + rules.leaguePriorIP),
      era,
      runsPerWin: clamp(1.5 * era + 4, 8, 12),
      fieldingResidual:residual/(chances+rules.fieldingPriorChances),
    };
  };
  return { year: s.calendar.seasonYear, first: league("first"), second: league("second") };
}

function warLine(r: RecordLine | undefined, league: League): ProWarLine {
  const line: ProWarLine = { batting: 0, pitching: 0, fielding: 0, positional: 0, pa: 0, outs: 0, bf: 0, fieldingChances:0, fieldingOuts:0 };
  if (!r) return line;
  if (validBatting(r)) {
    line.pa = r.batting.PA;
    line.batting = ((battingRuns(r) - league.woba * line.pa) / rules.battingScale
      + rules.replacementBattingRunsPerPA * line.pa) / league.runsPerWin;
  }
  if (validPitching(r)) {
    line.outs = r.pitching.outs; line.bf = r.pitching.BF;
    const ip = line.outs / 3;
    const fipRuns = (league.fipCore * ip - fipCoreRuns(r)) / 9;
    const eraRuns = league.era * ip / 9 - r.pitching.ER;
    line.pitching = (rules.fipWeight * fipRuns + rules.eraWeight * eraRuns
      + rules.replacementPitchingRunsPerNine * ip / 9) / league.runsPerWin;
  }
  if(validFieldingRecord(r.fielding)){
    const f=r.fielding;
    line.fielding=(f.plays-f.expectedPlays-league.fieldingResidual*f.chances)*rules.fieldingRunValue/league.runsPerWin;
    line.fieldingChances=f.chances;
    for(const [pos,outs]of Object.entries(f.outs)){
      line.fieldingOuts+=outs!;
      line.positional+=rules.positionalRuns[pos as keyof typeof rules.positionalRuns]*outs!/rules.positionalSeasonOuts/league.runsPerWin;
    }
  }
  return line;
}

// WAR accumulates from actual events, without annualizing a small sample or
// mixing in OVR, fatigue, reputation or registration status.
export function proWarAssessment(p: Player, context: ProWarContext = {
  year:0,first:{woba:rules.leagueWoba,fipCore:rules.leagueFipCore,era:rules.leagueEra,runsPerWin:10,fieldingResidual:0},
  second:{woba:rules.leagueWoba,fipCore:rules.leagueFipCore,era:rules.leagueEra,runsPerWin:10,fieldingResidual:0},
}): ProWarAssessment {
  const first = warLine(p.seasonByLevel?.first, context.first);
  const second = warLine(p.seasonByLevel?.second, context.second);
  const pitchingPosition = p.twoWay?.pitchingPosition ?? p.position;
  const relief = pitchingPosition === "RP" || pitchingPosition === "CP";
  const wins = (r: ProWarLine) => r.batting + r.pitching * (relief ? rules.relieverWinScale : 1) + r.fielding + r.positional;
  const firstCoverage=clamp(first.pa/rules.battingSeasonPA+first.outs/(relief?rules.relieverSeasonOuts:rules.starterSeasonOuts),0,1);
  const farmWins=Math.min(rules.farmMaxWins,wins(second)*rules.farmWeight)*(1-firstCoverage);
  const equivalentWins=wins(first)+farmWins;
  const score=clamp(rules.scoreAtZero+rules.scorePerWin*equivalentWins,0,100);
  return { version: 1, score, equivalentWins, first, second };
}

export function proAppearanceScore(p:Player,context?:ProWarContext):number|null{
  const frozen=context?p.professional?.assessments?.find(row=>row.year===context.year):undefined;
  return frozen?frozen.score:proWarAssessment(p,context).score;
}

export function validProWarAssessment(value: unknown): value is ProWarAssessment {
  if (!value || typeof value !== "object") return false;
  const w = value as ProWarAssessment;
  return w.version === 1 && Number.isFinite(w.score) && w.score>=0 && w.score<=100 && Number.isFinite(w.equivalentWins)
    && Math.abs(w.score-clamp(rules.scoreAtZero+rules.scorePerWin*w.equivalentWins,0,100))<1e-7
    && [w.first, w.second].every(r => r && [r.batting,r.pitching,r.fielding,r.positional].every(Number.isFinite)
      && [r.pa, r.outs, r.bf,r.fieldingChances,r.fieldingOuts].every(n => Number.isInteger(n) && n >= 0));
}
