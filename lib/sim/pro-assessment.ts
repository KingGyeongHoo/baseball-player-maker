import {conversionYear} from "./pro-conversion";
import { selectionScore, roleScore } from "./engine";
import { rosterGrade } from "../roster-grades";
import { proContractRules as rules } from "./pro-contract-rules";
import type { GameState, Player, ProSquad, RecordLine } from "./types";
import type { ProSeasonAssessment } from "./pro-types";
import { createProWarContext, emptyProWarAssessment, firstTeamClubWar, proWarAssessment, rawSeasonWar, proWarRules, type ProWarContext } from "./pro-war";
import {proSeasonForm} from "./pro-selection";
import {farmSeasonGames} from './pro-farm-schedule';
import {recordHonorRegistration,regularSeasonDays} from './retirement-honors';
import {seasonEvaluation} from './pro-season-evaluation';
import {injurySeasonAdjustment} from './injury-system';
import {playerCareerEvaluation} from './pro-career-evaluation';
import {seasonRankGrade} from './pro-season-ranking';
const squad = (id: number): ProSquad | null =>
  id < 0
    ? null
    : ((["first", "second", "third", "developmental"] as const)[
        Math.floor(id / 10)
      ] ?? null);
const average = (rows: ProSeasonAssessment[]) => {
  const values = rows.flatMap((r) => (r.score === null || r.clubGamesShortage ? [] : [r.war?seasonEvaluation(r.war,r.seasonEvaluation?.injury).score:r.score]));
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
};
type FirstAppearances = {
  games: number;
  pa: number;
  bf: number;
  batting: number;
  pitching: number;
};
// Count a two-way player once per completed regular-season game, including after trades.
export function firstTeamAppearances(s: GameState) {
  const counts = new Map<string, FirstAppearances>(),
    seen = new Set<string>();
  for (const game of s.calendar.events) {
    if (
      game.competitionId !== "pro-first" ||
      game.status !== "completed" ||
      !game.date.startsWith(`${s.calendar.seasonYear}-`) ||
      seen.has(game.id)
    )
      continue;
    seen.add(game.id);
    for (const [id, r] of Object.entries(game.boxScore)) {
      if (
        !(
          r.batting.PA ||
          r.pitching.BF ||
          r.games?.batting ||
          r.games?.pitching
        )
      )
        continue;
      const value = counts.get(id) ?? {
        games: 0,
        pa: 0,
        bf: 0,
        batting: 0,
        pitching: 0,
      };
      value.games++;
      value.pa += r.batting.PA;
      value.bf += r.pitching.BF;
      if (r.batting.PA || r.games?.batting) value.batting++;
      if (r.pitching.BF || r.games?.pitching) value.pitching++;
      counts.set(id, value);
    }
  }
  return counts;
}
function firstGameCount(
  first?: RecordLine,
  observed?: FirstAppearances,
): number | null {
  if (
    observed &&
    (!first ||
      (observed.pa >= first.batting.PA &&
        observed.bf >= first.pitching.BF &&
        observed.batting >= (first.games?.batting ?? 0) &&
        observed.pitching >= (first.games?.pitching ?? 0)))
  )
    return observed.games;
  if (!first) return null;
  const batting = first.games?.batting,
    pitching = first.games?.pitching;
  if (
    (first.batting.PA > 0 && batting === undefined) ||
    (first.pitching.BF > 0 && pitching === undefined)
  )
    return null;
  // Old aggregate two-way counters do not retain the overlap between batting and pitching games.
  if ((batting ?? 0) > 0 && (pitching ?? 0) > 0) return null;
  return (batting ?? 0) + (pitching ?? 0);
}
// Consecutive same-club renewals retain one review period. Only an actual club
// change starts a new one, including returning after a stint at another club.
function clubReviewStart(p:Player){
  const pro=p.professional,stints=pro?.service??[];
  let index=stints.length-1;
  while(index>0&&stints[index-1].club===stints[index].club)index--;
  const current=stints[index],club=pro?.contract?.club??(p.teamId>=0?p.teamId%10:undefined);
  return index>0&&current?.club===club?current.from:-Infinity;
}
export function renewalAssessment(p: Player, year: number) {
  const start = Math.max((p.professional?.rookieYear ?? year) + rules.rookieGraceSeasons,clubReviewStart(p));
  const rows = (p.professional?.assessments ?? []).filter(
    (r) => r.year >= start && r.year <= year && !r.clubGamesShortage,
  );
  const score = average(rows);
  return {
    score,
    grade: rosterGrade(score, true),
    seasons: rows.filter((r) => r.score !== null).length,
  };
}
function withCumulative(
  row: Omit<ProSeasonAssessment, "cumulative" | "cumulativeGrade">,
  past: ProSeasonAssessment[],
): ProSeasonAssessment {
  const cumulative = average([
    ...past,
    { ...row, cumulative: null, cumulativeGrade: "—" },
  ]);
  return { ...row, cumulative, cumulativeGrade: rosterGrade(cumulative, true) };
}
export function hydrateAssessments(s: GameState, p: Player): boolean {
  if (!p.professional) return false;
  if (p.professional.assessments !== undefined) {
    let changed = normalizeUnplayedAssessments(s,p);
    for(const row of p.professional.assessments)if(row.seasonRank?.version===1){
      row.seasonRank.version=2;
      row.grade=row.seasonRank.grade=seasonRankGrade(row.seasonRank.rank,row.seasonRank.total);
      changed=true;
    }
    for(const row of p.professional.assessments)if(conversionYear(p)===row.year){
      if(row.reserveSeason||row.developmental||row.squad==='developmental'){
        row.reserveSeason=false;row.developmental=false;
        if(row.squad==='developmental')row.squad='third';
        changed=true;
      }
    }
    for (const row of p.professional.assessments) {
      if (
        row.firstTeam !== undefined &&
        row.secondOnly !== undefined &&
        row.firstGames !== undefined
      )
        continue;
      const season = p.career.find(
          (r) => r.year === row.year && r.careerMode === "pro",
        ),
        first = season?.byLevel?.first;
      row.firstTeam ??=
        row.squad === "first" ||
        (first?.batting.PA ?? 0) > 0 ||
        (first?.pitching.BF ?? 0) > 0;
      row.secondOnly ??=
        row.squad === "second" && !row.firstTeam && !row.reserveSeason;
      if (row.firstGames === undefined)
        row.firstGames = firstGameCount(
          first,
          row.year === s.calendar.seasonYear
            ? firstTeamAppearances(s).get(p.id)
            : undefined,
        );
      changed = true;
    }
    return changed;
  }
  const history: ProSeasonAssessment[] = [];
  for (const season of [...p.career]
    .filter(
      (r) =>
        r.careerMode === "pro" &&
        (r.year < s.calendar.seasonYear ||
          (r.year === s.calendar.seasonYear && s.proWorld?.seasonClosed)),
    )
    .sort((a, b) => a.year - b.year)) {
    if (history.some((r) => r.year === season.year)) continue;
    const observation = p.evaluationHistory
      ?.filter((r) => r.season === season.year && r.reason === "season-end")
      .at(-1);
    const role = observation?.role ?? p.primaryRole,
      ability = roleScore({ ...p, stats: season.stats??observation?.stats??p.stats }, role);
    const score = observation?.comparison.legacyRegistration ?? ability;
    const level = squad(season.schoolId ?? -1),
      developmental = conversionYear(p)!==season.year&&level === "developmental";
    const first = season.byLevel?.first,
      firstTeam =
        level === "first" ||
        (first?.batting.PA ?? 0) > 0 ||
        (first?.pitching.BF ?? 0) > 0;
    history.push(
      withCumulative(
        {
          year: season.year,
          date: observation?.date ?? `${season.year}-10-31`,
          score,
          grade: rosterGrade(score, true),
          ability,
          role,
          squad: level,
          developmental,
          reserveSeason: conversionYear(p)!==season.year&&(level === "third" || developmental),
          firstTeam,
          secondOnly: level === "second" && !firstTeam,
          firstGames: firstGameCount(
            first,
            season.year === s.calendar.seasonYear
              ? firstTeamAppearances(s).get(p.id)
              : undefined,
          ),
          source: "reconstructed",
        },
        history,
      ),
    );
  }
  p.professional.assessments = history;
  return true;
}
export function recordAssessmentDay(s: GameState, p: Player) {
  recordHonorRegistration(s,p);
  const pro = p.professional;
  if (!pro || pro.employment !== "active" || p.teamId < 0) return;
  const usage = (pro.assessmentUsage ??= {
    year: s.calendar.seasonYear,
    activeDays: 0,
    lowerDays: 0,
    upperDays: 0,
  });
  if (usage.year !== s.calendar.seasonYear)
    pro.assessmentUsage = {
      year: s.calendar.seasonYear,
      activeDays: 0,
      lowerDays: 0,
      upperDays: 0,
    };
  const current = pro.assessmentUsage!;
  if (current.lastDate === s.date) return;
  current.lastDate = s.date;
  current.activeDays++;
  if (p.teamId >= 20 || p.proContract?.status === "developmental")
    current.lowerDays++;
  else current.upperDays++;
  if (p.teamId < 10) current.firstDays = (current.firstDays ?? 0) + 1;
}
export function recordSeasonAssessment(
  s: GameState,
  p: Player,
  appearances = firstTeamAppearances(s),
  warContext?: ProWarContext,
): ProSeasonAssessment | undefined {
  const pro = p.professional;
  if (!pro) return;
  // Hydrate only completed earlier years; the current year must use its live score.
  if (pro.assessments === undefined)
    hydrateAssessments(
      {
        ...s,
        proWorld: s.proWorld
          ? { ...s.proWorld, seasonClosed: false }
          : undefined,
      },
      p,
    );
  const rows = pro.assessments!,
    existing = rows.find((r) => r.year === s.calendar.seasonYear);
  if (existing) return existing;
  const usage =
    pro.assessmentUsage?.year === s.calendar.seasonYear
      ? pro.assessmentUsage
      : undefined;
  const first = p.seasonByLevel?.first,
    second = p.seasonByLevel?.second;
  const pa = (first?.batting.PA ?? 0) + (second?.batting.PA ?? 0),
    outs = (first?.pitching.outs ?? 0) + (second?.pitching.outs ?? 0);
  const context=warContext??createProWarContext(s);
  const evaluation = currentSeasonAssessment(s, p, context), noAppearances=pro.employment==='active'&&!hasSeasonAppearance(p), score = evaluation.score;
  const promoted =
    !!usage &&
    usage.upperDays >= rules.upperDays &&
    (pa >= rules.upperPA || outs >= rules.upperOuts);
  // A successful trial conversion starts a fresh reserve streak next season.
  const convertedTrial =
    (pro.developmentalRetry?.year === s.calendar.seasonYear||conversionYear(p)===s.calendar.seasonYear) &&
    p.proContract?.status === "regular";
  const lower =
    !convertedTrial &&
    (usage
      ? usage.lowerDays > 0 &&
        !promoted &&
        (usage.lowerDays >= usage.activeDays / 2 || p.teamId >= 20)
      : p.teamId >= 20);
  const firstTeam =
    (usage?.firstDays ?? 0) > 0 ||
    (pro.registration.year === s.calendar.seasonYear &&
      pro.registration.days > 0) ||
    (p.teamId >= 0 && p.teamId < 10) ||
    (first?.batting.PA ?? 0) > 0 ||
    (first?.pitching.BF ?? 0) > 0;
  const secondOnly =
    pro.employment === "active" &&
    squad(p.teamId) === "second" &&
    !firstTeam &&
    !lower &&
    !convertedTrial;
  const row = withCumulative(
    {
      year: s.calendar.seasonYear,
      date: s.date,
      salary:pro.contract&&pro.contract.startYear<=s.calendar.seasonYear&&pro.contract.endYear>=s.calendar.seasonYear?pro.contract.salary:null,
      score,
      ...(noAppearances?{noAppearances:true as const}:{}),
      ...(evaluation.war ? { war: evaluation.war, ...(!noAppearances?{firstWarByClub:firstTeamClubWar(p,context)}:{}) } : {}),
      ...(evaluation.seasonEvaluation ? { seasonEvaluation: evaluation.seasonEvaluation } : {}),
      grade: noAppearances?'F':rosterGrade(score, true),
      ability: roleScore(p),
      role: p.primaryRole,
      squad: squad(p.teamId),
      developmental: p.proContract?.status === "developmental",
      reserveSeason: pro.employment === "active" && lower,
      firstTeam,
      secondOnly,
      firstGames: firstGameCount(first, appearances.get(p.id)),
      honorRegistration:{seasonDays:regularSeasonDays(s),firstDaysByClub:pro.honorUsage?.year===s.calendar.seasonYear?{...pro.honorUsage.firstDaysByClub}:{},...(pro.honorUsage?.year===s.calendar.seasonYear&&pro.honorUsage.injuryDaysByClub?{injuryDaysByClub:{...pro.honorUsage.injuryDaysByClub}}:{})},
      ...(!noAppearances&&clubGamesShortage(s,p)?{clubGamesShortage:true}:{}),
      source: "season-end",
    },
    rows,
  );
  rows.push(row);
  rows.sort((a, b) => a.year - b.year);
  if(row.clubGamesShortage&&pro.developmentalRetry&&pro.developmentalRetry.deadlineYear<=row.year)
    pro.developmentalRetry.deadlineYear=row.year+1;
  return row;
}
export function currentSeasonAssessment(s: GameState, p: Player, warContext?: ProWarContext) {
  if(p.professional?.employment!=='active')return {score:null};
  if(!hasSeasonAppearance(p)){
    const war=emptyProWarAssessment(),evaluation=seasonEvaluation(war,injurySeasonAdjustment(p,s.calendar.seasonYear,s.date));
    return {score:evaluation.score,war,seasonEvaluation:evaluation,noAppearances:true as const};
  }
  const context=warContext??createProWarContext(s),war = proWarAssessment(p, context);
  const evaluation=seasonEvaluation(war,injurySeasonAdjustment(p,s.calendar.seasonYear,s.date));
  return { score: evaluation.score, war, seasonEvaluation:evaluation };
}

