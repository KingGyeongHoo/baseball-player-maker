import type {GameState} from './sim/types';

export const permanentRetiredNumbers = [
  {club:0, number:54, playerName:'김영선'},
  {club:0, number:21, playerName:'박철수'},
  {club:6, number:18, playerName:'선동일'},
  {club:6, number:7, playerName:'이정범'},
  {club:1, number:41, playerName:'김용우'},
  {club:1, number:9, playerName:'이영규'},
  {club:1, number:33, playerName:'박윤택'},
  {club:7, number:22, playerName:'이민수'},
  {club:7, number:10, playerName:'양종혁'},
  {club:7, number:36, playerName:'이상엽'},
  {club:7, number:21, playerName:'오승헌'},
  {club:5, number:35, playerName:'장종헌'},
  {club:5, number:23, playerName:'정명철'},
  {club:5, number:21, playerName:'송재우'},
  {club:5, number:52, playerName:'김대균'},
  {club:9, number:11, playerName:'최동우'},
  {club:9, number:10, playerName:'이대한'},
  {club:3, number:26, playerName:'박강완'},
] as const;

export function reservedJerseyNumbers(state:GameState, club:number){
  const honors=[...permanentRetiredNumbers,...(state.proWorld?.retiredNumbers??[]),...(state.savedRetiredNumbers??[])];
  return new Set(honors.filter(row=>row.club===club).map(row=>row.number));
}
