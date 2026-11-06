import type { DraftPick, Player, Position, RecordLine, Stats } from "./types";
import type {ProRoleTrial} from "./pro-event-types";

export type ProStage = "camp" | "regular" | "postseason" | "summary" | "offseason" | "retired";
export type SalaryContract = { id:string; club:number; startYear:number; endYear:number; salary:number; segments:{from:string;salary:number}[]; source:"rookie"|"renewal"|"fa"|"released" };
export type ProfessionalPlayer = {
  rookieYear:number; firstClub:number; entry:string; employment:"active"|"freeAgent"|"retired";
  contract:SalaryContract|null; agingOffset:number; agedYear:number; ageChanges?:Partial<Stats>;
  faDays:number; faEligible:boolean; registration:{year:number;days:number;lastDate?:string};
  lastAppearance?:string; lastRegistration?:string; lastEvaluation?:string; requestAfter?:string;
  managedUntil?:string; roleTrial?:ProRoleTrial; unattachedYears:number;
  requestedEvaluationUntil?:string;
  twoWayReview?:{positions:{pitchingPosition:Position;battingPosition:Position};qualifiedDays:number;belowDays:number;lastDate?:string;nextProposalDate?:string};
  twoWayHistory?:{date:string;action:string;positions:{pitchingPosition:Position;battingPosition:Position};reason:string}[];
  entryReputation:number; proBonus:number; earnings:number; highestSalary:number; peak:Stats;
  firsts:{debut?:string;start?:string;hit?:string;homeRun?:string;strikeout?:string};
  movements:{date:string;from:number|null;to:number|null;kind:string;reason:string}[];
  salaries:{year:number;club:number;amount:number;salary:number}[];
  guarantees?:{year:number;club:number;amount:number}[];
  service:{club:number;from:number;to:number}[];
};
export type ClubRecords = {first:RecordLine;second:RecordLine;postseason:RecordLine};
export type ProAward = {year:number;kind:string;playerId:string;playerName:string;club:number;value:number};
export type Standing = {teamId:number;wins:number;losses:number;draws:number;points:number;difference:number};
export type ProSeasonArchive = {year:number;endDate?:string;standings:Standing[];farmStandings:Standing[];champion:number|null;awards:ProAward[];draft:DraftPick[]};
export type ProSeries = {id:string;stage:"semi"|"final";clubs:[number,number];wins:[number,number];target:number;game:number;lastDate:string;winner?:number;rosters:Record<string,string[]>;excluded:string[]};
export type ContractOffer = {id:string;club:number;year:number;years:number;salary:number;role:string;kind:"renewal"|"fa"|"released";negotiated:boolean;final:boolean;competition:string[]};
export type ProWorld = {
  version:1; year:number; stage:ProStage; regularEnd:string; seasonClosed:boolean;
  clubs:{id:number;direction:"contend"|"balanced"|"rebuild";budget:number;deadMoney:Record<string,number>;nextReview?:string}[];
  seasons:ProSeasonArchive[]; archive:Player[]; news:{id:string;date:string;text:string}[];
  postseason?:{seeds:number[];series:ProSeries[];champion?:number};
  market?:{year:number;kind:"renewal"|"fa"|"released";round:number;offers:ContractOffer[];settled:boolean;requestedRelease?:boolean};
  goal:string; longGoal:string; customGoal?:string; campShown?:number; midseasonShown?:number;
  retired?:{date:string;reason:string;forfeited:number;summary:string};
  monthly?:{month:string;text:string}; lastMonthly?:string; draftedYears:number[];
  rookieCandidates?:Player[];
};
