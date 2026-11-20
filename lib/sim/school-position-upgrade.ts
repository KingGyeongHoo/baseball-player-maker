import type {GameState} from './types';

// Old random starts could register a hitter as DH. Keep their career and
// abilities, and restore a corner defensive registration for the open DH rule.
export function upgradeSchoolPositions(input:GameState):GameState{
  if(input.careerMode||input.weekProgress||input.matchProgress||!input.players.some(p=>p.position==='DH'||p.twoWay?.battingPosition==='DH'))return input;
  const state=structuredClone(input);
  for(const p of state.players){
    if(p.position==='DH'){
      p.position='1B';p.primaryRole='코너 야수';p.preferredRole='코너 야수';
      if(!p.eligiblePositions.includes('1B'))p.eligiblePositions.push('1B');
    }
    if(p.twoWay?.battingPosition==='DH'){
      p.twoWay.battingPosition='1B';
      if(!p.eligiblePositions.includes('1B'))p.eligiblePositions.push('1B');
    }
  }
  return state;
}
