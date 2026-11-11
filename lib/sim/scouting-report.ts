import { isPitcher, labels,roleLabel } from "./engine";
import type { DraftPick, GameState, Player, RecordLine, ScoutingReport, Stat, Stats } from "./types";

const descriptions:Partial<Record<Stat,[string,string,string]>>={
  power:["강력한 파워 툴","장타를 만드는 힘","타구에 힘을 실어 장타를 노릴 수 있는 도구다."],
  speed:["빠른 발","주루에서 살릴 스피드","주루와 넓은 수비 범위에 활용할 수 있는 빠르기다."],
  contact:["정교한 컨택","타격의 바탕이 되는 컨택","공을 배트에 맞히는 능력이 타격의 중심이다."],
  defense:["믿고 맡길 수 있는 수비","수비에서 보이는 가능성","수비 기본기를 바탕으로 포지션 경쟁을 준비할 수 있다."],
  velocity:["힘 있는 구위","구위의 성장 가능성","빠른 공으로 타자를 상대하는 투구의 바탕이다."],
  control:["안정적인 제구","제구를 바탕으로 한 투구","원하는 코스로 공을 보내는 능력을 살필 수 있다."],
  movement:["위력적인 변화구","변화구의 완성도","구종의 움직임을 활용해 타자의 타이밍을 흔드는 도구다."],
  stamina:["선발을 소화할 체력","긴 이닝을 위한 체력 기반","선발 역할에서 투구를 이어갈 수 있는 체력 자원이다."],
  arm:["강한 송구 능력","송구에서 보이는 가능성","포수 수비와 송구에 활용할 수 있는 어깨다."],
};
const number=(n:number)=>String(Math.trunc(n));

export function createScoutingReport(pick:DraftPick,year:number,snapshot?:{stats:Stats;records?:RecordLine},peers:Player[]=[],clubNeed?:number,source:ScoutingReport["source"]="draft"):ScoutingReport {
  const pitching=isPitcher(pick.role),keys:Stat[]=pitching?["velocity","control","movement"]:["contact","power","speed","defense"];
  if(pick.role==="선발")keys.push("stamina");if(pick.role==="포수")keys.push("arm");
  const pool=peers.filter(p=>isPitcher(p.primaryRole)===pitching||!!p.twoWay);
  const tools=snapshot?[...keys].sort((a,b)=>snapshot.stats[b]-snapshot.stats[a]||keys.indexOf(a)-keys.indexOf(b)).slice(0,2).map(stat=>{
    const value=snapshot.stats[stat],words=descriptions[stat]!;
    const rank=1+pool.filter(p=>p.stats[stat]>value).length;
    return {stat,value,title:value>=75?words[0]:value>=55?words[1]:`${labels[stat]}의 성장 기반`,description:value>=55?words[2]:`현재 주 분야에서 살펴볼 도구다. 입단 뒤 ${labels[stat]}을 실전에서 다듬는 과정이 필요하다.`,...(pool.length>=10?{rank,poolSize:pool.length}:{})};
  }):[];
  const reputation=pick.reputation>=80?"높은 평판":pick.reputation>=60?"쌓아온 평판":"당시의 종합 평가";
  const reasons:ScoutingReport["reasons"]=[{title:reputation,description:`지명 당시 평판 ${number(pick.reputation)}점을 기록했다. 실제 지명 평가는 평판에 성장 가능성과 보직 적합도를 함께 반영했다.`},
    {title:clubNeed!==undefined&&clubNeed>=65?"구단의 보직 보강 수요":"보직 적합성",description:clubNeed!==undefined&&clubNeed>=65?`${roleLabel(pick.role)} 자원을 보강하려던 구단의 평가에 맞는 후보로 검토됐다. 보직 적합도는 ${number(pick.fit)}점이다.`:`${roleLabel(pick.role)} 역할의 능력과 구단 수요를 함께 본 적합도는 ${number(pick.fit)}점이었다.`}];
  if(pick.talent>=8)reasons.push({title:"앞으로의 성장 가능성",description:"주 분야의 성장 가능성도 지명 평가에 힘을 보탰다. 실제 성장은 훈련과 출전, 몸 관리에 달려 있다."});
  const records=snapshot?.records;
  if(!pitching&&records&&records.batting.PA>=40)reasons.push({title:"타석에서 쌓은 경험",description:`당해 시즌 ${records.batting.PA}타석, ${records.batting.H}안타, ${records.batting.HR}홈런을 남겼다. 이 기록과 당시 기량을 함께 살펴볼 수 있다.`});
  if(pitching&&records&&records.pitching.outs>=30)reasons.push({title:"마운드에서 쌓은 경험",description:`당해 시즌 ${Math.floor(records.pitching.outs/3)}이닝 ${records.pitching.outs%3}아웃, ${records.pitching.SO}탈삼진을 기록했다. 투구 경험과 당시 기량을 함께 살펴볼 수 있다.`});
  const lowest=snapshot?[...keys].sort((a,b)=>snapshot.stats[a]-snapshot.stats[b]||keys.indexOf(a)-keys.indexOf(b))[0]:null;
  const development=lowest?`${labels[lowest]}을 더 다듬고 주력 도구를 꾸준히 경기에서 보여주는 것이 입단 후 과제다. 실제 출전은 구단 내 경쟁과 컨디션에 따라 결정된다.`:"입단 뒤의 기회는 실제 기량과 경기 성과, 구단 내 경쟁과 컨디션에 따라 결정된다.";
  return {version:1,year,source,summary:tools.length?`${pick.playerName}은 '${tools[0].title}'을 중심으로 살펴본 ${roleLabel(pick.role)} 자원이다. ${reputation}과 보직 평가, 성장 가능성을 종합한 지명이다.`:`${pick.playerName}은 ${reputation}과 보직 적합도를 종합해 선택한 ${roleLabel(pick.role)} 자원이다.`,tools,reasons,development,
    ...(snapshot?{statsSnapshot:{...snapshot.stats},...(records?{recordsSnapshot:structuredClone(records)}:{})}:{}),...(clubNeed!==undefined?{clubNeed}:{})};
}

export function scoutingReportFor(state:GameState,pick:DraftPick,year?:number):ScoutingReport {
  if(pick.scoutingReport?.version===1)return pick.scoutingReport;
  const player=state.players.find(p=>p.id===pick.playerId)??state.proWorld?.archive.find(p=>p.id===pick.playerId);
  const college=state.postSchool?.collegeDraft?.some(p=>p.playerId===pick.playerId)&&!state.draft.some(p=>p.playerId===pick.playerId);
  const inferredYear=college?player?.career.filter(row=>row.careerMode==="college").at(-1)?.year??(state.postSchool!.graduationYear+state.postSchool!.collegeYears):state.postSchool?.graduationYear;
  const draftYear=year??inferredYear??state.calendar.seasonYear;
  const archive=player?.career.find(row=>row.year===draftYear&&row.careerMode!=="pro");
  const atDraft=state.phase==="ended"&&state.careerMode!=="pro"&&state.calendar.seasonYear===draftYear;
  const snapshot=archive?{stats:archive.stats,records:archive.records}:atDraft&&player?{stats:player.stats,records:player.seasonStats}:undefined;
  return createScoutingReport(pick,draftYear,snapshot,[],undefined,snapshot?"archive":"evaluation");
}
