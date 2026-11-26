import {upgradeCareerHonors} from './sim/career-honor-upgrade';
import {upgradeSchoolPositions} from './sim/school-position-upgrade';
import {validNationalTournament} from "./sim/national-tournament";
import {upgradeNationalInvitation} from './sim/national-teams';
import {hydrateAssessments} from "./sim/pro-assessment";
import {upgradeRawSeasonWar} from './sim/pro-war-upgrade';
import {upgradePendingCareerEvent} from './sim/event-system';
import {validFaTerms} from "./sim/pro-positions";
import {MIN_PRO_SALARY} from './sim/pro-contract-rules';
import {validProWarAssessment} from "./sim/pro-war";
import {validSeasonEvaluation} from './sim/pro-season-evaluation';
import {validSeasonRank} from './sim/pro-season-ranking';
import {clearProfessionalReputation} from "./sim/pro-selection";
import {initializeAgingProfile,isPhysicalStat} from "./sim/pro-growth";
import {syncJerseyNumbers} from "./jersey-numbers";
import {discardRetiredPlayers} from "./sim/retired-records";
import {syncProClubNames} from "./sim/club-names";
import {statKeys,type GameState} from "./sim/types";
import {careerSaveId} from "./career-save-key";
import {compactCareerState} from './career-compaction';
import {backfillSeasonHonors} from './sim/pro-historical-awards';
import {isRemovedAwardCelebration} from './sim/pro-awards-ceremony';
import {acknowledgeCareer} from './sim/pro-career';
import {awardBonusKey,awardBonusPoints} from './sim/pro-award-bonuses';
import {gzipText,gunzipBytes,saveBlobText} from './save-compression';
import {packNpcRecordFields,unpackNpcRecordFields} from './career-record-codec';
import {applyRetiredNumberClaims,retiredNumberClaims,type SavedRetiredNumber} from './retired-number-reservations';
import {retirementHonorRules,validHonorRegistration} from './sim/retirement-honors';
import {removeBattedBallRecords} from './record-schema';
import {refreshCareerEvaluation} from './sim/pro-career-evaluation';
import {validOffseasonShop} from './sim/offseason-shop';
import {migrateInjuryHistory,validInjuryData} from './sim/injury-system';
import {settleInjuryRetirements} from './sim/injury-career';