// Official appearances include pinch runners and defensive substitutions with
// no PA/BF. Spring exhibitions do not count toward the completed season.
export function hasSeasonAppearance(p:Player){
  return [p.seasonByLevel?.first,p.seasonByLevel?.second,p.seasonStats,p.seasonPostseason,p.seasonFarmPostseason].some(r=>!!r&&(
    r.batting.PA>0||r.pitching.BF>0||r.pitching.outs>0||(r.games?.batting??0)>0||(r.games?.pitching??0)>0
    ||(r.batting.SB??0)>0||(r.batting.CS??0)>0||r.batting.R>0||Object.values(r.fielding?.outs??{}).some(n=>(n??0)>0)));
}

// Upgrade the earlier F-without-WAR representation after save integrity checks.
// Only explicitly marked historical rows and the verifiable current season are changed.
export function normalizeUnplayedAssessments(s:GameState,p:Player){
  const rows=p.professional?.assessments;if(!rows)return false;
  let changed=false;
  for(const row of rows){
    if(row.seasonEvaluation?.injury)continue;
    if(!row.noAppearances&&!(row.score===null&&row.year===s.calendar.seasonYear&&p.professional?.employment==='active'&&!hasSeasonAppearance(p)))continue;
    if(row.noAppearances&&row.war?.equivalentWins===0&&row.score===71&&row.grade==='F'&&row.seasonEvaluation?.score===71&&!row.seasonRank&&!row.clubGamesShortage)continue;
    row.noAppearances=true;row.war=emptyProWarAssessment();row.seasonEvaluation=seasonEvaluation(row.war);row.score=row.seasonEvaluation.score;row.grade='F';
    delete row.seasonRank;delete row.clubGamesShortage;changed=true;
  }
  if(changed){let total=0,count=0;for(const row of [...rows].sort((a,b)=>a.year-b.year)){if(row.score!==null&&!row.clubGamesShortage){total+=row.score;count++;}row.cumulative=count?total/count:null;row.cumulativeGrade=rosterGrade(row.cumulative,true);}}
  return changed;
}
// Do not make roster/schedule failures look like a player's refusal to play.
// Only concluded games count, and the exception needs a substantial schedule
// with most games forfeited. A normal bench season remains reviewable.
export function clubGamesShortage(s:GameState,p:Player){
  const club=p.professional?.contract?.club??(p.teamId>=0?p.teamId%10:undefined);
  if(club===undefined)return false;
  const usage=p.professional?.assessmentUsage;
  const farmSeason=usage?.year===s.calendar.seasonYear&&usage.activeDays>0
    ?usage.activeDays-(usage.firstDays??0)>usage.activeDays/2:p.teamId>=10;
  if(!farmSeason)return false;
  const farm=s.calendar.events.filter(g=>g.competitionId==="pro-second"&&g.date.startsWith(`${s.calendar.seasonYear}-`)
    &&[g.homeTeamId,g.awayTeamId].includes(club+10)&&["completed","forfeit"].includes(g.status));
  const completed=farm.filter(g=>g.status==="completed").length;
  const first=p.seasonByLevel?.first;
  const firstGames=Math.max(first?.games?.batting??0,first?.games?.pitching??0);
  return farm.length>=Math.ceil(farmSeasonGames/3)&&completed<farm.length/2&&firstGames<=rules.firstGamesLimit;
}
export function assessmentValue(p: Player, year: number) {
  const rows = (p.professional?.assessments ?? []).filter(
      (r) => r.year <= year,
    ),
    current = rows.find((r) => r.year === year);
  const cumulative = average(rows),
    score = current ? current.clubGamesShortage||current.score===null?null:current.war?seasonEvaluation(current.war,current.seasonEvaluation?.injury).score:current.score : proWarAssessment(p).score;
  const basis = score ?? cumulative ?? proWarAssessment(p).score;
  return {
    current: score,
    cumulative,
    score:
      rules.currentWeight * basis +
      rules.cumulativeWeight * (cumulative ?? basis),
  };
}
export function firstTeamRetention(p: Player, year: number) {
  const career=playerCareerEvaluation(p,year),cumulative=career.first.cumulativeWar,
    grade = career.first.grade;
  return { cumulative, grade, bonus: rules.retentionMargins[grade] ?? 0 };
}
export function firstTeamDemotionMargin(p: Player, year: number) {
  const b = p.seasonByLevel?.first.batting;
  const established =
    selectionScore(p) >= 79 ||
    proSeasonForm(p,p.primaryRole,{first:p.seasonByLevel?.first}).value >= .35 ||
    (!!b && b.PA >= 40 && b.AB > 0 && b.H / b.AB >= 0.3);
  return (established ? 8 : 3) + firstTeamRetention(p, year).bonus;
}
export function releaseReviewWar(p:Player,row:ProSeasonAssessment){
  const role=row.seasonRank?.role??row.role??(p.twoWay?.pitchingPosition??p.position);
  const wins=row.noAppearances?0:row.war?rawSeasonWar(row.war):row.seasonRank?.war;
  const bullpen=['bullpen','reliever','closer','불펜','중간계투','마무리','RP','CP'].includes(role);
  // Adjust each positive bullpen season before adding the review window.
  // Negative seasons and the release thresholds are identical for every role.
  return wins!==undefined&&wins>0&&bullpen?wins*proWarRules.relieverWinScale:wins;
}

