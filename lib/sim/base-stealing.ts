import type {Stats} from './types';

// One decision between plate appearances, with first occupied and second open.
export function stolenBaseAttempt(runner:Stats,pitcher:Stats,catcher:Stats,attemptRoll:number,resultRoll:number){
  const attempt=Math.max(.01,Math.min(.22,.065+(runner.speed-60)*.003+(runner.bq-60)*.0004));
  if(attemptRoll>=attempt)return 'none';
  const success=Math.max(.4,Math.min(.93,.72+(runner.speed-65)*.004+(runner.bq-60)*.0015-(catcher.arm-65)*.002-(pitcher.control-65)*.001));
  return resultRoll<success?'safe':'out';
}
