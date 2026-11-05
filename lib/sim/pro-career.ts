import { addDays, clamp, createGame, draftClubs, draftPlayers, emptyRecord, getPlayer, hash, isPitcher, params, previewPlayer, random, recovery, reputationScore, roleScore } from "./engine";
import { careerLeagueTable, developmentCalendar } from "./pro-calendar";
import { developmentalOffer, revealDraftResult } from "./draft-outcome";
import type { GameState, Player, Position, ProLevel, Team } from "./types";

export type CareerChoice = "join" | "tryout" | "college" | "developmental";
const slots: Position[] = ["C","C","C","1B","1B","2B","2B","3B","3B","SS","SS","LF","LF","CF","CF","RF","RF","DH","SP","SP","SP","SP","SP","SP","RP","RP","RP","RP","CP","CP"];
const firstNames = ["도현","민준","서준","지훈","현우","우진","건우","성민","승현","재윤","준혁","정우","동현","유찬","태민"];
const surnames = ["김","이","박","최","정","강","조","윤","장","임","한","송","서","오"];
const notice = (s: GameState, kind: NonNullable<GameState["careerNotice"]>["kind"], title: string, message: string) => {
  s.careerNotice = { id: `${s.date}:${s.week}:${kind}`, date: s.date, kind, title, message };
};
export const acknowledgeCareer = (input: GameState): GameState => { const s = structuredClone(input); delete s.careerNotice; return s; };
function path(s: GameState) {
  const p = getPlayer(s);
  return s.postSchool ??= { graduationYear: s.calendar.seasonYear, graduationSchool: s.teams[p.teamId].name, collegeYears: 0, tryouts: [] };
}
export function archiveCareerSeason(s: GameState, p: Player) {
  const year = s.calendar.seasonYear;
  if (p.career.some(row => row.year === year)) return;
  p.career.push({ year, grade: p.grade, records: structuredClone(p.seasonStats), stats: { ...p.stats }, schoolId: p.teamId, schoolName: s.teams[p.teamId].name,
    ...(s.careerMode ? { careerMode: s.careerMode, age: p.age } : {}), ...(p.seasonByLevel ? { byLevel: structuredClone(p.seasonByLevel) } : {}) });
}
function offSeason(p: Player, from: string, to: string) {
  const days = Math.max(0, (Date.parse(to) - Date.parse(from)) / 86400000);
  p.fatigue = clamp(p.fatigue * Math.max(0, 1 - params["fatigue.recovery_policy"] * recovery(p.stats.recovery)) ** days);
  if (p.injury && to >= p.injury.unavailableUntil) {
    const recoveredDays = (Date.parse(to) - Date.parse(p.injury.unavailableUntil)) / 86400000;
    p.injury.penaltyRemaining = Math.max(0, p.injury.originalPenalty * (1 - recoveredDays / Math.max(1,p.injury.penaltyRecoverDays)));
    if (!p.injury.penaltyRemaining) p.injury = null;
  }
  p.forcedRest = p.fatigue >= params["fatigue.force_rest"]; p.seasonStats = emptyRecord(); p.recentAppearances = []; p.recentZ = 0; p.lastPitched = null;
  p.roleOffer = null; p.offerCandidate = null; p.offerWeeks = 0; delete p.transferAdaptation;
}
function npc(seed: string, teamId: number, index: number, mode: "pro" | "college", first = false) {
  const n = hash(`${seed}:name`), p = previewPlayer(seed, surnames[n % surnames.length] + firstNames[Math.floor(n / surnames.length) % firstNames.length], slots[index]);
  p.id = `${mode}-npc-${teamId}-${index}`; p.teamId = teamId; p.grade = mode === "pro" ? 0 : 4;
  p.careerMode = mode; p.age = mode === "pro" ? (first ? 24 : 20) + n % 10 : 19 + n % 4;
  // Same absolute scale as high school. Veterans are stronger; entry itself
  // never upgrades the user's abilities, talent, reputation or handedness.
  const main = isPitcher(p.primaryRole) ? ["velocity","control","movement"] : ["contact","power","speed","defense"];
  const source = { rngStates: { generation: hash(seed), training: 0, match: 0, injury: 0, draft: 0, events: 0 } };
  for (const key of Object.keys(p.stats) as (keyof Player["stats"])[]) {
    const core = main.includes(key), shared = ["stamina","recovery","arm","bq"].includes(key);
    p.stats[key] = clamp((core ? first ? 66 : mode === "college" ? 43 : 49 : shared ? first ? 65 : 48 : 12) + random(source,"generation") * (core ? 15 : shared ? 15 : 12),1);
  }
  p.initialStats = { ...p.stats }; p.performanceReputation = 50; p.reputation = reputationScore(p);
  if (mode === "pro") p.seasonByLevel = { first: emptyRecord(), second: emptyRecord() };
  return p;
}
function resetWorld(s: GameState, p: Player, year: number, pro: boolean) {
  const oldDate = s.date;
  offSeason(p,oldDate,`${year}-03-01`); s.date = `${year}-03-01`; s.careerMode = pro ? "pro" : "college";
  p.careerMode = s.careerMode; p.grade = pro ? 0 : 4; p.age = 18 + year - path(s).graduationYear;
  p.seasonByLevel = pro ? { first: emptyRecord(), second: emptyRecord() } : undefined;
  s.calendar = developmentCalendar(year,pro); s.phase = "weekStart"; s.report = null; s.records = emptyRecord(); s.pendingEvents = [];
  s.careerEvent = null; s.lastCareerEventWeek = s.week; delete s.weekProgress; delete s.matchProgress; delete s.matchEffect; delete s.careerOpportunities;
}
export function continueCareer(input: GameState, choice: CareerChoice): GameState {
  if (input.phase !== "ended" || input.careerEvent || input.careerNotice) throw new Error("시즌 결과와 알림을 확인한 뒤 진로를 선택해 주세요.");
  if (input.careerMode === "pro") throw new Error("이번 프로 라이프는 신인 시즌까지 진행합니다.");
  if (!input.careerMode && !input.draftOutcome?.revealed) throw new Error("드래프트 결과를 먼저 확인해 주세요.");
  const s = structuredClone(input), p = getPlayer(s), info = path(s);
  const board = s.careerMode === "college" ? info.collegeDraft ?? [] : s.draft;
  const pick = board.find(row => row.playerId === p.id);
  let club = pick ? draftClubs.indexOf(pick.club) : -1;
  let entry: "draft" | "tryout" | "collegeDraft" | "developmental" = s.careerMode === "college" ? "collegeDraft" : "draft";
  if (choice === "developmental") {
    const offer = developmentalOffer(s);
    if (!offer || pick) throw new Error("신고선수 입단 제의가 없습니다.");
    club = draftClubs.indexOf(offer.club); entry = "developmental";
  }
  if (choice === "join" && !pick) throw new Error("지명받은 구단이 없습니다. 대학 진학이나 입단 테스트로 도전하세요.");
  if (choice === "tryout") {
    if (pick) throw new Error("지명 구단 입단을 선택해 주세요.");
    if (info.tryouts.some(t => t.year === s.calendar.seasonYear)) throw new Error("올해 입단 테스트에는 이미 참가했습니다.");
    const score = roleScore(p), chance = clamp(.15 + (score - 40) * .025, .1, .85), success = random(s,"draft") < chance;
    info.tryouts.push({ year: s.calendar.seasonYear, score, chance, success });
    if (!success) { notice(s,"tryoutFailed","입단 테스트 결과","이번에는 구단의 선택을 받지 못했습니다. 능력치와 평판은 유지됩니다. 대학 육성 시즌을 보내고 다시 도전할 수 있습니다."); return s; }
    club = Math.floor(random(s,"draft") * draftClubs.length); entry = "tryout";
  }
  if (choice === "college") {
    if (pick) throw new Error("현재 지명 구단 입단을 먼저 확인해 주세요.");
    if (info.collegeYears >= 4) throw new Error("대학 육성 시즌은 최대 네 번까지 진행합니다.");
    archiveCareerSeason(s,p); const year = s.calendar.seasonYear + 1; info.collegeYears++;
    s.teams = Array.from({ length: 12 },(_,id) => ({ id,name: `${["서울","부산","인천","대구","광주","대전","수원","창원","청주","전주","강릉","제주"][id]}야구대`,shortName:`대학 ${id+1}`,wins:0,losses:0,draws:0 }));
    p.teamId = hash(`${s.seed}:college`) % 12;
    s.players = s.teams.flatMap(t => slots.map((_,i) => npc(`${s.seed}:college:${year}:${t.id}:${i}`,t.id,i,"college")));
    s.players.push(p); resetWorld(s,p,year,false);
    notice(s,"entry","대학에서 다시 시작합니다",`${s.teams[p.teamId].name}에서 ${info.collegeYears}번째 육성 시즌을 시작합니다. 시즌 뒤 게임용 재도전 드래프트와 입단 테스트 기회가 주어집니다.`); return s;
  }
  if (club < 0) throw new Error("입단할 구단을 확인할 수 없습니다.");
  // Preserve the actual draft class, including its personal school records.
  const rookies = board.map(d => ({ pick:d, player:s.players.find(other => other.id === d.playerId) })).filter(row => row.player);
  for (const row of rookies) archiveCareerSeason(s,row.player!);
  archiveCareerSeason(s,p);
  const year = s.calendar.seasonYear + 1, oldDate = s.date;
  const teams: Team[] = Array.from({ length:20 },(_,id) => ({ id,name:`${draftClubs[id%10]} ${id<10?"1군":"2군"}`,shortName:`${draftClubs[id%10].split(" ")[0]} ${id<10?"1군":"2군"}`,wins:0,losses:0,draws:0 }));
  s.teams = teams; s.players = teams.flatMap(t => slots.map((_,i) => npc(`${s.seed}:pro:${year}:${t.id}:${i}`,t.id,i,"pro",t.id<10)));
  for (const row of rookies) {
    const rookie = row.player!; rookie.teamId = draftClubs.indexOf(row.pick.club) + 10;
    if(rookie.id!==p.id)offSeason(rookie,oldDate,`${year}-03-01`); rookie.age = 19 + info.collegeYears; rookie.grade = 0; rookie.careerMode = "pro"; rookie.seasonByLevel = { first:emptyRecord(),second:emptyRecord() };
    s.players.push(rookie);
  }
  p.teamId = club + 10; if (!s.players.some(other => other.id === p.id)) s.players.push(p);
  info.pro = { club,rookieYear:year,level:"second",nextReviewDate:`${year}-03-15`,entry,firstTeamWeeks:0,secondTeamWeeks:0,transactions:[] };
  resetWorld(s,p,year,true);
  if (entry === "developmental") p.proContract = {status:"developmental",joinedDate:s.date};
  notice(s,"entry",entry === "developmental" ? "신고선수로 프로에 입단했습니다" : "프로 유니폼을 입었습니다",entry === "developmental"
    ? `${draftClubs[club]} 2군에서 시작합니다. 성장은 일반 선수의 90%이며 출전 경쟁에서 불리합니다. 2군 경기 성과로 정식 선수 전환 조건을 달성하면 성장과 출전 제한이 해제됩니다.`
    : `${draftClubs[club]} 2군에서 신인 시즌을 시작합니다. 훈련과 실제 출전 성적, 포지션 경쟁과 컨디션에 따라 1군 승격·2군 조정이 결정됩니다. 고교 능력치와 개인 기록은 그대로 이어집니다.`);
  return s;
}
export function developmentProgress(p: Player) {
  const records = p.seasonByLevel?.second ?? emptyRecord(), b = records.batting, pitch = records.pitching;
  const batting = b.PA >= 80 && b.AB > 0 && (b.H + b.BB) / b.PA + (b.H + b["2B"] + 2*b["3B"] + 3*b.HR) / b.AB >= .75;
  const pitching = pitch.outs >= 60 && pitch.BF > 0 && pitch.ER * 27 / pitch.outs <= 4 && pitch.SO / pitch.BF >= .18;
  const qualified = p.twoWay ? batting || pitching : isPitcher(p.primaryRole) ? pitching : batting;
  return {qualified,batting,pitching,PA:b.PA,outs:pitch.outs};
}
export function reviewDevelopmentContract(s: GameState) {
  const p = getPlayer(s);
  if (s.careerMode !== "pro" || s.careerNotice || p.proContract?.status !== "developmental" || !developmentProgress(p).qualified) return false;
  p.proContract.status = "regular"; p.proContract.convertedDate = s.date;
  notice(s,"registered","경기력으로 따낸 정식 선수 전환","2군에서 쌓은 경기 성과를 인정받아 정식 선수로 전환됐습니다. 성장 효율이 100%로 회복되고 출전 경쟁의 불이익이 해제됩니다. 이제 1군 승격에도 도전할 수 있습니다.");
  return true;
}
export function reviewProRoster(s: GameState) {
  const info = s.postSchool?.pro;
  if (s.careerMode !== "pro" || !info || s.date < info.nextReviewDate) return false;
  info.nextReviewDate = addDays(s.date,14);
  const p = getPlayer(s), first = info.club, second = info.club + 10;
  if (p.proContract?.status === "developmental") return false;
  const score = (other: Player) => roleScore(other,p.primaryRole) + clamp(other.recentZ,-2,2) * 2 - other.fatigue * .05;
  const eligible = (other: Player) => other.eligiblePositions.includes(p.position) && other.id !== p.id;
  let exchange: Player | undefined, reason = "";
  if (p.teamId === second) {
    const weakest = s.players.filter(other => other.teamId === first && eligible(other)).sort((a,b) => score(a)-score(b)||a.id.localeCompare(b.id))[0];
    const best = s.players.filter(other => other.teamId === second && eligible(other)).sort((a,b) => score(b)-score(a)||a.id.localeCompare(b.id))[0];
    if (!p.forcedRest && !(p.injury && s.date < p.injury.unavailableUntil) && (!best || score(p)>=score(best)) && weakest && score(p)>score(weakest)+1) {
      exchange=weakest; reason="현재 능력과 최근 성적이 포지션 경쟁 선수를 앞서 1군 기회를 얻었습니다.";
    }
  } else {
    const best = s.players.filter(other => other.teamId === second && eligible(other) && !other.forcedRest && !(other.injury && s.date < other.injury.unavailableUntil)).sort((a,b) => score(b)-score(a)||a.id.localeCompare(b.id))[0];
    const longInjury = !!p.injury && p.injury.unavailableUntil >= addDays(s.date,14);
    if (best && (longInjury || p.forcedRest || score(best)>score(p)+1)) {
      exchange=best;reason=longInjury?"장기 부상 회복을 위해 2군에서 몸을 만들기로 했습니다.":p.forcedRest?"컨디션 회복을 위해 2군에서 재정비합니다.":"최근 성적과 포지션 경쟁을 반영해 2군에서 다시 기회를 준비합니다.";
    }
  }
  if (!exchange) return false;
  const from:ProLevel = p.teamId===first?"first":"second",to:ProLevel=from==="first"?"second":"first",old=p.teamId;
  p.teamId=exchange.teamId;exchange.teamId=old;info.level=to;
  info.transactions.push({date:s.date,from,to,reason,exchangedPlayerId:exchange.id});
  notice(s,to==="first"?"promoted":"demoted",to==="first"?"1군 승격 통보":"2군 조정 통보",reason);return true;
}
export function finishDevelopmentSeason(s: GameState) {
  if (!s.careerMode || s.date < s.calendar.seasonEnd) return false;
  s.phase="ended";
  for(const competition of s.calendar.competitions)competition.championTeamId=careerLeagueTable(s.calendar,competition.id)[0]?.teamId??null;
  if (s.careerMode==="college") {
    const draftState = {...s,players:s.players.map(p=>({...p,grade:3}))};
    path(s).collegeDraft=draftPlayers(draftState);
    const chosen=path(s).collegeDraft!.find(p=>p.playerId===s.playerId);
    notice(s,"seasonComplete","대학 육성 시즌 종료",chosen?`${chosen.club}의 선택을 받았습니다. 입단을 결정하면 다음 해 프로 신인 시즌으로 이어집니다.`:"재도전 드래프트에서 지명받지 못했습니다. 입단 테스트나 다음 대학 육성 시즌을 선택할 수 있습니다.");
  } else notice(s,"seasonComplete","프로 신인 시즌을 마쳤습니다","1군·2군 출전 기록과 최종 순위를 확인하세요. 고교부터 이어온 연도별 기록은 개인 기록에 보관됩니다.");
  return true;
}
export const careerLabel = (p: Player) => p.careerMode==="pro" ? `${p.age ?? 19}세 · 프로` : p.careerMode==="college" ? `${p.age ?? 19}세 · 대학` : `고교 ${p.grade}학년`;
export function createProfessionalDemo(seed:string,name:string,position:Position) {
  const s=createGame(seed,name,position),p=getPlayer(s);p.grade=3;
  const main=isPitcher(p.primaryRole)?["velocity","control","movement"]:["contact","power","speed","defense"];
  for(const key of main)p.stats[key as keyof Player["stats"]]=76;
  for(const key of ["stamina","recovery","arm","bq"] as const)p.stats[key]=68;
  p.initialStats={...p.stats};p.talent={batting:10,pitching:10};p.reputation=reputationScore(p);
  s.date=s.calendar.draftDate;s.draft=draftPlayers(s);s.phase="ended";
  if(!s.draft.some(d=>d.playerId===p.id))throw new Error("샘플 선수의 지명 결과를 만들지 못했습니다.");
  return continueCareer(revealDraftResult(s),"join");
}
