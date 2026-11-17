import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),war=require('../../.test-build/lib/sim/pro-war.js');
// Historical test fixtures choose rank bands corresponding to their original
// grade. Production code never invents a percentile from a legacy score.
export function attachTestRanks(p){
  for(const row of p.professional.assessments){
    if(row.score===null)continue;
    const rank=row.score>=81.05?1:row.score>=78.95?2:row.score>=76.95?4:row.score>=74.95?6:row.score>=72.95?9:10;
    const grade=rank===1?'S':rank<=3?'A':rank<=5?'B':rank<=8?'C':rank===9?'D':'F';
    const raw=war.proWarAssessment(p),wins=(row.score-71)/2;
    raw.score=row.score;raw.equivalentWins=wins;raw.first.batting=wins;
    row.war=raw;delete row.seasonEvaluation;
    row.seasonRank={version:1,year:row.year,role:'starter',level:row.squad==='second'?'second':'first',war:wins,rank,total:10,grade};row.grade=grade;
  }
}
