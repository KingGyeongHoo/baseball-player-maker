import type {GameState,Player} from './sim/types';

type Notice=NonNullable<GameState['careerNotice']>;
type RegistrationPlayer={playerId:string;name:string;position:Player['position']};
export type RegistrationChangeSet={promoted:RegistrationPlayer[];removed:RegistrationPlayer[]};
export function registrationChangeNotice(calledUp:Player[],removed:Player[]){
  const snapshot=(player:Player):RegistrationPlayer=>({playerId:player.id,name:player.name,position:player.position});
  return {message:registrationChangeMessage(calledUp.map(p=>p.name),removed.map(p=>p.name)),
    registrationChanges:{promoted:calledUp.map(snapshot),removed:removed.map(snapshot)}};
}
export const registrationChangeMessage=(calledUp:string[],removed:string[])=>[
  ...calledUp.map(name=>`[콜업] ${name}`),...removed.map(name=>`[말소] ${name}`),
].join('\n\n');

// Older saves can already be paused on a notice containing the former score explanation.
export function registrationNoticeMessage(state:GameState,notice:Notice){
  if(state.careerMode!=='pro'||!['promoted','demoted'].includes(notice.kind)||/^\[(콜업|말소)\]/.test(notice.message))return notice.message;
  const mine=state.players.find(p=>p.id===state.playerId)?.name??'';
  const other=notice.message.match(/(?:^| · )([^·]+?) 선수와 등록을 교환했습니다\.$/)?.[1];
  return registrationChangeMessage(notice.kind==='promoted'?[mine]:other?[other]:[],notice.kind==='demoted'?[mine]:other?[other]:[]);
}

export function registrationNoticePlayers(state:GameState,notice:Notice){
  if(notice.registrationChanges)return notice.registrationChanges;
  const mine=state.players.find(p=>p.id===state.playerId),club=state.postSchool?.pro?.club??(mine&&mine.teamId>=0?mine.teamId%10:undefined);
  const mineDirection=notice.kind==='promoted'?'promoted':'removed',used=new Set<string>();
  const boundary=notice.code?.startsWith('reserve:')?1:0;
  const level={first:0,second:1,third:2,developmental:3};
  const exchange=state.postSchool?.pro?.transactions.findLast(row=>row.date===notice.date&&
    (notice.kind==='promoted'?level[row.from]>boundary&&level[row.to]<=boundary:level[row.from]<=boundary&&level[row.to]>boundary))?.exchangedPlayerId;
  const resolve=(name:string,direction:'promoted'|'removed')=>{
    const candidates=state.players.filter(p=>p.name===name&&!used.has(p.id)&&p.id!==state.playerId&&p.teamId>=0&&p.teamId%10===club);
    const matching=candidates.filter(p=>(Math.floor(p.teamId/10)<=boundary)===(direction==='promoted'));
    // An old text-only notice cannot always distinguish namesakes. Never guess an ID.
    const player=direction===mineDirection&&mine?.name===name&&!used.has(mine.id)?mine
      :direction!==mineDirection&&candidates.find(p=>p.id===exchange)
        ||(matching.length===1?matching[0]:candidates.length===1?candidates[0]:undefined);
    if(player)used.add(player.id);
    return {name,playerId:player?.id,position:player?.position};
  };
  const promoted:ReturnType<typeof resolve>[]=[],removed:ReturnType<typeof resolve>[]=[];
  for(const line of registrationNoticeMessage(state,notice).split('\n\n')){
    const match=line.match(/^\[(콜업|말소)\]\s*(.+)$/);
    if(match){const direction=match[1]==='콜업'?'promoted':'removed';(direction==='promoted'?promoted:removed).push(resolve(match[2],direction));}
  }
  return {promoted,removed};
}

export function summarizeRegistrationNotices(state:GameState,before:Map<string,number>,priorNotices:Set<string>){
  const mine=state.players.find(p=>p.id===state.playerId),from=before.get(state.playerId);
  if(!mine||from===undefined||from<0||mine.teamId<0)return;
  const club=mine.teamId%10;
  for(const notice of [state.careerNotice,...(state.noticeQueue??[])]){
    if(!notice||priorNotices.has(notice.id)||!['promoted','demoted'].includes(notice.kind))continue;
    const boundary=notice.code?.startsWith('reserve:')?1:0,calledUp:Player[]=[],removed:Player[]=[];
    for(const player of state.players){
      const old=before.get(player.id);
      if(old===undefined||old<0||old%10!==club||player.teamId<0||player.teamId%10!==club)continue;
      const wasUpper=Math.floor(old/10)<=boundary,isUpper=Math.floor(player.teamId/10)<=boundary;
      if(!wasUpper&&isUpper)calledUp.push(player);
      if(wasUpper&&!isUpper)removed.push(player);
    }
    if(calledUp.length||removed.length)Object.assign(notice,registrationChangeNotice(calledUp,removed));
  }
}
