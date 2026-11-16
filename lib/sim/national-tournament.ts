import {addDays,available,clamp,emptyRecord,getPlayer,hash,injuryRisk,mergeRecord,params,pitchingRole,roleFor,simulateGame} from './engine';
import {canPlayPosition} from './position-eligibility';
import {randomPlayerHands} from './handedness';
import {statKeys} from './types';
import {eventTrainingReward} from './event-system';
import {nationalRules,type NationalSelection} from './national-teams';
import {compactNationalTournament} from './national-storage';
import {refreshSeasonEvaluations} from './pro-season-evaluation';
import type {Game,GameState,Player,Position,RecordLine,Stats} from './types';

export type NationalAthlete={id:string;name:string;position:Position;stats:Stats;age:number;sourceId?:string;fatigue:number;lastPitched:string|null;records:RecordLine;injury?:Player['injury']};
export type NationalCountry={id:number;name:string;players:NationalAthlete[]};
export type NationalStage={id:string;name:string;groups:number[][];knockout?:boolean;byes?:number[]};
export type NationalTournament={version:1;strengthVersion?:2;lastDay?:string;countries:NationalCountry[];games:Game[];stages:NationalStage[];current:number;finished?:string;champion?:number;bronze?:number;returned?:string;rewarded?:boolean;prepared:string[];scenes:string[];rng?:number;progress?:GameState['matchProgress'];effect?:GameState['matchEffect'];awards?:{title:string;id:string;name:string;country:number;score:number;reason:string}[]};
const slots:Position[]=['SP','SP','SP','SP','SP','RP','RP','RP','RP','RP','RP','RP','RP','CP','CP','C','C','1B','2B','3B','SS','1B','2B','3B','LF','CF','RF','LF','RF','DH'];
const nations=['대한민국','일본','미국','대만','도미니카공화국','베네수엘라','멕시코','푸에르토리코','쿠바','호주','네덜란드','캐나다','파나마','이탈리아','콜롬비아','체코','니카라과','영국','브라질','중국'];
const surnames=['Smith','Garcia','Rodriguez','Martinez','Lopez','Brown','Wilson','Davis'];
// Game balance targets, anchored by country rather than drifting downward each
// time an old youth international reappears in a senior tournament.
const countryTools:Record<string,number>={'일본':80,'미국':82,'대만':74,'도미니카공화국':80,'베네수엘라':78,'멕시코':76,'푸에르토리코':75,'쿠바':73,'호주':67,'네덜란드':69,'캐나다':70};
export function nationalOpponentStats(name:string,position:Position,seed:number,youth:boolean):Stats{
  const pitching=['SP','RP','CP'].includes(position),base=youth?47:countryTools[name]??64;
  return Object.fromEntries(statKeys.map(key=>{
    const opposite=pitching?['contact','power','speed','defense'].includes(key):['velocity','control','movement'].includes(key);
    return [key,clamp((opposite?15:base)+(hash(`${seed}:${key}`)%13-6),1)];
  })) as Stats;
}
const athlete=(p:Player,position=p.position):NationalAthlete=>({id:p.id,name:p.name,position,stats:{...p.stats},age:p.age??18,sourceId:p.id,fatigue:p.fatigue,lastPitched:p.lastPitched,records:emptyRecord()});
// One stable draw per game: 20% a possible late close-game scene, otherwise
// uninterrupted play. A reload or another plate appearance
// must not reroll the decision or consume the match simulation's RNG.
export function nationalGameChoiceKind(s:Pick<GameState,'seed'|'playerId'>,game:Pick<Game,'id'>){
  const roll=hash(`${s.seed}:${s.playerId}:${game.id}:national-choice`)/4294967296;
  return roll<.2?'match':undefined;
}
export const nationalStageName=(game:Game)=>game.national?.stage??'';
export function nationalTable(t:NationalTournament,stage:NationalStage,group:number[]){
  const games=t.games.filter(g=>g.national?.stage===stage.id&&g.status==='completed'&&group.includes(g.homeTeamId)&&group.includes(g.awayTeamId));
  return group.map(id=>{let wins=0,losses=0,runs=0,allowed=0;for(const g of games){const side=g.homeTeamId===id?0:g.awayTeamId===id?1:-1;if(side<0)continue;const own=side===0?g.score[0]:g.score[1],against=side===0?g.score[1]:g.score[0];runs+=own;allowed+=against;if(own>against)wins++;else losses++;}return {id,wins,losses,runs,allowed};}).sort((a,b)=>b.wins-a.wins||a.losses-b.losses||headToHead(games,b.id,a.id)-headToHead(games,a.id,b.id)||(b.runs-b.allowed)-(a.runs-a.allowed)||b.runs-a.runs||a.id-b.id);
}
function headToHead(games:Game[],a:number,b:number){return games.filter(g=>[g.homeTeamId,g.awayTeamId].includes(a)&&[g.homeTeamId,g.awayTeamId].includes(b)&&g.advancingTeamId===a).length;}
function schedule(entry:NationalSelection,stage:NationalStage,date:string){
  const t=entry.tournament!;t.stages.push(stage);t.current=t.stages.length-1;
  stage.groups.forEach((group,gi)=>{if(stage.knockout){for(let i=0;i<group.length;i+=2)game(group[i],group[i+1],date,gi);return;}
    // Circle scheduling: every country plays at most once on a day.
    const ring=[...group];if(ring.length%2)ring.push(-1);
    for(let round=0;round<ring.length-1;round++){for(let i=0;i<ring.length/2;i++){const a=ring[i],b=ring[ring.length-1-i];if(a>=0&&b>=0)game(a,b,addDays(date,round),gi);}ring.splice(1,0,ring.pop()!);}
  });
  function game(a:number,b:number,d:string,group:number){t.games.push({id:`national:${entry.year}:${entry.kind}:${stage.id}:${a}:${b}`,date:d,homeTeamId:a,awayTeamId:b,competitionId:`national-${entry.kind}`,rulesetId:'national-v1',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{},national:{stage:stage.id,group,knockout:!!stage.knockout,youth:entry.kind==='youth'}});}
}
export function ensureNationalTournament(s:GameState,entry:NationalSelection){
  if(entry.tournament)return entry.tournament;
  if(!entry.simulationVersion&&entry.settled&&s.date>entry.end)return;
  // Settled saves from the former instant-result system remain historical.
  if(!entry.simulationVersion&&entry.settled&&entry.result&&!['participate','choice-1'].includes(entry.result))return;
  const count=entry.kind==='wbc'?20:entry.kind==='premier12'?12:entry.kind==='olympics'?6:entry.kind==='apbc'?4:12;
  const names=entry.kind==='apbc'?['대한민국','일본','대만','호주']:entry.kind==='olympics'?nations.slice(0,6):nations.slice(0,count);
  const countries:NationalCountry[]=names.map((name,id)=>({id,name,players:[]}));
  countries[0].players=entry.roster.filter(row=>row.id!==s.playerId||entry.participated!==false).flatMap(row=>{const p=s.players.find(p=>p.id===row.id);return p?[athlete(p,row.position)]:[];});
  if(entry.participated===false){const declined=entry.roster.find(row=>row.id===s.playerId);if(declined){const replacement=s.players.filter(p=>p.id!==s.playerId&&!countries[0].players.some(row=>row.id===p.id)&&p.position===declined.position&&available(p,s.date)&&(entry.kind==='youth'?!p.careerMode:p.careerMode==='pro'&&p.professional?.employment==='active')&&(!['apbc','olympics'].includes(entry.kind)||(p.age??19)<=25)).sort((a,b)=>b.stats.bq-a.stats.bq||a.id.localeCompare(b.id))[0];if(replacement)countries[0].players.push(athlete(replacement,declined.position));}}
  const templates=s.players.filter(p=>available(p,s.date));if(!templates.length)return;
  for(const country of countries.slice(1))country.players=slots.map((position,i)=>{
    const p=templates.find(p=>p.position===position)??templates[i%templates.length],row=athlete(p,position),seed=hash(`${s.seed}:${country.name}:${entry.year}:${i}`);
    row.id=`nt:${entry.year}:${entry.kind}:${country.id}:${i}`;row.name=country.name==='일본'?`${['Sato','Suzuki','Takahashi','Tanaka'][i%4]} ${['Haruto','Ren','Yuto','Kaito'][Math.floor(i/4)%4]}`:`${surnames[seed%surnames.length]} ${String.fromCharCode(65+i%26)}.`;
    row.age=entry.kind==='youth'?17:19+seed%7;delete row.sourceId;row.fatigue=0;row.lastPitched=null;
    row.stats=nationalOpponentStats(country.name,position,seed,entry.kind==='youth');
    return row;
  });
  entry.simulationVersion=1;entry.tournament={version:1,strengthVersion:2,countries,games:[],stages:[],current:0,prepared:[],scenes:[]};
  const ids=countries.map(c=>c.id),size=entry.kind==='wbc'?5:entry.kind==='premier12'?6:entry.kind==='olympics'?3:entry.kind==='apbc'?4:6;
  const groups=Array.from({length:count/size},(_,i)=>ids.filter((_,j)=>j%(count/size)===i));
  schedule(entry,{id:'opening',name:'조별리그',groups},addDays(entry.start,entry.kind==='wbc'?4:entry.kind==='premier12'?7:entry.kind==='olympics'?12:entry.kind==='apbc'?11:4));
  return entry.tournament;
}
function advanceRound(s:GameState,entry:NationalSelection){
  const t=entry.tournament!,stage=t.stages[t.current],games=t.games.filter(g=>g.national?.stage===stage.id);
  if(!games.length||games.some(g=>g.status!=='completed'))return;
  const date=addDays(games.map(g=>g.date).sort().at(-1)!,2),top=(n:number)=>stage.groups.map(group=>nationalTable(t,stage,group).slice(0,n).map(r=>r.id)),winners=()=>games.map(g=>g.advancingTeamId!);
  if(stage.id==='medals'||stage.id==='final'){
    t.champion=games[0].advancingTeamId;t.bronze=games[1]?.advancingTeamId;t.finished=s.date;finishNational(s,entry);return;
  }
  if(entry.kind==='wbc'){
    if(stage.id==='opening'){const rows=top(2),pairs=[[rows[0][0],rows[1][1],rows[1][0],rows[0][1]],[rows[2][0],rows[3][1],rows[3][0],rows[2][1]]];schedule(entry,{id:'quarter',name:'8강',groups:pairs,knockout:true},date);}
    else if(stage.id==='quarter')schedule(entry,{id:'semi',name:'준결승',groups:[winners()],knockout:true},date);
    else schedule(entry,{id:'final',name:'결승',groups:[winners()],knockout:true},date);
  }else if(entry.kind==='premier12'){
    if(stage.id==='opening'){
      // New tournaments: two opening groups, then their top two in one super round.
      // Keep an already drawn four-group save on its original path.
      if(stage.groups.length===2){schedule(entry,{id:'super',name:'슈퍼라운드',groups:[top(2).flat()]},date);return;}
      const r=top(2);schedule(entry,{id:'second',name:'2차 라운드',groups:[[...r[0],...r[1]],[...r[2],...r[3]]]},date);
      // Carry the opening head-to-head result into round two without another appearance.
      for(const g of t.games.filter(g=>g.national?.stage==='second')){const old=games.find(o=>[o.homeTeamId,o.awayTeamId].includes(g.homeTeamId)&&[o.homeTeamId,o.awayTeamId].includes(g.awayTeamId));if(old){g.status='completed';g.national!.carried=true;g.score=old.homeTeamId===g.homeTeamId?[...old.score]:[old.score[1],old.score[0]];g.advancingTeamId=old.advancingTeamId;}}
    }else if(stage.id==='second')schedule(entry,{id:'super',name:'슈퍼라운드',groups:[top(2).flat()]},date);
    else medals(top(4)[0]);
  }else if(entry.kind==='youth'){
    if(stage.id==='opening'){
      const r=top(3);schedule(entry,{id:'super',name:'슈퍼라운드',groups:[r.flat()]},date);
      for(const g of t.games.filter(g=>g.national?.stage==='super')){const old=games.find(o=>[o.homeTeamId,o.awayTeamId].includes(g.homeTeamId)&&[o.homeTeamId,o.awayTeamId].includes(g.awayTeamId));if(old){g.status='completed';g.national!.carried=true;g.score=old.homeTeamId===g.homeTeamId?[...old.score]:[old.score[1],old.score[0]];g.advancingTeamId=old.advancingTeamId;}}
    }else medals(top(4)[0]);
  }else if(entry.kind==='apbc')medals(top(4)[0]);
  else if(stage.id==='opening'){
    const r=top(3);t.stages[t.current].byes=[r[0][0],r[1][0]];
    schedule(entry,{id:'quarter',name:'준준결승',groups:[[r[0][1],r[1][2],r[1][1],r[0][2]]],knockout:true},date);
  }else if(stage.id==='quarter'){
    const byes=t.stages[0].byes!,w=winners();schedule(entry,{id:'semi',name:'준결승',groups:[[byes[0],w[1],byes[1],w[0]]],knockout:true},date);
  }else {const w=winners(),losers=games.map(g=>g.advancingTeamId===g.homeTeamId?g.awayTeamId:g.homeTeamId);medals([...w,...losers]);}
  function medals(ids:number[]){schedule(entry,{id:'medals',name:'메달 결정전',groups:[ids.slice(0,2),ids.slice(2,4)],knockout:true},date);}
}
const battingMerit=(r:RecordLine)=>r.batting.H+2*r.batting.HR+.6*r.batting.BB+.7*r.batting.RBI+.4*r.batting.R-.18*(r.batting.AB-r.batting.H);
const pitchingMerit=(r:RecordLine)=>r.pitching.outs*.45+r.pitching.SO*.5-r.pitching.ER*2-r.pitching.BB*.35-r.pitching.H*.25;
export function nationalCandidates(t:NationalTournament){
  const rows=t.countries.flatMap(c=>c.players.filter(p=>p.records.batting.PA||p.records.pitching.BF).map(p=>{
    const pitching=['SP','RP','CP'].includes(p.position),base=Math.max(0,pitching?pitchingMerit(p.records):battingMerit(p.records));
    const clutch=t.games.filter(g=>g.national?.knockout&&g.boxScore[p.id]).reduce((sum,g)=>sum+Math.max(0,pitching?pitchingMerit(g.boxScore[p.id]):battingMerit(g.boxScore[p.id])),0);
    return {p,country:c.id,pitching,base,clutch,score:0};
  }));
  for(const row of rows){const peers=rows.filter(r=>r.pitching===row.pitching),max=Math.max(1,...peers.map(r=>r.base)),clutchMax=Math.max(1,...peers.map(r=>r.clutch));
    const sample=row.pitching?Math.min(1,row.p.records.pitching.outs/(row.p.position==='SP'?9:3)):Math.min(1,row.p.records.batting.PA/10);
    row.score=sample*(70*row.base/max+20*row.clutch/clutchMax+(t.champion===row.country?10:0));
  }
  return rows.sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id));
}
function finishNational(s:GameState,entry:NationalSelection){
  const t=entry.tournament!;if(t.rewarded)return;t.rewarded=true;
  const ranked=nationalCandidates(t),awards:NonNullable<NationalTournament['awards']>=[];
  function award(title:string,row:typeof ranked[number]|undefined){if(!row)return;const r=row.p.records;awards.push({title,id:row.p.id,name:row.p.name,country:row.country,score:row.score,reason:row.pitching?`${Math.floor(r.pitching.outs/3)}.${r.pitching.outs%3}이닝 ${r.pitching.SO}탈삼진 ${r.pitching.ER}자책점`:`${r.batting.AB}타수 ${r.batting.H}안타 ${r.batting.HR}홈런 ${r.batting.RBI}타점`});}
  award('MVP',ranked[0]);award('최우수 투수',ranked.find(r=>r.pitching));award('최우수 타자',ranked.find(r=>!r.pitching));
  for(const pos of ['SP','RP','CP','C','1B','2B','3B','SS','LF','CF','RF','DH'])award(`베스트팀 ${pos}`,ranked.find(r=>r.p.position===pos));t.awards=awards;
  for(const member of t.countries[0].players){const p=s.players.find(p=>p.id===member.sourceId);if(!p)continue;const played=member.records.batting.PA>0||member.records.pitching.BF>0;if(!played)continue;
    const rule=nationalRules[entry.kind],mvp=awards[0]?.id===p.id,merit=ranked.find(r=>r.p.id===p.id)?.score??0,weeks=mvp?rule.advanced:rule.weeks*(.4+.6*Math.min(1,merit/60));
    const keys=['SP','RP','CP'].includes(member.position)?['velocity','control','movement'] as const:['contact','power','speed','defense'] as const;
    for(const key of keys)p.stats[key]=clamp(p.stats[key]+eventTrainingReward(p,key,weeks),1);
    p.stats.bq=clamp(p.stats.bq+eventTrainingReward(p,'bq',mvp?3:awards.some(a=>a.id===p.id)?2:1),1);
  }
  entry.result=`${t.countries[t.champion!]?.name??'미정'} 우승 · MVP ${awards[0]?.name??'없음'}`;
  if(entry.participated&&entry.roster.some(p=>p.id===s.playerId))s.careerEvent={id:`nt-result:${entry.year}:${entry.kind}`,definitionId:'NT-RESULT',rewardVersion:3,kind:'special',date:s.date,nationalContext:{kind:entry.kind,year:entry.year,phase:'result'},title:`${nationalRules[entry.kind].name} 대회 결산`,description:entry.result,choices:[{id:'remember',label:'대회 기록과 수상을 확인하고 복귀한다',outcomes:[{weight:100,message:'실제 경기 성적에 따른 경험과 수상이 커리어에 기록됐다.'}]}]};
  Object.assign(t,compactNationalTournament(t));
  refreshSeasonEvaluations(s,entry.year);
}
export function playNationalDay(s:GameState){
  if(s.careerEvent||s.careerNotice)return false;
  for(const entry of s.nationalTeams??[]){if(s.date<entry.start||entry.tournament?.finished)continue;const t=ensureNationalTournament(s,entry);if(!t)continue;
    if(t.lastDay!==s.date){const days=t.lastDay?Math.max(0,(Date.parse(s.date)-Date.parse(t.lastDay))/86400000):0;for(const c of t.countries.slice(1))for(const p of c.players)p.fatigue*=.85**days;t.lastDay=s.date;}
    if(entry.roster.some(p=>p.id===s.playerId)&&entry.participated===undefined)continue;
    for(const game of t.games.filter(g=>g.date<=s.date&&g.status!=='completed')){
      if(!playGame(s,entry,game))return true;
    }
    advanceRound(s,entry);if(s.careerEvent)return true;
    const latest=t.games.filter(g=>[g.homeTeamId,g.awayTeamId].includes(0)&&g.status==='completed').at(-1);
    const stage=t.stages[t.current],alive=stage.groups.some(g=>g.includes(0));
    if(!alive&&latest)t.returned??=addDays(latest.date,2);
  }return false;
}
function playGame(s:GameState,entry:NationalSelection,game:Game){
  const t=entry.tournament!,template=getPlayer(s),ids=[game.homeTeamId,game.awayTeamId];
  const rosters=ids.map((id,side)=>t.countries[id].players.map(row=>{const original=row.sourceId?s.players.find(p=>p.id===row.sourceId):undefined,p=structuredClone(original??template);if(!original){let handDraw=0;Object.assign(p,randomPlayerHands(row.position,()=>hash(`${s.seed}:${row.id}:national-hands:${handDraw++}`)/4294967296));}p.id=row.id;p.name=row.name;p.stats={...row.stats};if(id===0&&entry.kind!=='youth'&&t.strengthVersion===2)for(const key of statKeys)p.stats[key]=clamp(p.stats[key]*.98,1);p.age=row.age;p.position=row.position;p.primaryRole=roleFor(row.position);p.teamId=side;p.fatigue=original?.fatigue??row.fatigue;p.lastPitched=row.lastPitched;p.seasonStats=emptyRecord();p.recentAppearances=[];p.injury=original?.injury??row.injury??null;p.forcedRest=false;p.eligiblePositions=[row.position];if(original?.twoWay&&!(row.id===s.playerId&&entry.participationField))p.eligiblePositions=[...new Set([...p.eligiblePositions,original.twoWay.battingPosition,'SP','RP','CP','DH'] as Position[])];else delete p.twoWay;delete p.professional;delete p.careerMode;return p;}));
  if(!t.progress){game.proPreparedLineup=rosters.map(rows=>{
    const pitchers=rows.filter(p=>['선발','중간계투','마무리'].includes(pitchingRole(p))&&available(p,s.date)),starters=pitchers.filter(p=>pitchingRole(p)==='선발'),starter=starters.filter(p=>!p.lastPitched||addDays(p.lastPitched,4)<=game.date).sort((a,b)=>a.fatigue-b.fatigue||b.stats.control-a.stats.control)[0]??starters.sort((a,b)=>(a.lastPitched??'').localeCompare(b.lastPitched??''))[0];
    const used=new Set<string>(),field=(['C','SS','CF','2B','1B','3B','LF','RF','DH'] as Position[]).flatMap(pos=>{
      const eligible=rows.filter(p=>!used.has(p.id)&&(!['SP','RP','CP'].includes(p.position)||!!p.twoWay)&&available(p,s.date)&&canPlayPosition(p,pos)&&(!p.twoWay||pos==='DH'||p!==starter&&pitchingRole(p)==='선발'));
      const p=pos==='DH'&&starter?.twoWay?starter:eligible.filter(p=>pos==='DH'||p.position===pos||p.twoWay?.battingPosition===pos).sort((a,b)=>b.stats.contact-a.stats.contact)[0]??eligible.sort((a,b)=>b.stats.defense-a.stats.defense)[0];if(p)used.add(p.id);return p?[p.id]:[];
    });
    return {field,order:[...field],pitchers:pitchers.map(p=>p.id),starter:starter?.id??''};
  });}
  const sandbox:GameState={...s,players:rosters.flat(),teams:ids.map((id,i)=>({id:i,name:t.countries[id].name,shortName:t.countries[id].name,wins:0,losses:0,draws:0})),careerMode:undefined,proWorld:undefined,proEvents:undefined,nationalTeams:undefined,playerId:entry.participated?s.playerId:'national-observer',careerEvent:null,careerNotice:undefined,weekProgress:undefined,matchProgress:t.progress,matchEffect:t.effect,rngStates:{...s.rngStates,match:t.rng??hash(`${s.seed}:${game.id}`)}};
  const complete=simulateGame(sandbox,game,rosters);t.rng=sandbox.rngStates.match;t.progress=sandbox.matchProgress;t.effect=sandbox.matchEffect;
  for(const p of sandbox.players){const row=t.countries[ids[p.teamId]].players.find(row=>row.id===p.id)!;row.fatigue=p.fatigue;row.lastPitched=p.lastPitched;if(row.sourceId){const source=s.players.find(q=>q.id===row.sourceId);if(source){source.fatigue=p.fatigue;source.lastPitched=p.lastPitched;}}}
  if(!complete){s.careerEvent=sandbox.careerEvent;if(s.careerEvent)s.careerEvent.nationalContext={kind:entry.kind,year:entry.year,phase:'match',gameId:game.id};return false;}
  delete t.rng;delete t.progress;delete t.effect;
  if(game.status==='forfeit'){game.score=game.forfeitTeamId===game.homeTeamId?[0,9]:[9,0];game.status='completed';}
  game.advancingTeamId=game.score[0]>game.score[1]?game.homeTeamId:game.awayTeamId;
  for(const country of t.countries)for(const row of country.players){const record=game.boxScore[row.id];if(record){mergeRecord(row.records,record);
    // The offseason has no domestic daily player loop. Apply game exposure
    // here there, and for foreign opponents, using a stable per-game draw.
    if((!row.sourceId||s.phase==='ended')&&(record.batting.PA||record.pitching.BF)&&hash(s.seed+game.id+row.id+':injury')/4294967296<injuryRisk(row.fatigue,false)){
      const severity='mild',penalty=params['injury.mild.penalty'];row.injury={severity,startDate:s.date,unavailableUntil:addDays(s.date,5),originalPenalty:penalty,penaltyRemaining:penalty,penaltyRecoverDays:params['injury.mild.recovery_days']};
      const source=s.players.find(p=>p.id===row.sourceId);if(source&&!source.injury)source.injury={...row.injury};
    }
  }}
  return true;
}
export function openNationalMatchChoice(s:GameState,game:Game,batter:Player,pitcher:Player){
  if(!game.national||game.national.eventOpened||nationalGameChoiceKind(s,game)!=='match'||s.matchProgress!.inning<7||Math.abs(game.score[0]-game.score[1])>2||![batter.id,pitcher.id].includes(s.playerId))return false;
  game.national.eventOpened=true;const batting=batter.id===s.playerId,m=s.matchProgress!;
  s.careerEvent={id:`${game.id}:clutch`,definitionId:'NT-CLUTCH',rewardVersion:3,kind:'game',date:s.date,title:batting?'국제무대의 승부처 타석':'국제무대의 실점 위기',description:`${m.inning}회 ${m.outs}아웃 · ${game.score[0]}:${game.score[1]}. ${batting?'출루와 장타 중 무엇에 집중할까?':'타자와 어떻게 승부할까?'}`,choices:batting?[{id:'patient',label:'출루에 집중한다',outcomes:[{weight:100,message:'공을 끝까지 보며 출루를 노린다.',match:{bb:.015,hr:-.01}}]},{id:'power',label:'장타를 노린다',outcomes:[{weight:100,message:'강한 스윙으로 승부한다.',match:{hr:.015,k:.01}}]}]:[{id:'attack',label:'적극적으로 정면 승부한다',outcomes:[{weight:100,message:'삼진을 노리고 힘 있게 승부한다.',match:{k:.015,hit:.008}}]},{id:'careful',label:'유인구로 신중하게 승부한다',outcomes:[{weight:100,message:'위험한 코스를 피한다.',match:{hit:-.008,bb:.015}}]}]};return true;
}
export function resolveNationalContext(s:GameState,event:NonNullable<GameState['careerEvent']>,outcome:{match?:import('./types').MatchEffect},choice:string){
  const ctx=event.nationalContext;if(!ctx)return;const entry=s.nationalTeams?.find(e=>e.kind===ctx.kind&&e.year===ctx.year),t=entry?.tournament;if(!t)return;
  if(ctx.phase==='match'&&outcome.match&&t.progress){const m=t.progress;t.effect={...outcome.match,gameId:ctx.gameId!,batterId:m.sides[m.battingSide].order[m.battingIndex[m.battingSide]%9],pitcherId:m.pitchers[1-m.battingSide]};}
  if(ctx.phase==='preparation'&&choice==='analyze'){const row=t.countries[0].players.find(p=>p.id===s.playerId);if(row)row.stats.bq=clamp(row.stats.bq+.5,1);}
  if(ctx.phase==='result')t.returned=addDays(s.date,1);
}
export function validNationalTournament(t:NationalTournament){
  if(t.version!==1||!Array.isArray(t.countries)||t.countries.length<4||t.countries.length>20||!Array.isArray(t.games)||t.games.length>200||!Array.isArray(t.stages)||!t.stages[t.current]||!Array.isArray(t.prepared))return false;
  const ids=new Set<string>();
  for(const [index,c] of t.countries.entries()){
    if(c.id!==index||typeof c.name!=='string'||!Array.isArray(c.players)||c.players.length>30)return false;
    for(const p of c.players){if(ids.has(p.id)||typeof p.id!=='string'||!slots.includes(p.position)||!statKeys.every(k=>Number.isFinite(p.stats?.[k]))||!Number.isFinite(p.fatigue)||!p.records?.batting||!p.records?.pitching)return false;ids.add(p.id);}
  }
  if(new Set(t.games.map(g=>g.id)).size!==t.games.length)return false;
  for(const g of t.games)if(!t.countries[g.homeTeamId]||!t.countries[g.awayTeamId]||g.homeTeamId===g.awayTeamId||!g.national||!t.stages.some(stage=>stage.id===g.national!.stage)||!Array.isArray(g.score)||g.score.length!==2||g.score.some(n=>!Number.isFinite(n)||n<0)||Object.keys(g.boxScore).some(id=>!ids.has(id)))return false;
  if(t.progress&&(!t.games.some(g=>g.id===t.progress!.gameId&&g.status==='inProgress')||t.progress.sides.some(side=>[...side.field,...side.order,...side.pitchers,side.starter].some(id=>!ids.has(id)))))return false;
  return t.champion===undefined||!!t.countries[t.champion];
}
export const pendingNationalOffseason=(s:GameState)=>s.nationalTeams?.find(e=>e.year===s.calendar.seasonYear&&['premier12','apbc'].includes(e.kind)&&!e.tournament?.finished&&(e.simulationVersion===1||!e.settled||!e.result||['participate','choice-1'].includes(e.result)));
export function nationalOffseasonActionLabel(s:GameState){
  const entry=pendingNationalOffseason(s);if(!entry)return;
  const name=nationalRules[entry.kind].name.replace(' 국가대표',''),selected=entry.roster.some(row=>row.id===s.playerId),started=!!entry.tournament?.games.some(game=>game.status!=='scheduled');
  return {name,label:`${name} ${selected&&entry.participated!==false?started?'이어서 진행':'참가':'결과 확인'} →`};
}
export function advanceNationalOffseason(s:GameState){
  const entry=pendingNationalOffseason(s);
  if(!entry)return false;
  if(entry.roster.some(p=>p.id===s.playerId)&&entry.participated===undefined)return false;
  s.date=[s.date,entry.start].sort().at(-1)!;
  for(let i=0;i<40;i++){if(playNationalDay(s))return true;if(entry.tournament?.finished)return true;s.date=addDays(s.date,1);}return true;
}
