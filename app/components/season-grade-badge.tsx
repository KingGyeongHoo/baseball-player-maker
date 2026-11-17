import GradeBadge from './grade-badge';
import Tooltip from './tooltip';
import {seasonRoleNames} from '../../lib/sim/pro-season-ranking';
import type {ProSeasonRank} from '../../lib/sim/pro-types';

export default function SeasonGradeBadge({score,grade,rank,war}:{score:number|null;grade?:string;rank?:ProSeasonRank;war?:number}){
  const medal=rank&&rank.rank<=3?['gold','silver','bronze'][rank.rank-1]:undefined;
  const detail=rank?`${rank.level==='first'?'':'2군 '}${seasonRoleNames[rank.role]} ${rank.rank}위 / ${rank.total}명${rank.basis==='retained-records'?' · 남아 있는 저장 기록 기준':''}`:undefined;
  const text=war===undefined?'이 시즌의 WAR 기록이 없습니다.':`WAR ${war.toFixed(1)}${detail?` · ${detail}`:''}`;
  return <Tooltip content={<span className="season-rank-tooltip">{war!==undefined&&<>WAR {war.toFixed(1)}</>}{detail&&<> · <strong className={medal?`season-rank-${medal}`:undefined}>{detail}</strong></>}{war===undefined&&text}</span>}>
    <span className={medal?`season-grade-medal season-medal-${medal}`:undefined} aria-label={`시즌 평가 ${rank?.grade??grade??''} · ${text}`}>
      <GradeBadge score={score} pro label="시즌 평가" grade={rank?.grade??grade}/>
    </span>
  </Tooltip>;
}
