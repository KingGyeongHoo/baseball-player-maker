import type {Position,RecordLine,Role,Stat,Stats,Stance} from "./types";

export type EvaluationField="batting"|"pitching";
export type EvaluationReason="introduced"|"entry"|"monthly"|"season-start"|"season-end"|"draft"|"role-change"|"team-change"|"ability-change"|"contract";
export type EvaluationReference={
  id:string;version:1;year:number;mode:"school"|"pro";createdAt:string;source:"season-start"|"introduced"|"default";
  population:{batting:number;pitching:number};tools:Record<Stat,{mean:number;sd:number;size:number;fallback:boolean}>;
  roles:Record<Role,{mean:number;sd:number;size:number;fallback:boolean}>;
  opponents:{batting:Stats[];pitching:Stats[]};defense:number;arm:number;
  parameters:Record<string,number>;roleWeights:Record<Role,Partial<Record<Stat,number>>>;
};
export type EvaluationRates={avg:number|null;obp:number|null;slg:number|null;ops:number|null;iso:number|null;bb:number|null;k:number|null;hr:number|null;era:number|null;whip:number|null;kMinusBB:number|null};
export type PerformanceEvidence={
  field:EvaluationField;sample:number;outs:number;raw:EvaluationRates;adjusted:EvaluationRates;league:EvaluationRates;
  score:number|null;confidence:string;reliability:number;prior:{events:number;hits:number;extraBases:number};
  leagueSeason?:number|null;
};
export type ReputationPerformance={score:number;sample:number;reliability:number};
export type ReputationAssessment={version:1;modelVersion:string;date:string;season:number;mode:"school"|"pro";fields:Record<EvaluationField,Record<"school"|"first"|"second",ReputationPerformance|null>>};
export type ReputationBreakdown={modelVersion:string;assessedAt:string|null;ability:number;performance:number|null;performanceWeight:number;base:number;bonus:number;total:number;fields:{field:EvaluationField;role:Role;ability:number;performance:number|null;reliability:number;performanceWeight:number;score:number}[]};
export type ExpectedMatchup={bb:number;hit:number;k:number;single:number;double:number;triple:number;hr:number;obp:number;slg:number;ops:number;opponents:number};
export type EvaluationSnapshot={
  id:string;version:1;modelVersion:string;balanceVersion:string;playerId:string;playerName:string;date:string;season:number;reason:EvaluationReason;mode:"school"|"pro";
  grade:number;graduationYear:number|null;age:number|null;teamId:number;teamName:string;position:Position;role:Role;eligiblePositions:Position[];twoWay:boolean;
  referenceId:string;referenceSource:EvaluationReference["source"];referenceCreatedAt:string;
  stats:Stats;stance:Stance;tools:{stat:Stat;value:number;grade:number;continuous:number;mean:number;sd:number;population:number;fallback:boolean;cohortRank?:number;cohortSize?:number}[];
  publicTalent:Record<EvaluationField,{label:string;min:number;max:number}>;
  records:{school:RecordLine|null;first:RecordLine|null;second:RecordLine|null;postseason:RecordLine|null};
  performance:{school:Record<EvaluationField,PerformanceEvidence>|null;first:Record<EvaluationField,PerformanceEvidence>|null;second:Record<EvaluationField,PerformanceEvidence>|null};
  multiyear:{first:Record<EvaluationField,PerformanceEvidence>;second:Record<EvaluationField,PerformanceEvidence>}|null;
  recent:{from:string|null;to:string|null;first:RecordLine;second:RecordLine;school:RecordLine;games:number};
  evidence:{games:number;opponents:number;from:string|null;to:string|null;competitions:{id:string;name:string;games:number;records:RecordLine}[];opponentSnapshotGames:number};
  model:{batting:ExpectedMatchup;pitching:ExpectedMatchup};
  roles:{role:Role;score:number;grade:number;continuous:number;strengths:Stat[];needs:Stat[]}[];
  growth:{from:string;to:string;changes:Partial<Stats>}|null;
  health:{fatigue:number;forcedRest:boolean;injuryUntil:string|null;penalty:number;available:boolean;developmental:boolean;transferWeeks:number;unattached:boolean;unattachedYears:number};
  availability:{year:number;from:string;days:number;availableDays:number;injuredDays:number;firstDays:number;lastDate:string}|null;
  comparison:{draftScore:number|null;legacyContract:number|null;legacyRegistration:number;candidateRegistration:number|null};
  reputation?:ReputationBreakdown;
  missing:string[];
};
export type EvaluationProjection={target:string;label:string;basis:string;fields:Record<EvaluationField,{current:number;low:number;base:number;high:number}>;registeredBase?:Record<EvaluationField,number>};
export type PackedEvaluationRecords={school:number[]|null;first:number[]|null;second:number[]|null;postseason:number[]|null};
export type EvaluationObservation=Omit<EvaluationSnapshot,"records"|"recent"|"evidence"|"performance"|"multiyear"|"model"|"roles"|"tools">&{
  contextId:string;records:PackedEvaluationRecords;
  cohort:{stat:Stat;rank:number;size:number}[];
  recent:Omit<EvaluationSnapshot["recent"],"first"|"second"|"school">&{first:number[];second:number[];school:number[]};
  evidence:Omit<EvaluationSnapshot["evidence"],"competitions">&{competitions:{id:string;name:string;games:number;records:number[]}[]};
};
export type EvaluationContextArchive={id:string;date:string;year:number;mode:"school"|"pro";referenceId:string;league:{school:number[];first:number[];second:number[]};leagueSeasons?:Record<"school"|"first"|"second",number|null>;history:Record<string,number[]>;parameters:Record<string,number>};
export type EvaluationSystem={version:1;references:EvaluationReference[];contexts:EvaluationContextArchive[];lastMonthly?:string;introducedAt:string};
