import {openNationalMatchChoice} from "./national-tournament";
import {springRoster,springLineup,springPriority,springSelectionScore} from './pro-spring';
import {nationalAway} from './national-teams';
import {currentProPosition} from "./pro-positions";
import {farmGameRoster,farmSelectionTier} from "./pro-farm-roster";
import { accumulation, advanceRunners, available, clamp, effective, emptyRecord, hash, isPitcher, mergeRecord, params, pitchingRole, probabilities, random, roleFor, selectionScore } from "./engine";
import {fieldingIndex,recordFieldingOuts,recordFieldingPlay} from "./fielding";
import {professionalLineup,proNotice} from "./pro-world";
import {playoffRosterFor} from "./pro-season";
import { applyMatchEffect, openScheduledEvent } from "./event-system";
import type { Game, GameState, Player, Position } from "./types";
import {recordEvaluationEnvironment} from "./evaluation-lifecycle";
import {openProMatchEvent,openProPreparation} from "./pro-event-runtime";
import type {ProAppearance} from "./pro-event-types";
import {packRecentRecord,recentSample} from "./recent-records";
import {finishGameRecords,pitcherEntered,recordLeadChange} from "./game-records";
import {proBullpenPlan,proMatchParameters,proPitcherOutLimit,proRecentTeamGames,proReliefPriority,proReliefReady} from './pro-balance';
import {farmPlayoffRoster,isFarmPostseason} from './pro-farm-postseason';
import {stolenBaseAttempt} from './base-stealing';

