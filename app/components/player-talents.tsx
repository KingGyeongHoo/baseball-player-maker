import {params,talentLabel} from '../../lib/sim/engine';
import {talentBand} from '../../lib/sim/talent';
import type {Player} from '../../lib/sim/types';

export default function PlayerTalents({player}:{player:Player}){
  return <section className="player-talents" aria-label="선수 재능"><div className="talent-grid">
    {(['batting','pitching'] as const).map(field=>{
      const known=player.talentExposure[field]>=params['talent.hint'],label=talentLabel(player,field),tone=known?talentBand(player.talent[field]).tone:'unknown';
      return <div className="talent-item" key={field}><span className="talent-caption">{field==='batting'?'타자':'투수'} 재능</span><strong className={`talent-value talent-${tone}`}>{label}</strong></div>;
    })}
  </div><p className="talent-note">분야별 유효 훈련 {params['talent.hint']}주부터 등급 · {params['talent.reveal']}주부터 점수 공개</p></section>;
}
