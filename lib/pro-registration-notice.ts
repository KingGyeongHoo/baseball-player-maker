import type {GameState} from './sim/types';

type Notice=NonNullable<GameState['careerNotice']>;
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
  const club=state.postSchool?.pro?.club;
  const resolve=(name:string)=>{
    const player=state.players.find(p=>p.name===name&&p.id===state.playerId)
      ??state.players.find(p=>p.name===name&&p.teamId>=0&&p.teamId%10===club)
      ??state.players.find(p=>p.name===name);
    return {name,playerId:player?.id,position:player?.position};
  };
  const promoted:ReturnType<typeof resolve>[]=[],removed:ReturnType<typeof resolve>[]=[];
  for(const line of registrationNoticeMessage(state,notice).split('\n\n')){
    const match=line.match(/^\[(콜업|말소)\]\s*(.+)$/);
    if(match)(match[1]==='콜업'?promoted:removed).push(resolve(match[2]));
  }
  return {promoted,removed};
}

export function summarizeRegistrationNotices(state:GameState,before:Map<string,number>,priorNotices:Set<string>){
  const mine=state.players.find(p=>p.id===state.playerId),from=before.get(state.playerId);
  if(!mine||from===undefined||from<0||mine.teamId<0)return;
  const club=mine.teamId%10;
  for(const notice of [state.careerNotice,...(state.noticeQueue??[])]){
    if(!notice||priorNotices.has(notice.id)||!['promoted','demoted'].includes(notice.kind))continue;
    const boundary=notice.code?.startsWith('reserve:')?1:0,calledUp:string[]=[],removed:string[]=[];
    for(const player of state.players){
      const old=before.get(player.id);
      if(old===undefined||old<0||old%10!==club||player.teamId<0||player.teamId%10!==club)continue;
      const wasUpper=Math.floor(old/10)<=boundary,isUpper=Math.floor(player.teamId/10)<=boundary;
      if(!wasUpper&&isUpper)calledUp.push(player.name);
      if(wasUpper&&!isUpper)removed.push(player.name);
    }
    if(calledUp.length||removed.length)notice.message=registrationChangeMessage(calledUp,removed);
  }
}
