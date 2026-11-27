import {labels} from '../../lib/sim/engine';
import {conditioningMultiplier,equipmentStats} from '../../lib/sim/offseason-shop';
import {proDailyRecovery} from '../../lib/sim/pro-pitching-fatigue';
import {proTrainingRules,proTrainingSelection,saveProTraining} from '../../lib/sim/pro-training';
import {ticketKeys,type Player,type Policy} from '../../lib/sim/types';
import {scoreText} from '../../lib/display';
import PlayerTalents from './player-talents';

const decimal=(n:number)=>Number(n.toFixed(1)).toString();
export default function ProSeasonTraining({player,policy,setPolicy,showTalents=false}:{player:Player;policy:Policy;setPolicy:(p:Policy)=>void;showTalents?:boolean}){
  const selection=proTrainingSelection(player,policy),rule=proTrainingRules[selection.intensity],stats=equipmentStats(player);
  const update=(change:Partial<typeof selection>)=>setPolicy(saveProTraining(player,policy,{...selection,...change}));
  return <>
    {showTalents&&<PlayerTalents player={player}/>}
    <div className="pro-season-training">
      <p className="small muted">설정은 변경할 때까지 유지됩니다. 출전일에는 훈련량을 줄이고 경기에 집중합니다.</p>
      <fieldset className="pro-training-section"><legend>집중 능력치</legend><div className="pro-training-focus">
        {ticketKeys.map(key=><button type="button" key={key} className={selection.focus===key?'selected':''} aria-pressed={selection.focus===key} onClick={()=>update({focus:key})}><b>{labels[key]}</b><span>{scoreText(key==='physical'?(stats.stamina+stats.recovery+stats.arm)/3:stats[key])}</span></button>)}
      </div></fieldset>
      <fieldset className="pro-training-section"><legend>훈련 강도</legend><div className="pro-training-intensity">
        {(Object.keys(proTrainingRules) as (keyof typeof proTrainingRules)[]).map(key=><button type="button" key={key} className={selection.intensity===key?'selected':''} aria-pressed={selection.intensity===key} onClick={()=>update({intensity:key})}><b>{proTrainingRules[key].label}</b><span>{proTrainingRules[key].description}</span></button>)}
      </div></fieldset>
      <div className="pro-training-summary" role="status"><b>{labels[selection.focus]} 집중 · {rule.label}</b><dl><div><dt>훈련 피로</dt><dd>하루 최대 +{decimal(rule.fatigue*conditioningMultiplier(player))}</dd></div><div><dt>일일 회복</dt><dd>최대 −{decimal(proDailyRecovery(stats.recovery))}</dd></div></dl><p>경기 피로는 별도로 쌓입니다. 회복 위주를 선택해도 경기에 출전하며, 피로는 0 아래로 내려가지 않습니다.</p>{conditioningMultiplier(player)<1&&<p>컨디셔닝 코치의 피로 감소 효과 적용 중</p>}</div>
    </div>
  </>;
}