export function seasonExit(
  p: Player,
  year: number,
): {
  kind: "post-rookie-evaluation";
  reason: string;
} | null {
  if((p.age??19)>=36)return veteranSeasonExit(p,year);
  const rookie = rookieSeasonExit(p, year);
  if (rookie !== undefined) return rookie;
  const pro=p.professional,age=p.age??19;
  if(!pro||pro.employment!=='active'||age<23)return null;
  const duration=age<=27?4:age<=32?5:3;
  const start=Math.max(year-duration+1,pro.rookieYear+3,clubReviewStart(p),
    (pro.nonRenewal?.year??-Infinity)+1,(conversionYear(p)??-Infinity)+1,
    pro.developmentalRetry&&p.proContract?.status==='regular'?pro.developmentalRetry.year+1:-Infinity);
  const rows=(pro.assessments??[]).filter(row=>row.year>=start&&row.year<=year);
  if(!rows.some(row=>row.year===year))return null;
  const war=(row:ProSeasonAssessment)=>releaseReviewWar(p,row);
  const grade=(row:ProSeasonAssessment)=>row.noAppearances?'F':row.seasonRank?.grade??row.grade;
  const exit=(reason:string)=>({kind:'post-rookie-evaluation' as const,reason});
  const severe=age<=27?-2:-1,low=age<=27?0:1,total=age<=27?3:age<=32?5:3;
  if(rows.some(row=>war(row)!==undefined&&war(row)!<=severe))
    return exit(`최근 ${duration}시즌 중 WAR ${severe} 이하인 시즌이 있습니다.`);
  if(rows.filter(row=>war(row)!==undefined&&war(row)!<=low).length>=2)
    return exit(`최근 ${duration}시즌 중 방출 심사 WAR ${low} 이하인 시즌이 2회 이상입니다.`);
  if(age<=27&&rows.filter(row=>grade(row)==='F').length>=3)
    return exit('최근 4시즌 중 시즌 등급 F가 3회 이상입니다.');
  if(age>=28&&rows.filter(row=>['E','F'].includes(grade(row))).length>=3)
    return exit(age<=32?'최근 5시즌 중 시즌 등급 E 이하가 3회 이상입니다.':'최근 3시즌 연속 시즌 등급 E 이하입니다.');
  // Total WAR requires every calendar season in the window, with known WAR.
  const complete=Array.from({length:duration},(_,i)=>rows.find(row=>row.year===year-i));
  if(complete.every(row=>row&&war(row)!==undefined)){
    const totalLimit=total;
    if(complete.reduce((sum,row)=>sum+war(row!)!,0)<=totalLimit)
      return exit(`최근 ${duration}시즌 방출 심사 WAR 총합이 ${totalLimit} 이하입니다.`);
  }
  return null;
}

