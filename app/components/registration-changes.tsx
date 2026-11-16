import {positions} from '../../lib/sim/engine';
import type {GameState} from '../../lib/sim/types';
import {registrationNoticePlayers} from '../../lib/pro-registration-notice';

export default function RegistrationChanges({state,notice}:{state:GameState;notice:NonNullable<GameState['careerNotice']>}){
  const changes=registrationNoticePlayers(state,notice);
  return <div className="registration-changes" role="group" aria-label="승격·말소 명단">
    {(['promoted','removed'] as const).map(direction=><section className={`registration-column ${direction}`} key={direction} aria-label={direction==='promoted'?'승격 선수':'말소 선수'}>
      <h3><span className="registration-direction" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={direction==='promoted'?'M12 19V5m-6 6 6-6 6 6':'M12 5v14m-6-6 6 6 6-6'}/></svg></span>{direction==='promoted'?'승격':'말소'}</h3>
      {changes[direction].length?<ul className="registration-player-list">{changes[direction].map((player,index)=><li key={`${player.playerId??player.name}:${index}`} className={player.playerId===state.playerId?'registration-mine':''}>
        <strong className="registration-player-name">{player.name}</strong>{player.position&&<span className="registration-player-position">({positions[player.position]})</span>}
      </li>)}</ul>:<p className="registration-empty">—</p>}
    </section>)}
  </div>;
}
