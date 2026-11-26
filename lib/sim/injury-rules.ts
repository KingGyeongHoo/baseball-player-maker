import type {Stat,Ticket} from './types';
export type InjuryBody='arm'|'trunk'|'leg'|'hand';
export type InjuryGrade='mild'|'moderate'|'major'|'severe'|'careerEnding';
export type RecoveryStage='treatment'|'rehab'|'adaptation'|'healthy'|'superseded'|'retired';
export const injuryBodies:Record<InjuryBody,{name:string;stats:Stat[];restricted:Ticket[];pitching:number;batting:number;fielding:number}>={
  arm:{name:'어깨/팔꿈치',stats:['velocity','arm','control'],restricted:['velocity','control','movement','physical'],pitching:5,batting:1,fielding:1},
  trunk:{name:'허리/몸통',stats:['power','stamina'],restricted:['power','velocity','physical'],pitching:2,batting:2,fielding:1},
  leg:{name:'무릎/발목',stats:['speed','defense'],restricted:['speed','defense','physical'],pitching:1,batting:1,fielding:4},
  hand:{name:'손/손목',stats:['contact','power'],restricted:['contact','power','physical'],pitching:1,batting:4,fielding:1},
};
export const injuryRules={
  version:1,gameBaseRisk:.0007,trainingBaseRisk:.0003,fatigueRisk:.007,fatigueExponent:3,maxRisk:.06,
  recentDays:28,recentDailyReference:.75,recentRiskWeight:.35,maxRecentMultiplier:2,
  trainingLoadScale:1,trainingBaseLoad:.25,trainingTicketReference:40,trainingBodyWeight:.3,pitchingLoadPerBatter:.045,battingLoadPerPA:.08,fieldingGameLoad:.6,
  maxExposure:3,rehabLoad:.2,rehabMaxTickets:1,adaptationRisk:1.8,repeatRisk:.12,maxRepeatRisk:.6,
  historyDays:730,severityFatigue:3,severityFatigueExponent:2,durationPower:2.5,treatmentFraction:.45,
  bodyBaseWeight:1,bodyHistoryWeight:1,
  repeatPermanentChance:.03,maxPermanentChance:.45,permanentMin:.5,permanentMax:3,
  riskDaysPerPoint:12,riskPerEpisodeMax:30,riskRecurrencePoints:6,riskCurrentMax:25,riskCurrentDaysPerPoint:10,riskAdaptationPoints:8,
  cautionRisk:.002,highRisk:.006,veryHighRisk:.015,
  riskHalfLifeDays:365,riskMax:65,salaryDiscountMax:.2,interestPenaltyMax:8,contractRiskThreshold:30,contractYearsLost:1,
  seasonPenaltyMax:1,seasonPenaltyPerDay:1/180,
  grades:{
    mild:{name:'경상',min:3,max:14,weight:.9,penalty:3,adaptation:7,permanentChance:0},
    moderate:{name:'중상',min:15,max:89,weight:.087,penalty:7,adaptation:14,permanentChance:0},
    major:{name:'중대 부상',min:90,max:179,weight:.011,penalty:12,adaptation:28,permanentChance:.12},
    severe:{name:'심각한 부상',min:180,max:365,weight:.0019,penalty:18,adaptation:45,permanentChance:.3},
    careerEnding:{name:'선수 생활 종료 부상',min:366,max:540,weight:.0001,penalty:22,adaptation:0,permanentChance:0},
  },
};
export const injuryGrade=(days:number):InjuryGrade=>days>365?'careerEnding':days>=180?'severe':days>=90?'major':days>=15?'moderate':'mild';