function veteranSeasonExit(p:Player,year:number):{kind:'post-rookie-evaluation';reason:string}|null {
  const pro = p.professional,clubStart=clubReviewStart(p),
    rows = (pro?.assessments ?? [])
      .filter((r) => r.year >= clubStart && r.year <= year)
      .sort((a, b) => b.year - a.year),
    latest = rows[0];
  if (!pro || pro.employment !== "active" || latest?.year !== year) return null;
  if(latest.clubGamesShortage)return null;
  const previous = rows.find((r) => r.year < year && r.score !== null);
  const growing =
    !!previous && latest.ability - previous.ability >= rules.growthGrace;
  const duration =
    (p.age ?? 19) >= rules.veteranAge ||
    (previous && latest.ability < previous.ability - rules.decline)
      ? rules.reviewYearsMin
      : (p.age ?? 19) <= rules.youngAge && growing
        ? rules.reviewYearsMax
        : rules.reviewYears;
  // A successful reentry gets a fresh review period, while lifetime salary history is retained.
  const reviewStart = Math.max(
    clubStart,
    conversionYear(p)!==undefined?conversionYear(p)!+1:-Infinity,
    (pro.nonRenewal?.year ?? -Infinity) + 1,
    pro.developmentalRetry && p.proContract?.status === "regular"
      ? pro.developmentalRetry.year + 1
      : -Infinity,
  );
  if (latest.score === null || year < reviewStart) return null;
  function streak(qualifies: (row: ProSeasonAssessment) => boolean) {
    let count = 0,
      expectedYear = year;
    for (const row of rows) {
      if (row.year !== expectedYear-- || row.year < reviewStart) break;
      if (row.score === null||row.clubGamesShortage) continue;
      if (!qualifies(row)) break;
      count++;
    }
    return count;
  }
  const low = streak(
    (row) =>
      row.year >= pro.rookieYear + rules.rookieGraceSeasons &&
      (row.noAppearances?'F':row.seasonRank?.grade??rosterGrade(row.score,true)) === "F",
  );
  return low >= duration
    ? {
        kind: "post-rookie-evaluation",
        reason: `시즌 평가 F가 ${low}개 평가 시즌 연속 이어졌습니다. (${duration}년 기준)`,
      }
    : null;
}

