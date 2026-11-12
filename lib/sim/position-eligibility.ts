import type {Player,Position,Role} from './types';

export const canPlayPosition = (player: Pick<Player,'throws'>, position: Position) =>
  player.throws !== 'L' || !(['C','2B','3B','SS'] as Position[]).includes(position);
export const canPlayRole = (player: Pick<Player,'throws'>, role: Role) => player.throws !== 'L' || role !== '포수';
export function assertPositionEligible(player: Pick<Player,'throws'>, position: Position) {
  if (!canPlayPosition(player,position)) throw new Error('좌투 선수는 포수·2루수·3루수·유격수로 등록할 수 없습니다.');
}