// Every cursor and runner is serializable: returning at a choice never replays
// an inning, consumes a match draw early, or commits a partial game twice.
export function simulateGame(s: GameState, game: Game, rosters: Player[][]): boolean {
  const regulation=game.national?.youth?7:params["match.regular_innings"];
  const pro=s.careerMode==='pro',tier=(p:Player)=>game.exhibition==='spring'?springPriority(s,p):farmSelectionTier(p),configuration=pro?proMatchParameters(params):params;
  if(game.status==="completed"||game.status==="forfeit")return true;
  if(game.competitionId==="pro-second")rosters=[game.homeTeamId,game.awayTeamId].map(team=>farmGameRoster(s,team));
  if(isFarmPostseason(game.competitionId))rosters=farmPlayoffRoster(s,game);
  if(game.exhibition==='spring')rosters=[game.homeTeamId,game.awayTeamId].map(team=>springRoster(s,team));
  rosters=rosters.map(roster=>playoffRosterFor(s,game,roster).filter(p=>!nationalAway(s,p,game.date)));
  const players = new Map(rosters.flat().map(p => [p.id, p]));
  const player = (id: string) => {const p=players.get(id);if(!p)throw new Error(`경기 명단 누락: ${id} / ${game.id} / 소속 ${s.players.find(p=>p.id===id)?.teamId}`);return p;};
  if (!s.matchProgress) {
    recordEvaluationEnvironment(s,game,rosters);
    const prepared=game.proPreparedLineup;
    const valid=prepared?.every(side=>[...side.field,...side.order,...side.pitchers,side.starter].every(id=>players.has(id))&&(!pro||pitchingRole(player(side.starter))==='선발'));
    const sides = prepared&&valid?prepared.map(side=>({field:side.field.map(player),order:side.order.map(player),starter:player(side.starter),pitchers:side.pitchers.map(player)})):rosters.map(roster => game.exhibition==='spring'?springLineup(s,roster,game.date):professionalLineup(s,roster,game.date,game.evaluationPlayers));
    if (sides.some(side => side.field.length < 9 || !side.starter)) {
      game.status = "forfeit";
      game.forfeitTeamId = sides[0].field.length < 9 || !sides[0].starter ? game.homeTeamId : game.awayTeamId;
      return true;
    }
    if(s.careerMode==="pro"&&!game.proPreparationChecked){game.proPreparationChecked=true;
      if(openProPreparation(s,game,sides.map(side=>({field:side.field.map(p=>p.id),starter:side.starter!.id})))){game.proPreparedLineup=sides.map(side=>({field:side.field.map(p=>p.id),order:side.order.map(p=>p.id),starter:side.starter!.id,pitchers:side.pitchers.map(p=>p.id)}));return false;}
    }
    delete game.proPreparedLineup;
    game.status = "inProgress";
    game.lineup = sides.map(side => [...side.order.map(p => p.id), side.starter!.id]);
    s.matchProgress = {
      ...(pro?{fieldingVersion:1 as const}:{}),
      gameId: game.id, sides: sides.map(side => ({ field: side.field.map(p => p.id), order: side.order.map(p => p.id), starter: side.starter!.id, pitchers: side.pitchers.map(p => p.id) })),
      original: rosters.flat().map(p => ({ id: p.id, fatigue: p.fatigue, lastPitched: p.lastPitched })),
      pitchers: sides.map(side => side.starter!.id), usedPitchers: sides.map(side => [side.starter!.id]), battingIndex: [0, 0], pitchOuts: [0, 0], recentEvents: [],
      defense: sides.map(side => side.field.slice(0, 8).reduce((sum, p) => sum + effective(p).defense, 0) / 8),
      arm: sides.map(side => [side.field[2], side.field[6], side.field[7]].reduce((sum, p) => sum + effective(p).arm / 3, 0)),
      inning: 1, battingSide: 1, outs: 0, pa: 0, runs: 0, bases: [null, null, null], ready: false, eventFatigue: 0,
      scoring:{stints:[]},
    };
    sides.forEach((side,index)=>pitcherEntered(s.matchProgress!,game,side.starter!.id,index,true));
    if(s.careerMode==="pro"){
      const starts:Record<string,ProAppearance>={},positions:Position[]=["C","SS","CF","2B","1B","3B","LF","RF","DH"];
      sides.forEach((side,index)=>{const teamId=index===0?game.homeTeamId:game.awayTeamId,level=game.competitionId.startsWith("pro-playoffs-")?"postseason":game.competitionId==="pro-first"?"first":"second";
        side.field.forEach((p,i)=>starts[p.id]={teamId,level,position:positions[i],startedField:true,startedPitching:false});const p=side.starter!;starts[p.id]={teamId,level,position:p.position,startedField:false,startedPitching:true};});
      s.matchProgress.proStarts=starts;
    }
  }
  const m = s.matchProgress;
  if (m.gameId !== game.id) throw new Error("다른 경기가 진행 중입니다.");
  const recentTeamGames=pro?[game.homeTeamId,game.awayTeamId].map(team=>proRecentTeamGames(s,team,game.date)):[];
  // Reuse pregame condition on a resumed choice, even after an inning has
  // already updated lastPitched. Main/backup closing duties cannot reroll.
  const pregame=new Map(m.original.map(p=>[p.id,p]));
  const bullpenPlans=m.sides.map((side,index)=>proBullpenPlan(rosters[index].filter(p=>isPitcher(pitchingRole(p))).map(p=>{
    const original=pregame.get(p.id);return original?{...p,fatigue:original.fatigue,lastPitched:original.lastPitched}:p;
  }),s.seed,game.date,index,recentTeamGames[index],new Set(side.pitchers),new Set(game.evaluationPlayers??[])));
  const line = (p: Player) => game.boxScore[p.id] ??= emptyRecord();
  const forfeit = (side: number) => {
    game.status = "forfeit"; game.forfeitTeamId = side === 0 ? game.homeTeamId : game.awayTeamId;
    game.boxScore = {}; game.lineup = []; game.innings = [[], []]; game.score = [0, 0];
    delete game.proAppearances;delete game.proPreparedLineup;
    for (const original of m.original) { const p = player(original.id); p.fatigue = clamp(original.fatigue + (p.id === s.playerId ? m.eventFatigue : 0)); p.lastPitched = original.lastPitched; }
    delete s.matchProgress; delete s.matchEffect;
    return true;
  };
  let ended = false;
  const finishHalf = () => {
    game.innings[m.battingSide].push(m.runs);
    if (m.battingSide === 0) {
      if (m.inning >= regulation && game.score[0] !== game.score[1]) ended = true;
      m.inning++; m.battingSide = 1;
    } else m.battingSide = 0;
    m.outs = 0; m.pa = 0; m.runs = 0; m.bases = [null, null, null]; m.ready = false;
  };
  const maxInnings=game.national?Number.POSITIVE_INFINITY:game.exhibition?9:game.competitionId.startsWith("pro-playoffs-")?15:params["match.max_innings"];
  while (m.inning <= maxInnings && !ended) {
    const side = m.battingSide, pitchingSide = 1 - side;
    if (side === 0 && m.inning >= regulation && game.score[0] > game.score[1] && m.pa === 0) break;
    if (m.outs >= 3) { finishHalf(); continue; }
    if (m.ready && !available(player(m.pitchers[pitchingSide]), game.date)) { m.ready = false; m.pa--; }
    if(game.national&&m.inning>regulation&&m.pa===0&&m.outs===0&&!m.bases.some(Boolean)){const order=m.sides[side].order,index=(m.battingIndex[side]+8)%9;m.bases[1]={playerId:order[index],pitcherId:m.pitchers[pitchingSide]};}
    if (!m.ready) {
      if (++m.pa > params["match.max_pa"]) throw new Error(`타석 안전 한도 초과: seed=${s.seed}, game=${game.id}`);
      const current = player(m.pitchers[pitchingSide]);
      const starter=m.usedPitchers[pitchingSide].length===1;
      const lead = game.score[pitchingSide] - game.score[side];
      const {closerId,mainCloserId,longReliefId,setupId,bridgeId,earlyCloser}=bullpenPlans[pitchingSide]??{};
      const currentLine=game.boxScore[current.id]?.pitching;
      let limit = game.exhibition?(m.usedPitchers[pitchingSide].length<=3?3:6):pro?proPitcherOutLimit(current,starter,s.seed,game.date,closerId,bridgeId,lead,currentLine?.R??0,currentLine?.BF??0,m.pitchOuts[pitchingSide]):starter ? params["coach.starter_outs"] : pitchingRole(current) === "마무리" ? params["coach.closer_outs"] : params["coach.relief_outs"];
      if(pro&&!game.exhibition&&!starter&&pitchingRole(current)==='중간계투'&&(currentLine?.R??0)<2){
        const remaining=m.sides[pitchingSide].pitchers.map(player).filter(p=>!m.usedPitchers[pitchingSide].includes(p.id)&&pitchingRole(p)!=='선발'&&available(p,game.date)&&p.fatigue<params['coach.replace_fatigue']).length;
        const outsNeeded=Math.max(1,10-m.inning)*3-m.outs;
        limit=Math.max(limit,Math.min(9,m.pitchOuts[pitchingSide]+Math.max(0,outsNeeded-remaining*3)));
      }
      const saveEntry=!game.exhibition&&!starter&&!!closerId&&current.id!==closerId&&(m.inning>=9||pro&&earlyCloser&&m.inning===8)&&m.pa===1&&m.outs===0&&game.score[pitchingSide]>game.score[side]&&game.score[pitchingSide]-game.score[side]<=3&&proReliefReady(player(closerId),game.date,undefined,recentTeamGames[pitchingSide]);
      if (saveEntry || m.pitchOuts[pitchingSide] >= limit || current.fatigue >= params["coach.replace_fatigue"] || !available(current, game.date)) {
        const unused=m.sides[pitchingSide].pitchers.map(player).filter(p=>!m.usedPitchers[pitchingSide].includes(p.id)&&!m.sides[pitchingSide].field.includes(p.id)&&available(p,game.date)&&p.fatigue<params['coach.replace_fatigue']&&(!pro||['중간계투','마무리'].includes(pitchingRole(p)))&&(game.exhibition||p.id!==mainCloserId||closerId===mainCloserId));
        // Keep the designated closer out of middle innings even when he is
        // the only rested option. Other relievers cover first; an exhausted
        // bullpen can still use him in a genuine emergency.
        const middle=unused.filter(p=>p.id!==closerId||m.inning>=9&&lead>=1&&lead<=3);
        const pool=game.exhibition||!middle.length?unused:middle;
        const rested=pool.filter(p=>!pro||game.exhibition||proReliefReady(p,game.date,longReliefId,recentTeamGames[pitchingSide]));
        const priority=(p:Player)=>{
          if(pro&&!game.exhibition)return proReliefPriority(p,game.date,m.inning,lead,closerId,longReliefId,setupId,bridgeId,recentTeamGames[pitchingSide].length);
          const closing=!game.exhibition&&p.id===closerId?(m.inning>=9&&lead>=1&&lead<=3?100:-100):0;
          return closing+(game.exhibition==='spring'?springSelectionScore(p):selectionScore(p,pitchingRole(p)));
        };
        const next = saveEntry?unused.find(p=>p.id===closerId):(rested.length?rested:pool)
          .sort((a, b) => Number(game.evaluationPlayers?.includes(b.id)??false)-Number(game.evaluationPlayers?.includes(a.id)??false)||(pro?tier(a)-tier(b):0)||priority(b)-priority(a)||a.id.localeCompare(b.id))[0];
        if (next) { pitcherEntered(m,game,next.id,pitchingSide);m.pitchers[pitchingSide] = next.id; m.usedPitchers[pitchingSide].push(next.id); m.pitchOuts[pitchingSide] = 0; }
        else if(!saveEntry&&!(pro&&!starter&&available(current,game.date)&&current.fatigue<params['coach.replace_fatigue']&&m.pitchOuts[pitchingSide]<15))return forfeit(pitchingSide);
      }
      const runner=m.bases[0];
      if(pro&&runner&&!m.bases[1]){
        const current=player(m.pitchers[pitchingSide]),source={rngStates:{...s.rngStates,match:hash(`${s.seed}:${game.id}:${m.inning}:${side}:${m.pa}:${runner.playerId}:steal`)}};
        const result=stolenBaseAttempt(effective(player(runner.playerId)),effective(current),effective(player(m.sides[pitchingSide].field[0])),random(source,'match'),random(source,'match'));
        if(result!=='none'){
          const runnerLine=line(player(runner.playerId)).batting;
          if(result==='safe'){runnerLine.SB=(runnerLine.SB??0)+1;m.bases[1]=runner;}
          else {
            runnerLine.CS=(runnerLine.CS??0)+1;m.outs++;line(current).pitching.outs++;m.pitchOuts[pitchingSide]++;current.lastPitched=game.date;
            if(m.fieldingVersion===1)recordFieldingOuts(m.sides[pitchingSide].field.map(player),line);
            current.fatigue=clamp(current.fatigue+params['fatigue.pitch_out']*params[`stance.${current.stance.pitching}_cost`]*accumulation(current.stats.stamina));
          }
          m.bases[0]=null;
          if(m.outs>=3){m.ready=false;continue;}
        }
      }
      m.ready = true;
    }
    const orderIndex = m.battingIndex[side] % 9;
    let batter = player(m.sides[side].order[orderIndex]);
    const pitcher = player(m.pitchers[pitchingSide]);
    if(game.exhibition&&m.inning>=4){
      const fieldIndex=m.sides[side].field.indexOf(batter.id),position=(["C","SS","CF","2B","1B","3B","LF","RF","DH"] as Position[])[fieldIndex];
      const substitute=rosters[side].filter(p=>!isPitcher(p.primaryRole)&&available(p,game.date)&&!game.lineup[side].includes(p.id)&&p.eligiblePositions.includes(position))
        .sort((a,b)=>(pro?tier(a)-tier(b):0)||Number(pro&&currentProPosition(b,position))-Number(pro&&currentProPosition(a,position))||selectionScore(b,roleFor(position))-selectionScore(a,roleFor(position))||a.id.localeCompare(b.id))[0];
      if(substitute){m.sides[side].field[fieldIndex]=substitute.id;m.sides[side].order[orderIndex]=substitute.id;game.lineup[side].push(substitute.id);batter=substitute;
        m.defense[side]=m.sides[side].field.slice(0,8).reduce((sum,id)=>sum+effective(player(id)).defense,0)/8;
        m.arm[side]=[2,6,7].reduce((sum,i)=>sum+effective(player(m.sides[side].field[i])).arm/3,0);
      }
    }
    if (!available(batter, game.date)) {
      const fieldIndex = m.sides[side].field.indexOf(batter.id);
      const position = (["C", "SS", "CF", "2B", "1B", "3B", "LF", "RF", "DH"] as Position[])[fieldIndex];
      const substitute = rosters[side].filter(p => available(p, game.date) && p.twoWay?.nextAssignment !== "pitching" && !m.sides[side].field.includes(p.id) && !m.usedPitchers[side].includes(p.id) && p.eligiblePositions.includes(position))
        .sort((a, b) => (pro?tier(a)-tier(b):0)||Number(pro&&currentProPosition(b,position))-Number(pro&&currentProPosition(a,position))||selectionScore(b, roleFor(position)) - selectionScore(a, roleFor(position)) || a.id.localeCompare(b.id))[0];
      if (!substitute) return forfeit(side);
      m.sides[side].field[fieldIndex] = substitute.id; m.sides[side].order[orderIndex] = substitute.id; game.lineup[side].push(substitute.id); batter = substitute;
    }
    if(openNationalMatchChoice(s,game,batter,pitcher))return false;
    const scene ={
      gameId: game.id, inning: m.inning, battingSide: side, outs: m.outs, score: [...game.score], batting: batter.id === s.playerId,
      bases: m.bases.map(runner => runner ? player(runner.playerId).name : null), batterName: batter.name, pitcherName: pitcher.name,batterId:batter.id,pitcherId:pitcher.id,
    };
    if ((batter.id === s.playerId || pitcher.id === s.playerId) && (openProMatchEvent(s,scene,batter,pitcher)||openScheduledEvent(s, "game",scene)))return false;
    m.battingIndex[side]++;
    const bat = line(batter).batting, pit = line(pitcher).pitching, b = effective(batter), p = effective(pitcher);
    const effect = s.matchEffect?.gameId === game.id && s.matchEffect.batterId === batter.id && s.matchEffect.pitcherId === pitcher.id ? s.matchEffect : undefined;
    const fielder=m.fieldingVersion===1?player(m.sides[pitchingSide].field[fieldingIndex(hash(`${s.seed}:${game.id}:${m.inning}:${side}:${m.battingIndex[side]}:field`))]):undefined;
    const probs = applyMatchEffect(probabilities(b, p, fielder?effective(fielder).defense:m.defense[pitchingSide], m.arm[pitchingSide],configuration), effect);
    const reference=fielder?applyMatchEffect(probabilities(b,p,configuration["match.defense_center"],m.arm[pitchingSide],configuration),effect):undefined;
    const expectedOut=reference?(1-reference.hit)*(1-reference.k)/((1-reference.hit)*(1-reference.k)+reference.hit*(1-reference.hr)):0;
    if (s.matchEffect?.gameId === game.id) delete s.matchEffect;
    const batBefore = { ...bat }, pitBefore = { ...pit };
    bat.PA++; pit.BF++; pitcher.lastPitched = game.date;
    let walkoff = false;
    const score = (runner: { playerId: string; pitcherId: string }, hr = false) => {
      if (walkoff && !hr) return;
      game.score[side]++; m.runs++; line(player(runner.playerId)).batting.R++;
      recordLeadChange(m,game,side,runner.pitcherId);
      line(player(runner.pitcherId)).pitching.R++; line(player(runner.pitcherId)).pitching.ER++; bat.RBI++;
      if (side === 0 && m.inning >= 9 && game.score[0] > game.score[1]) walkoff = true;
    };
    if (random(s, "match") < probs.bb) {
      bat.BB++; pit.BB++;
      advanceRunners(m.bases, { playerId: batter.id, pitcherId: pitcher.id }, 0, () => false, score);
    } else {
      bat.AB++;
      if (random(s, "match") < probs.hit) {
        bat.H++; pit.H++;
        const kind = random(s, "match");
        const n = kind < probs.hr ? 4 : kind < probs.hr + probs.double ? 2 : kind < probs.hr + probs.double + probs.triple ? 3 : 1;
        if (n === 4) { bat.HR++; pit.HR++; } else if (n === 2) bat["2B"]++; else if (n === 3) bat["3B"]++;
        if(fielder&&n!==4)recordFieldingPlay(line(fielder),false,expectedOut);
        const extra = (runner: { playerId: string; pitcherId: string }) => random(s, "match") < clamp(params["running.extra_base"] + params["running.extra_slope"] * (effective(player(runner.playerId)).speed - m.arm[pitchingSide]), params["running.extra_min"], params["running.extra_max"]);
        advanceRunners(m.bases, { playerId: batter.id, pitcherId: pitcher.id }, n, extra, score);
      } else {
        m.outs++; pit.outs++; m.pitchOuts[pitchingSide]++;
        if (random(s, "match") < probs.k) { bat.SO++; pit.SO++; }
        else {if (random(s, "match") < params[`match.gb_${batter.stance.batting}`]) bat.GB++; else bat.FB++;if(fielder)recordFieldingPlay(line(fielder),true,expectedOut);}
        if(m.fieldingVersion===1)recordFieldingOuts(m.sides[pitchingSide].field.map(player),line);
        pitcher.fatigue = clamp(pitcher.fatigue + params["fatigue.pitch_out"] * params[`stance.${pitcher.stance.pitching}_cost`] * accumulation(pitcher.stats.stamina));
      }
    }
    if (pit.outs === pitBefore.outs) pitcher.fatigue = clamp(pitcher.fatigue + params["fatigue.no_out_cost"] * params[`stance.${pitcher.stance.pitching}_cost`] * accumulation(pitcher.stats.stamina));
    const batRecent = emptyRecord(), pitRecent = emptyRecord();
    for (const key of Object.keys(bat)) (batRecent.batting as Record<string, number>)[key] = (bat as Record<string, number>)[key] - (batBefore as Record<string, number>)[key];
    for (const key of Object.keys(pit)) (pitRecent.pitching as Record<string, number>)[key] = (pit as Record<string, number>)[key] - (pitBefore as Record<string, number>)[key];
    m.recentEvents.push({ playerId: batter.id, record: packRecentRecord(batRecent) }, { playerId: pitcher.id, record: packRecentRecord(pitRecent) });
    m.ready = false;
    if (walkoff) { game.innings[side].push(m.runs); ended = true; }
  }
  game.status = "completed";
  for(const side of game.lineup)for(const id of [...side.slice(0,9),...side.slice(10)])line(player(id));
  finishGameRecords(game,m);
  if(s.careerMode==="pro")game.proAppearanceComplete=!!m.proStarts;
  for (let side = 0; side < 2; side++) {
    const outs = m.sides[side].pitchers.reduce((sum, id) => sum + (game.boxScore[id]?.pitching.outs ?? 0), 0);
    for (const id of m.sides[side].field.slice(0, 8)) { const p = player(id); p.fatigue = clamp(p.fatigue + params["fatigue.field_game"] * outs / 27 * accumulation(p.stats.stamina)); }
  }
  for (const [id, record] of Object.entries(game.boxScore)) {
    if(s.careerMode==="pro"&&(record.batting.PA||record.pitching.BF||record.pitching.outs)){const p=player(id),side=m.sides.findIndex(row=>row.field.includes(id)||row.pitchers.includes(id));(game.proAppearances??={})[id]=m.proStarts?.[id]??{teamId:side===0?game.homeTeamId:game.awayTeamId,level:game.competitionId.startsWith("pro-playoffs-")?"postseason":game.competitionId==="pro-first"?"first":"second",position:p.position,startedField:false,startedPitching:false};}
    if(game.evaluationEnvironment)(game.evaluationEnvironment.playerTeams??={})[id]=game.proAppearances?.[id]?.teamId??player(id).teamId;
    const p=player(id),farmPostseason=isFarmPostseason(game.competitionId),postseason=game.competitionId.startsWith("pro-playoffs-")||farmPostseason;
    if(game.exhibition==='spring'){p.seasonSpring??=emptyRecord();mergeRecord(p.seasonSpring,record);continue;}
    if(!postseason)mergeRecord(p.seasonStats,record);
    if(s.careerMode==="pro") {
      p.seasonByLevel ??= {first:emptyRecord(),second:emptyRecord()};
      if(farmPostseason){p.seasonFarmPostseason??=emptyRecord();mergeRecord(p.seasonFarmPostseason,record);}else if(postseason){p.seasonPostseason??=emptyRecord();mergeRecord(p.seasonPostseason,record);}else mergeRecord(p.seasonByLevel[game.competitionId==="pro-first"?"first":"second"],record);
      const club=String(p.teamId%10);p.seasonByClub??={};p.seasonByClub[club]??={first:emptyRecord(),second:emptyRecord(),postseason:emptyRecord()};const clubRecords=p.seasonByClub[club];if(farmPostseason)clubRecords.farmPostseason??=emptyRecord();mergeRecord(clubRecords[farmPostseason?'farmPostseason':postseason?"postseason":game.competitionId==="pro-first"?"first":"second"]!,record);
      if(p.professional&&(record.batting.PA||record.pitching.BF||record.pitching.outs)){
        p.professional.lastAppearance=game.date;
        if(game.evaluationPlayers?.includes(p.id)){p.professional.lastEvaluation=game.date;delete p.professional.requestedEvaluationUntil;}
        if(game.competitionId==="pro-first"){
          const first=p.professional.firsts,debuts=!first.debut;first.debut??=game.date;if(game.lineup.some(side=>side.slice(0,10).includes(id)))first.start??=game.date;
          if(debuts&&id===s.playerId)proNotice(s,"first-team-debut","첫 1군 경기의 기록을 남겼습니다",`${game.date} · 실제 1군 경기에서 ${record.batting.AB}타수·${record.pitching.BF}타자를 상대했습니다. 능력 보너스 없이 이 순간을 커리어에 보관합니다.`);
          if(record.batting.H)first.hit??=game.date;if(record.batting.HR)first.homeRun??=game.date;if(record.pitching.SO)first.strikeout??=game.date;
        }
      }
      if(id===s.playerId && game.competitionId==="pro-first" && (record.batting.PA||record.pitching.BF) && s.postSchool?.pro && !s.postSchool.pro.debutDate)s.postSchool.pro.debutDate=game.date;
    }
  }
  for (const event of m.recentEvents) { const p = player(event.playerId); p.recentAppearances.push(event.record); if (p.recentAppearances.length > 350) p.recentAppearances.shift(); }
  for (const original of m.original) {
    const p = player(original.id);
    if (p.twoWay) p.twoWay.nextAssignment = p.twoWay.nextAssignment === "pitching" ? "batting" : "pitching";
    let batting = 0, outs = 0, keepFrom = p.recentAppearances.length;
    for (let i = p.recentAppearances.length - 1; i >= 0; i--) {
      batting += recentSample(p.recentAppearances[i], false); outs += recentSample(p.recentAppearances[i], true); keepFrom = i;
      if (isPitcher(p.primaryRole) ? outs >= params["coach.recent_outs"] : batting >= params["coach.recent_pa"]) break;
    }
    p.recentAppearances = p.recentAppearances.slice(keepFrom);
  }
  delete s.matchProgress; delete s.matchEffect;
  return true;
}