// The first three professional seasons are reviewed independently of age.
// Missing historical WAR is unknown, never silently treated as zero.
function rookieSeasonExit(p: Player, year: number): {kind:'post-rookie-evaluation';reason:string}|null|undefined {
  const pro=p.professional;
  if(!pro||pro.employment!=='active')return null;
  const seasons=year-pro.rookieYear+1;
  if(seasons>3)return undefined;
  if(seasons<1)return null;
  const rows=pro.assessments??[],latest=rows.find(row=>row.year===year);
  if(!latest)return null;
  const war=(row:ProSeasonAssessment)=>releaseReviewWar(p,row);
  const first=p.career.find(row=>row.year===year&&row.careerMode==='pro')?.byLevel?.first??p.seasonByLevel?.first;
  const pa=latest.war?.first.pa??first?.batting.PA??0;
  const outs=latest.war?.first.outs??first?.pitching.outs??0;
  const currentWar=war(latest);
  const severe=-1;
  if((pa>=60||outs>=90)&&currentWar!==undefined&&currentWar<=severe)
    return {kind:'post-rookie-evaluation',reason:`신인 최소 출전 기준(1군 60타석 또는 30이닝)을 충족한 시즌의 WAR이 ${severe} 이하입니다.`};
  if(seasons===3){
    const firstThree=Array.from({length:3},(_,i)=>rows.find(row=>row.year===pro.rookieYear+i));
    if(firstThree.every(row=>row&&war(row)!==undefined)){
      const totalLimit=1;
      if(firstThree.reduce((sum,row)=>sum+war(row!)!,0)<=totalLimit)
        return {kind:'post-rookie-evaluation',reason:`프로 첫 3시즌 WAR 총합이 ${totalLimit} 이하입니다.`};
    }
  }
  return null;
}

