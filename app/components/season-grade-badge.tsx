import GradeBadge from './grade-badge';
import Tooltip from './tooltip';
import {seasonRoleNames} from '../../lib/sim/pro-season-ranking';
import type {ProSeasonRank} from '../../lib/sim/pro-types';

export default function SeasonGradeBadge({score,grade,rank,war,noAppearances}:{score:number|null;grade?:string;rank?:ProSeasonRank;war?:number;noAppearances?:boolean}){
  const medal=rank&&rank.rank<=3?['gold','silver','bronze'][rank.rank-1]:undefined;
  const detail=rank?`${rank.level==='first'?'':'2군 '}${seasonRoleNames[rank.role]} ${rank.rank}위 / ${rank.total}명${rank.basis==='retained-records'?' · 남아 있는 저장 기록 기준':''}`:undefined;
  return <Tooltip content={<span className="season-rank-tooltip">{noAppearances?'WAR 0.0 · 공식전 출전 0경기 · 시즌 평가 F':war===undefined?'이 시즌의 WAR 기록이 없습니다.':`WAR ${war.toFixed(1)}`}{detail&&<strong className={medal?`season-rank-${medal}`:undefined}>{detail}</strong>}</span>}>
    <GradeBadge score={score} pro label="시즌 평가" grade={rank?.grade??grade}/>
  </Tooltip>;
}