export type CareerSave={format:"baseball-life";version:1;id:string;name:string;date:string;year:number;savedAt:string;manual:boolean;checksum:string;state:GameState};
type PackedCareerSave=Omit<CareerSave,'version'>&{version:2;recordEncoding:'npc-single-role-v1'};
export type CareerSaveSummary=Pick<CareerSave,"id"|"name"|"date"|"savedAt"|"manual">&{mode:GameState["careerMode"];retired:boolean};
type CompressedCareerSave=Omit<CareerSave,'state'>&{compression:'gzip';payload:Uint8Array;state:Pick<GameState,'seed'|'playerId'|'careerMode'>&{proWorld?:Pick<NonNullable<GameState['proWorld']>,'stage'>}};
type StoredCareerSave=(CareerSave|CompressedCareerSave)&{retiredNumberClaims?:SavedRetiredNumber[]};
export function saveChecksum(text:string){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(16);}
export function validateCareerState(value:unknown):asserts value is GameState {
  if(!value||typeof value!=="object")throw new Error("커리어 데이터가 아닙니다.");
  const s=value as GameState;
  if(s.schemaVersion!==1||s.proWorld&&s.proWorld.version!==1)throw new Error("지원하지 않는 저장 버전입니다. 원본 파일은 변경하지 않았습니다.");
  if(typeof s.seed!=="string"||typeof s.playerId!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!["weekStart","ended"].includes(s.phase)||!Array.isArray(s.players)||!Array.isArray(s.teams)||!Array.isArray(s.calendar?.events))throw new Error("필수 커리어 데이터가 누락됐습니다.");
  const ids=new Set<string>();for(const p of s.players){
    if(!p||typeof p.id!=="string"||ids.has(p.id)||!Number.isInteger(p.teamId)||p.teamId>=s.teams.length||p.teamId< -1||statKeys.some(k=>!Number.isFinite(p.stats?.[k])||p.stats[k]<1||p.stats[k]>100)||!p.trainingPolicy?.tickets||!Array.isArray(p.career))throw new Error("선수·소속·능력 데이터가 손상됐습니다.");ids.add(p.id);
    if(p.throws!==undefined&&!["R","L"].includes(p.throws)||p.bats!==undefined&&!["R","L","B"].includes(p.bats))throw new Error("투구·타격 손 정보를 복원할 수 없습니다.");
    const assessments=p.professional?.assessments;
    if(!validInjuryData(p))throw new Error('부상 이력·회복 일정 데이터가 손상됐습니다.');
    if(p.offseasonShop!==undefined&&(p.id!==s.playerId||!p.professional||!validOffseasonShop(p.offseasonShop,s.calendar.seasonYear)))throw new Error('오프시즌 상점 기록을 복원할 수 없습니다.');
    const bonuses=p.professional?.awardBonuses;
    if(bonuses!==undefined&&(!Array.isArray(bonuses)||new Set(bonuses.map(awardBonusKey)).size!==bonuses.length||bonuses.some(row=>{
      if(!Number.isInteger(row.year)||!Object.hasOwn(awardBonusPoints,row.category)||row.points!==awardBonusPoints[row.category])return true;
      if(row.level===undefined)return row.seriesId!==undefined;
      if(row.level!=='second')return true;
      if(row.category==='mvp')return row.seriesId!==undefined;
      return (row.category!=='semiMvp'&&row.category!=='finalMvp')||typeof row.seriesId!=='string'||!row.seriesId;
    })))throw new Error('수상 출전평가 보상 기록을 복원할 수 없습니다.');
    if(assessments!==undefined&&(!Array.isArray(assessments)||new Set(assessments.map(row=>row.year)).size!==assessments.length||assessments.some(row=>!Number.isInteger(row.year)||typeof row.date!=="string"||row.score!==null&&!Number.isFinite(row.score)||row.cumulative!==null&&!Number.isFinite(row.cumulative)||!Number.isFinite(row.ability)||typeof row.reserveSeason!=="boolean"||typeof row.developmental!=="boolean"||row.firstTeam!==undefined&&typeof row.firstTeam!=="boolean"||row.secondOnly!==undefined&&typeof row.secondOnly!=="boolean"||row.firstGames!==undefined&&row.firstGames!==null&&(!Number.isInteger(row.firstGames)||row.firstGames<0)||!["season-end","reconstructed"].includes(row.source))))throw new Error("시즌 출전평가 기록을 복원할 수 없습니다.");
    if(assessments?.some(row=>row.seasonRank!==undefined&&(!validSeasonRank(row.seasonRank)||row.seasonRank.year!==row.year||row.score===null||row.grade!==row.seasonRank.grade||!row.war||Math.abs(row.seasonRank.war-row.war.equivalentWins)>1e-7)))throw new Error('시즌 역할별 순위 기록을 복원할 수 없습니다.');
    const honorBonuses=p.professional?.careerHonorBonuses;
    const wildcardDeclines=p.professional?.wildcardDeclines;
    if(wildcardDeclines!==undefined&&(!Array.isArray(wildcardDeclines)||new Set(wildcardDeclines.map(row=>`${row.year}:${row.kind}`)).size!==wildcardDeclines.length||wildcardDeclines.some(row=>!Number.isInteger(row.year)||!['apbc','olympics'].includes(row.kind))))throw new Error('와일드카드 소집 거부 기록을 복원할 수 없습니다.');
    if(p.professional?.faHistorySeeded!==undefined&&p.professional.faHistorySeeded!==true)throw new Error('FA 경력 보정 기록을 복원할 수 없습니다.');
    if(p.professional?.tradeRequestAfter!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(p.professional.tradeRequestAfter))throw new Error('트레이드 요청 대기일을 복원할 수 없습니다.');
    const honorStatus=p.professional?.retirementHonorStatus;
    if(honorStatus&&(honorStatus.rulesVersion!==undefined&&honorStatus.rulesVersion!==2&&honorStatus.rulesVersion!==3||!Number.isInteger(honorStatus.year)||!Number.isInteger(honorStatus.debutSeasons)||honorStatus.debutSeasons<0||[honorStatus.ceremony,honorStatus.tour,honorStatus.retiredNumber].some(value=>typeof value!=='boolean')))throw new Error('은퇴 예우 판정을 복원할 수 없습니다.');
    const honorProgress=honorStatus?.progress;
    if(honorProgress&&((honorProgress.cumulative!==null&&!Number.isFinite(honorProgress.cumulative))||![honorProgress.clubScore,honorProgress.clubWar].every(Number.isFinite)||[honorProgress.seasons,honorProgress.consecutive,honorProgress.longest,honorProgress.debutClubSeasons].some(value=>!Number.isInteger(value)||value<0)||typeof honorProgress.tradeException!=='boolean'||honorProgress.club!==undefined&&(!Number.isInteger(honorProgress.club)||honorProgress.club<0||honorProgress.club>9)))throw new Error('은퇴 예우 진행 수치를 복원할 수 없습니다.');
    if(honorBonuses!==undefined&&(!Array.isArray(honorBonuses)||new Set(honorBonuses.map(row=>row.year)).size!==honorBonuses.length||honorBonuses.some(row=>!Number.isInteger(row.year)||!Number.isFinite(row.points)||row.points<0||row.points>3)))throw new Error('커리어 수상 가산점을 복원할 수 없습니다.');
    if(assessments?.some(row=>row.clubAwardCounts!==undefined&&(!row.clubAwardCounts||[row.clubAwardCounts.first,row.clubAwardCounts.second].some(count=>!Number.isInteger(count)||count<0||count>10))))throw new Error('구단 최우수 선수 기록을 복원할 수 없습니다.');
    const usage=p.professional?.assessmentUsage;
    const honorUsage=p.professional?.honorUsage;
    if(honorUsage&&(!Number.isInteger(honorUsage.year)||!validHonorRegistration({seasonDays:366,...honorUsage})||honorUsage.lastDate!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(honorUsage.lastDate)))throw new Error('은퇴 예우 등록 일수 기록을 복원할 수 없습니다.');
    const injuryLeave=p.professional?.honorInjuryLeave;
    if(injuryLeave&&(!Number.isInteger(injuryLeave.club)||injuryLeave.club<0||injuryLeave.club>=10||!/^\d{4}-\d{2}-\d{2}$/.test(injuryLeave.from)))throw new Error('부상에 따른 등록 제외 기록을 복원할 수 없습니다.');
    if(assessments?.some(row=>row.honorRegistration&&!validHonorRegistration(row.honorRegistration)))throw new Error('시즌별 은퇴 예우 등록 기록을 복원할 수 없습니다.');
    if(assessments?.some(row=>row.firstWarByClub!==undefined&&(!row.firstWarByClub||typeof row.firstWarByClub!=='object'||Array.isArray(row.firstWarByClub)||Object.entries(row.firstWarByClub).some(([club,war])=>!/^[0-9]$/.test(club)||!Number.isFinite(war)))))throw new Error('시즌별 구단 WAR를 복원할 수 없습니다.');
    if(p.professional?.lastSquad!==undefined&&!["first","second","third","developmental"].includes(p.professional.lastSquad))throw new Error("마지막 등록 군을 복원할 수 없습니다.");
    if(p.professional?.contract?.faTerms!==undefined&&!validFaTerms(p.professional.contract.faTerms))throw new Error("FA 계약 조건을 복원할 수 없습니다.");
    if(assessments?.some(row=>row.clubGamesShortage!==undefined&&typeof row.clubGamesShortage!=="boolean"))throw new Error("구단 경기 부족 평가 기록을 복원할 수 없습니다.");
    if(assessments?.some(row=>{
      if(row.war===undefined)return row.seasonEvaluation!==undefined;
      if(!validProWarAssessment(row.war))return true;
      return row.seasonEvaluation!==undefined
        ?!validSeasonEvaluation(row.seasonEvaluation,row.war,row.score)
        :row.score===null||Math.abs(row.score-row.war.score)>1e-7;
    }))throw new Error("시즌 출전평가의 WAR 환산 기록을 복원할 수 없습니다.");
    if(usage&&(!Number.isInteger(usage.year)||[usage.activeDays,usage.lowerDays,usage.upperDays].some(n=>!Number.isInteger(n)||n<0)||usage.lowerDays+usage.upperDays!==usage.activeDays||usage.firstDays!==undefined&&(!Number.isInteger(usage.firstDays)||usage.firstDays<0||usage.firstDays>usage.upperDays)))throw new Error("소속 군의 활동 일수를 복원할 수 없습니다.");
    const refusal=p.professional?.nonRenewal;
    if(refusal&&(!Number.isInteger(refusal.year)||!["reserve","limited-appearances","post-rookie-evaluation","second-team","low-evaluation"].includes(refusal.kind)||!Number.isInteger(refusal.club)||refusal.club<0||refusal.club>=10||typeof refusal.reason!=="string"))throw new Error("재계약 판정 기록이 손상됐습니다.");
    const retry=p.professional?.developmentalRetry;
    if(retry&&(!Number.isInteger(retry.year)||!Number.isInteger(retry.deadlineYear)||retry.deadlineYear<retry.year||retry.deadlineYear-retry.year>(assessments?.filter(row=>row.clubGamesShortage&&row.year>=retry.year&&row.year<retry.deadlineYear).length??0)||!Number.isInteger(retry.club)||retry.club<0||retry.club>=10))throw new Error("신고 재영입 기한을 복원할 수 없습니다.");
    const aging=p.professional?.agingProfile;
    if(aging&&(aging.version!==1||!Number.isFinite(aging.physical)||aging.physical<0||aging.physical>100||!Number.isInteger(aging.peakStart)||aging.peakStart<20||aging.peakStart>32||!Number.isInteger(aging.declineStart)||aging.declineStart<=aging.peakStart||aging.declineStart>40||!aging.loss||Object.entries(aging.loss).some(([key,n])=>!statKeys.includes(key as typeof statKeys[number])||!isPhysicalStat(key as typeof statKeys[number])||!Number.isFinite(n)||n!<0||n!>100)))throw new Error("전성기·노화 기록을 복원할 수 없습니다.");
    const trial=p.professional?.roleTrial;if(trial?.version===1&&(!Array.isArray(trial.trainingDates)||typeof trial.started!=="string"||typeof trial.until!=="string"||typeof trial.sourceId!=="string"))throw new Error("보직 평가의 훈련 근거를 복원할 수 없습니다.");
    if(p.professional?.positionRequestYear!==undefined&&!Number.isInteger(p.professional.positionRequestYear))throw new Error("포지션 변경 요청 기록을 복원할 수 없습니다.");
  }
  const retiredNumbers=s.proWorld?.retiredNumbers;
  if(s.proWorld?.retiredInjuries!==undefined&&(typeof s.proWorld.retiredInjuries!=='object'||s.proWorld.retiredInjuries===null||Array.isArray(s.proWorld.retiredInjuries)||Object.values(s.proWorld.retiredInjuries).some(row=>!row||typeof row.name!=='string'||!validInjuryData({injury:null,injuryHistory:row.history,injuryRetirement:row.retirement} as import('./sim/types').Player))))throw new Error('은퇴 선수의 부상 이력을 복원할 수 없습니다.');
  const retirementHonors=s.proWorld?.retirementHonors;
  if(retiredNumbers?.some(row=>row.grade!==undefined&&!['S','A','B','C','D','E','F'].includes(row.grade)))throw new Error('영구결번 누적 등급을 복원할 수 없습니다.');
  if(retiredNumbers?.some(({criteria})=>criteria!==undefined&&(!criteria||!Number.isFinite(criteria.clubWar)||!Number.isFinite(criteria.awardBonus)||criteria.awardBonus<0||!Number.isInteger(criteria.seasons)||criteria.seasons<0)))throw new Error('영구결번의 구단 WAR와 수상 가산점을 복원할 수 없습니다.');
  if(retirementHonors&&(!Array.isArray(retirementHonors)||new Set(retirementHonors.map(row=>row.playerId)).size!==retirementHonors.length||retirementHonors.some(row=>{
    const debutTenure=row.debutClubSeasons!==undefined&&Number.isInteger(row.debutClubSeasons)&&row.debutClubSeasons>=retirementHonorRules.debutCeremony;
    const validGrade=['S','A','B','C','D','E','F'].includes(row.grade)||debutTenure&&row.grade==='—';
    const validScore=row.score===null?debutTenure:Number.isFinite(row.score)&&row.score>=0&&row.score<=100;
    return !Number.isInteger(row.club)||row.club<0||row.club>=10||typeof row.playerId!=='string'||typeof row.playerName!=='string'||!validScore
      ||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!validGrade||row.debutClubSeasons!==undefined&&!debutTenure
      ||!Number.isInteger(row.seasons)||row.seasons<0||!Number.isInteger(row.consecutive)||row.consecutive<0||row.consecutive>row.seasons
      ||typeof row.ceremony!=='boolean'||typeof row.tour!=='boolean';
  })))throw new Error('은퇴 예우 기록을 복원할 수 없습니다.');
  if(s.savedRetiredNumbers&&(!Array.isArray(s.savedRetiredNumbers)||s.savedRetiredNumbers.some(row=>typeof row.saveId!=='string'||typeof row.playerId!=='string'||typeof row.playerName!=='string'||!Number.isInteger(row.club)||row.club<0||row.club>=10||!Number.isInteger(row.number)||row.number<1||row.number>99)))throw new Error('저장된 영구결번 목록을 복원할 수 없습니다.');
  if(retiredNumbers!==undefined&&(!Array.isArray(retiredNumbers)||new Set(retiredNumbers.map(row=>row.playerId)).size!==retiredNumbers.length||new Set(retiredNumbers.map(row=>`${row.club}:${row.number}`)).size!==retiredNumbers.length||retiredNumbers.some(row=>!Number.isInteger(row.club)||row.club<0||row.club>=10||!Number.isInteger(row.number)||row.number<1||row.number>99||typeof row.playerId!=="string"||typeof row.playerName!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(row.score)||row.score<0||row.score>100)))throw new Error("영구결번 기록을 복원할 수 없습니다.");
  if(!ids.has(s.playerId)||!s.rngStates||Object.values(s.rngStates).some(n=>!Number.isInteger(n)))throw new Error("선수 또는 난수 상태를 복원할 수 없습니다.");
  if(s.proWorld?.market?.offers.some(offer=>offer.faTerms!==undefined&&!validFaTerms(offer.faTerms)||offer.startingLevel!==undefined&&!["first","second","third","developmental"].includes(offer.startingLevel)))throw new Error("FA 제안과 시작 군을 복원할 수 없습니다.");
  if(s.proWorld?.market?.offers.some(offer=>offer.salaryBeforeMinimum!==undefined&&(!Number.isSafeInteger(offer.salaryBeforeMinimum)||offer.salaryBeforeMinimum<0||offer.salaryBeforeMinimum>=MIN_PRO_SALARY||offer.salary!==MIN_PRO_SALARY)))throw new Error('연봉 제안 기록을 복원할 수 없습니다.');
  if(s.weekProgress&&(!Number.isInteger(s.weekProgress.remainingDays)||s.weekProgress.remainingDays<0||s.weekProgress.remainingDays>7))throw new Error("주간 중단 위치가 올바르지 않습니다.");
  if(s.matchProgress&&!s.calendar.events.some(g=>g.id===s.matchProgress!.gameId))throw new Error("진행 중인 경기를 찾을 수 없습니다.");
  if(s.proEvents&&(s.proEvents.version!==1||!Array.isArray(s.proEvents.history)||!Array.isArray(s.proEvents.attemptedGames)||!Array.isArray(s.proEvents.cancellations)||!s.proEvents.national||Object.values(s.proEvents.national).some(row=>!Array.isArray(row.roster)||row.roster.length>30||new Set(row.roster.map(p=>p.id)).size!==row.roster.length)))throw new Error("프로 이벤트 저장 상태가 손상됐거나 지원하지 않는 버전입니다.");
  if(s.proEvents?.wbc&&Object.entries(s.proEvents.wbc).some(([year,row])=>Number(year)<2026||(Number(year)-2026)%4!==0||row.sourceYear!==Number(year)-1||typeof row.evaluatedAt!=="string"||typeof row.offered!=="boolean"||typeof row.settled!=="boolean"||!Array.isArray(row.roster)||row.roster.length>30||row.roster.some(p=>!p||typeof p.id!=="string"||!Number.isFinite(p.selectionScore??p.reputation)||!Number.isFinite(p.roleScore))||new Set(row.roster.map(p=>p.id)).size!==row.roster.length))throw new Error("WBC 국가대표 명단을 복원할 수 없습니다.");
  if(s.nationalTeams&&(!Array.isArray(s.nationalTeams)||new Set(s.nationalTeams.map(row=>`${row.year}:${row.kind}`)).size!==s.nationalTeams.length||s.nationalTeams.some(row=>!['wbc','premier12','apbc','olympics','youth'].includes(row.kind)||!Number.isInteger(row.year)||typeof row.start!=='string'||typeof row.end!=='string'||!Array.isArray(row.roster)||row.roster.length>30||row.participationField!==undefined&&!['pitching','batting'].includes(row.participationField)||new Set(row.roster.map(p=>p.id)).size!==row.roster.length||row.roster.some(p=>typeof p.id!=='string'||typeof p.name!=='string'||typeof p.team!=='string'||!['batting','pitching'].includes(p.field)||!Number.isFinite(p.roleScore)||p.wildcard!==undefined&&p.wildcard!==true))))throw new Error("국가대표 선발 기록이 손상됐습니다.");
  if(s.nationalTeams?.some(row=>row.tournament&&!validNationalTournament(row.tournament)))throw new Error("국가대표 대회 진행 기록이 손상됐습니다.");
  if(s.careerEvent?.proEvent&&s.careerEvent.proEvent.version!==1)throw new Error("지원하지 않는 프로 이벤트 버전입니다.");
  if(s.calendar.events.some(game=>game.proPreparedLineup?.some(side=>[...side.field,...side.order,...side.pitchers,side.starter].some(id=>!ids.has(id)))))throw new Error("경기 준비 명단의 선수를 복원할 수 없습니다.");
  const allstar=s.proWorld?.allstar;
  for(const season of s.proWorld?.seasons??[]){const ceremony=season.awardsCeremony;if(ceremony&&(ceremony.version!==1||ceremony.scheduledAt!==`${season.year}-12-06`||ceremony.presentedAt!==undefined&&(typeof ceremony.presentedAt!=="string"||ceremony.presentedAt<ceremony.scheduledAt)))throw new Error("시상식 일정을 복원할 수 없습니다.");}
  if(s.proWorld?.resumeCampAfterAwards!==undefined&&(s.proWorld.resumeCampAfterAwards!==true||!s.proWorld.seasonClosed))throw new Error("시상식 후 캠프 이동 상태를 복원할 수 없습니다.");
  if(s.proWorld?.offseasonContinuation!==undefined&&(!['national','market','wait','nextSeason'].includes(s.proWorld.offseasonContinuation)||!s.proWorld.seasonClosed))throw new Error('국가대표 대회 진행 상태를 복원할 수 없습니다.');
  if(allstar){
    if(allstar.version!==1||allstar.year!==s.calendar.seasonYear||!["first","second"].every(level=>!!allstar.levels?.[level as "first"|"second"]))throw new Error("올스타 시즌 자료를 복원할 수 없습니다.");
    const selected=new Set<string>();
    for(const level of ["first","second"] as const)for(const side of ["blue","white"] as const){const team=allstar.levels[level][side];if(!team||!Array.isArray(team.roster)||team.roster.length>22||!Array.isArray(team.withdrawn)||!team.ballots)throw new Error("올스타 명단을 복원할 수 없습니다.");for(const row of team.roster){if(typeof row.playerId!=="string"||selected.has(row.playerId))throw new Error("올스타 중복 선발 자료가 손상됐습니다.");selected.add(row.playerId);}}
  }
}
export function encodeCareerSave(state:GameState,manual=false,now=new Date().toISOString()):CareerSave {
  state=removeBattedBallRecords(compactCareerState(state));
  if(state.savedRetiredNumbers){state={...state};delete state.savedRetiredNumbers;}
  validateCareerState(state);const p=state.players.find(p=>p.id===state.playerId)!;
  return {format:"baseball-life",version:1,id:careerSaveId(state),name:p.name,date:state.date,year:state.calendar.seasonYear,savedAt:now,manual,checksum:saveChecksum(JSON.stringify(state)),state};
}
export function decodeCareerSave(raw:string):CareerSave {
  let file:CareerSave|PackedCareerSave;try{file=JSON.parse(raw);}catch{throw new Error("JSON 저장 파일을 읽지 못했습니다. 원본 파일은 유지됩니다.");}
  if(file?.format==='baseball-life'&&file.version===2){
    if(file.recordEncoding!=='npc-single-role-v1')throw new Error('지원하지 않는 기록 압축 형식입니다. 원본 파일은 유지됩니다.');
    if(saveChecksum(JSON.stringify(file.state))!==file.checksum)throw new Error('저장 파일의 무결성 확인에 실패했습니다. 원본 파일은 유지됩니다.');
    const state=unpackNpcRecordFields(file.state);
    file={format:file.format,version:1,id:file.id,name:file.name,date:file.date,year:file.year,savedAt:file.savedAt,manual:file.manual,checksum:saveChecksum(JSON.stringify(state)),state};
  }
  return validateCareerSave(file as CareerSave);
}
export function serializeCareerSave(file:CareerSave){
  const state=packNpcRecordFields(file.state);
  const wire:PackedCareerSave={...file,version:2,recordEncoding:'npc-single-role-v1',state,checksum:saveChecksum(JSON.stringify(state))};
  return JSON.stringify(wire);
}
function validateCareerSave(file:CareerSave):CareerSave {
  if(file?.format!=="baseball-life"||file.version!==1)throw new Error("지원하지 않는 저장 형식입니다. 원본 파일은 유지됩니다.");
  validateCareerState(file.state);if(saveChecksum(JSON.stringify(file.state))!==file.checksum)throw new Error("저장 파일의 무결성 확인에 실패했습니다. 원본 파일은 유지됩니다.");
  file.state=upgradeSchoolPositions(file.state);
  for(const p of file.state.players)migrateInjuryHistory(p,file.state.date);
  if(!file.state.matchProgress)settleInjuryRetirements(file.state);
  upgradeRawSeasonWar(file.state);
  upgradePendingCareerEvent(file.state);
  for(const p of file.state.players){hydrateAssessments(file.state,p);refreshCareerEvaluation(p);initializeAgingProfile(p);clearProfessionalReputation(p);}
  syncProClubNames(file.state);
  upgradeNationalInvitation(file.state);
  backfillSeasonHonors(file.state);
  upgradeCareerHonors(file.state);
  discardRetiredPlayers(file.state);
  const needsNumbers=file.state.players.some(p=>p.jerseyNumber===undefined);
  if(needsNumbers)syncJerseyNumbers(file.state);
  if(isRemovedAwardCelebration(file.state.careerNotice))file.state=acknowledgeCareer(file.state);
  else if(file.state.noticeQueue?.some(isRemovedAwardCelebration))file.state.noticeQueue=file.state.noticeQueue.filter(notice=>!isRemovedAwardCelebration(notice));
  file.state=removeBattedBallRecords(compactCareerState(file.state));
  file.checksum=saveChecksum(JSON.stringify(file.state));
  return file;
}
async function packStoredSave(file:CareerSave):Promise<StoredCareerSave>{
  const claims=retiredNumberClaims(file.state);
  if(typeof CompressionStream==='undefined')return {...file,retiredNumberClaims:claims};
  const payload=await gzipText(serializeCareerSave(file));
  const {seed,playerId,careerMode,proWorld}=file.state;
  return {...file,retiredNumberClaims:claims,compression:'gzip',payload,state:{seed,playerId,careerMode,...(proWorld?{proWorld:{stage:proWorld.stage}}:{})}};
}
async function unpackStoredSave(file:StoredCareerSave):Promise<CareerSave>{
  if(!('compression' in file))return validateCareerSave(file);
  return decodeCareerSave(await gunzipBytes(file.payload));
}
export async function exportCareerSave(state:GameState){
  const file=encodeCareerSave(state,true),text=serializeCareerSave(file);
  const compressed=typeof CompressionStream!=='undefined';
  const blob=compressed?new Blob([await gzipText(text)],{type:'application/gzip'}):new Blob([text],{type:'application/json'});
  return {file,blob,extension:compressed?'json.gz':'json'};
}
export async function importCareerSave(blob:Blob){return decodeCareerSave(await saveBlobText(blob));}
let database:Promise<IDBDatabase>|undefined;
const storageProgress=new Set<()=>void>();
function openDatabase(){
  if(typeof indexedDB==="undefined")return Promise.reject(new Error("이 환경에서는 로컬 저장소를 사용할 수 없습니다."));
  database??=new Promise((resolve,reject)=>{
    let cancelled=false;
    const request=indexedDB.open("baseball-life-careers",3);
    request.onblocked=()=>{cancelled=true;database=undefined;reject(new Error("저장소 업데이트가 대기 중입니다. 다른 게임 탭을 닫고 새로고침해 주세요."));};
    request.onupgradeneeded=event=>{
      const db=request.result,store=db.objectStoreNames.contains("careers")?request.transaction!.objectStore("careers"):db.createObjectStore("careers",{keyPath:"id"});
      store.createIndex('retirementStage','state.proWorld.stage');
      // Version 2 already consolidated save slots. Adding an index must leave
      // those snapshots (including compressed payloads) untouched.
      if(event.oldVersion>=2)return;
      // The upgrade is atomic: keep the newest snapshot of each career and
      // replace legacy auto/manual/import keys before creating the unique index.
      const latest=new Map<string,CareerSave>(),cursor=store.openCursor();
      cursor.onsuccess=()=>{
        for(const notify of storageProgress)notify();
        const row=cursor.result;
        if(row){const file=row.value as CareerSave,key=careerSaveId(file.state),previous=latest.get(key);
          if(!previous||file.savedAt>=previous.savedAt)latest.set(key,{...file,id:key});
          row.delete();row.continue();
        }else{
          store.createIndex("career",["state.seed","state.playerId"],{unique:true});
          for(const file of latest.values())store.put(file);
        }
      };
    };
    request.onsuccess=()=>{const db=request.result;if(cancelled){db.close();return;}db.onversionchange=()=>{db.close();database=undefined;};resolve(db);};
    request.onerror=()=>{database=undefined;reject(new Error("로컬 저장소를 열지 못했습니다."));};
  });return database;
}
async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>,onProgress?:()=>void):Promise<T>{
  if(onProgress)storageProgress.add(onProgress);
  try{const db=await openDatabase();onProgress?.();return await new Promise<T>((resolve,reject)=>{const tx=db.transaction("careers",mode),request=work(tx.objectStore("careers"));let result:T;
    request.onsuccess=()=>{result=request.result;onProgress?.();};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(new Error("저장소 작업에 실패했습니다. 기존 저장은 보존됩니다."));});
  }finally{if(onProgress)storageProgress.delete(onProgress);}
}
export async function putCareerSave(file:CareerSave){validateCareerState(file.state);if(file.checksum!==saveChecksum(JSON.stringify(file.state)))throw new Error("저장 무결성을 확인하지 못했습니다.");const stored=await packStoredSave(encodeCareerSave(file.state,file.manual,file.savedAt));await transaction("readwrite",store=>store.put({...stored,id:careerSaveId(file.state)}));}
export async function deleteCareerSave(id:string,onProgress?:()=>void){await transaction("readwrite",store=>store.delete(id),onProgress);}
export async function listCareerSaves():Promise<CareerSaveSummary[]>{
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const files:CareerSaveSummary[]=[],tx=db.transaction("careers","readonly"),request=tx.objectStore("careers").openCursor();
    request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const file=cursor.value as StoredCareerSave;
      files.push({id:file.id,name:file.name,date:file.date,savedAt:file.savedAt,manual:file.manual,mode:file.state.careerMode,retired:file.state.proWorld?.stage==="retired"});cursor.continue();};
    tx.oncomplete=()=>resolve(files.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));
    tx.onerror=tx.onabort=()=>reject(new Error("저장 목록을 불러오지 못했습니다."));
  });
}
export async function savedRetiredNumberClaims(){
  const files=await transaction('readonly',store=>store.index('retirementStage').getAll('retired')) as StoredCareerSave[];
  return (await Promise.all(files.filter(file=>file.state.proWorld?.stage==='retired').map(async file=>file.retiredNumberClaims??retiredNumberClaims((await unpackStoredSave(file)).state)))).flat();
}
export async function refreshSavedRetiredNumbers(state:GameState){return applyRetiredNumberClaims(state,await savedRetiredNumberClaims());}
export async function getCareerSave(id:string){const file=await transaction("readonly",store=>store.get(id)) as StoredCareerSave|undefined;if(!file)throw new Error("저장된 커리어를 찾을 수 없습니다.");const saved=await unpackStoredSave(file),state=await refreshSavedRetiredNumbers(saved.state);return {...saved,state,checksum:saveChecksum(JSON.stringify(state))};}
let autoQueue=Promise.resolve();const autoGenerations=new Map<string,number>();
export function queueCareerAutoSave(state:GameState,manual=false,onProgress?:()=>void){
  const key=`${state.seed}:${state.playerId}`,generation=(autoGenerations.get(key)??0)+1;autoGenerations.set(key,generation);
  const job=autoQueue.catch(()=>{}).then(async()=>{
    if(autoGenerations.get(key)!==generation)return;
    try {
      // encodeCareerSave validates and checksums this private snapshot once.
      // Imported/manual files still go through putCareerSave's verification.
      const file=encodeCareerSave(state,manual);
      const stored=await packStoredSave(file);onProgress?.();
      await transaction("readwrite",store=>store.put(stored),onProgress);
    } finally {if(autoGenerations.get(key)===generation)autoGenerations.delete(key);}
  });autoQueue=job;return job;
}