export function requiresDevelopmentalOffer(p: Player, year: number) {
  const pro = p.professional,
    denied = pro?.nonRenewal;
  if (
    !denied ||
    denied.year > year ||
    ["low-evaluation", "second-team", "reserve", "limited-appearances"].includes(denied.kind)
  )
    return false;
  const rows = (pro.assessments ?? []).filter((r) => r.year <= year),
    latest = rows.at(-1);
  if(pro.employment==="active"&&pro.developmentalRetry&&latest?.clubGamesShortage
    &&latest.year>=pro.developmentalRetry.year&&pro.developmentalRetry.club===pro.contract?.club)return false;
  const converted =
    (conversionYear(p)!==undefined&&conversionYear(p)!>=denied.year)||!!pro.developmentalRetry &&
    !!latest &&
    latest.year >= pro.developmentalRetry.year &&
    !latest.developmental;
  return !converted;
}
export function salaryUnits(score: number) {
  const bands = rules.salaryBands;
  for (let i = 1; i < bands.length; i++)
    if (score < bands[i][0]) {
      const [start, lo] = bands[i - 1],
        [end, hi] = bands[i];
      return (
        lo + ((hi - lo) * (Math.max(start, score) - start)) / (end - start)
      );
    }
  return bands.at(-1)![1];
}
