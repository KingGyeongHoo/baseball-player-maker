import {proSquad} from "./pro-squads";
import {addDays,available,getPlayer,isPitcher,ovr,params,random,roleFor,roleScore,ticketsUsed} from "./engine";
import {professionalLineup} from "./pro-world";
import {createProEvent,proMainField,proEventCatalog} from "./pro-event-catalog";
import {eligibleStory} from "./event-stories";
import {cancelProReservation,ensureProEvents,equivalentProId,proChannelFree,proDayFree,proEventsEnabled,proIdFree,recordProChoice} from "./pro-event-ledger";
import {proFieldTarget,recentProEvidence} from "./pro-event-evidence";
import type {ProEventContext} from "./pro-event-types";
import type {EventScene,Game,GameState,Player,Position} from "./types";

const onceIds=new Set(["PE08","PE09","PE10","PE11","PE28","PE29","PE30"]);
function context(s:GameState,id:string,date:string,extra:Partial<ProEventContext>={}):ProEventContext {const p=getPlayer(s);return {version:1,catalogId:id,channel:"general",year:s.calendar.seasonYear,playerId:p.id,teamId:p.teamId,level:proSquad(p.teamId)??"third",field:proMainField(s),openedAt:date,...extra};}
const active=(p:Player)=>p.professional?.employment==="active"&&p.teamId>=0;
function once(s:GameState,id:string){return !ensureProEvents(s).history.some(row=>row.season===s.calendar.seasonYear&&equivalentProId(row,id));}
export function proGeneralCandidates(s:GameState,date=s.date){
  const p=getPlayer(s),pool:{id:string;context:ProEventContext}[]=[];if(!active(p)||s.phase==="ended")return pool;
  const pro=p.professional!,ledger=ensureProEvents(s),healthy=available(p,date),injured=!!p.injury&&date<p.injury.unavailableUntil;
  const training=healthy&&s.calendar.trainingDays.includes(date)&&ticketsUsed(p.trainingPolicy)>0;
  const pitching=isPitcher(p.primaryRole),batting=(!pitching||!!p.twoWay)&&["contact","power","speed","defense"].some(key=>p.trainingPolicy.tickets[key as "contact"]>0),throwing=(pitching||!!p.twoWay)&&["velocity","control","movement"].some(key=>p.trainingPolicy.tickets[key as "velocity"]>0);
  const evidence=recentProEvidence(s,p,date),stats=evidence.records,ownGames=s.calendar.events.filter(g=>g.date===date&&[g.homeTeamId,g.awayTeamId].includes(p.teamId));
  const teammate=s.players.filter(q=>q.id!==p.id&&active(q)&&q.teamId%10===p.teamId%10).sort((a,b)=>a.id.localeCompare(b.id))[0];
  const recent=ledger.history.filter(row=>row.channel==="general").slice(-3);
  const add=(id:string,extra:Partial<ProEventContext>={})=>{if(recent.some(row=>equivalentProId(row,id))||!proIdFree(s,id,"general",date)||onceIds.has(id)&&!once(s,id))return;pool.push({id,context:context(s,id,date,extra)});};
  if(injured){const injuryKey=`${p.id}:${p.injury!.startDate}`;if(p.injury!.unavailableUntil<=addDays(date,7)&&!ledger.history.some(row=>row.injuryKey===injuryKey))add("PE18",{injuryKey});return pool;}
  if(!ownGames.length&&(!s.calendar.trainingDays.includes(date)||!ticketsUsed(p.trainingPolicy))&&teammate)add("PE19",{partnerId:teammate.id});
  if(p.forcedRest)return pool;
  for(const definition of proEventCatalog){
    if(!definition.rule)continue;
    const story=eligibleStory(s,definition.id,definition.rule,date);
    if(story)add(definition.id,{story,...(definition.rule.field?{field:definition.rule.field}:{})});
  }
  if(training){
    if(batting)add("PE01",{field:"batting"});if(throwing)add("PE02",{field:"pitching"});
    const season=p.seasonByLevel?.[p.teamId<10?"first":"second"];
    if((pitching?(season?.pitching.BF??0)>=30:(season?.batting.PA??0)>=20))add("PE03");
    if(batting&&p.fatigue<50)add("PE04",{field:"batting"});if(throwing)add("PE05",{field:"pitching"});
    if(p.trainingPolicy.tickets.defense>0&&p.eligiblePositions.some(pos=>!["SP","RP","CP","DH"].includes(pos)))add("PE06",{field:"batting"});
    if(batting&&p.fatigue<60)add("PE07",{field:"batting"});if(s.proWorld?.stage==="camp"&&p.fatigue<50)add("PE08");
    if(p.twoWay&&p.fatigue<60)add("PE14");
    if(s.proWorld?.stage==="regular"&&p.fatigue>=20&&s.calendar.events.filter(g=>g.status==="scheduled"&&g.awayTeamId===p.teamId&&g.date>=date&&g.date<=addDays(date,6)).length>=2)add("PE15");
    const sample=pitching?stats.pitching.BF>=30:stats.batting.PA>=20;
    if(sample&&p.recentZ>=.3&&p.fatigue>=40&&p.fatigue<80)add("PE16");
    if(s.proWorld?.stage==="regular"&&sample&&p.recentZ<=-.3){add("PE17");const index=pool.findIndex(c=>c.id==="PE03");if(index>=0)pool.splice(index,1);}
    if((p.age??19)>=33){if(p.fatigue<60)add("PE28");const rookie=s.players.filter(q=>q.id!==p.id&&active(q)&&q.teamId%10===p.teamId%10&&s.calendar.seasonYear-q.professional!.rookieYear<=1&&isPitcher(q.primaryRole)===pitching).sort((a,b)=>a.id.localeCompare(b.id))[0];if(rookie)add("PE30",{partnerId:rookie.id});}
  }
  const requestFree=(!pro.requestAfter||date>=pro.requestAfter)&&!pro.roleTrial&&!p.roleOffer&&(!pro.twoWayReview?.nextProposalDate||!p.twoWay);
  if(healthy&&requestFree&&!p.twoWay){
    const regular=p.proContract?.status!=="developmental",stage=s.proWorld?.stage;
    let veteranRole=false;
    if((p.age??19)>=33&&regular&&["camp","regular"].includes(stage??"")){
      const target:Position|undefined=p.position==="SP"?"RP":!pitching&&p.position!=="DH"?"DH":undefined;
      const sparse=stage==="regular"?evidence.tracked&&evidence.teamGames>=5&&(pitching?stats.pitching.BF<=10:stats.batting.PA<=8):s.players.some(q=>q.id!==p.id&&active(q)&&q.teamId%10===p.teamId%10&&q.primaryRole===p.primaryRole&&roleScore(q)>roleScore(p));
      if(target&&sparse&&ovr(p,pitching)>=45&&roleScore(p,roleFor(target))>=45){veteranRole=true;add("PE29",{target});}
    }
    if(!veteranRole){
      if(stage==="camp"&&!pitching&&ovr(p,false)>=45){const target=proFieldTarget(s,p);if(target)add("PE09",{target});}
      if(regular&&p.position==="SP"&&["camp","regular"].includes(stage??"")&&evidence.tracked&&evidence.startsKnown&&evidence.starts===0&&ovr(p,true)>=45&&roleScore(p,roleFor("RP"))>=45)add("PE10",{target:"RP"});
      if(regular&&p.teamId<10&&!pitching&&p.position!=="DH"&&evidence.tracked&&stats.batting.PA<=8&&evidence.teamGames>=5&&ovr(p,false)>=45&&roleScore(p,roleFor("DH"))>=45)add("PE11",{target:"DH"});
    }
  }
  if(healthy&&p.teamId>=10&&(!pro.requestAfter||date>=pro.requestAfter)&&(!pro.requestedEvaluationUntil||date>pro.requestedEvaluationUntil)&&evidence.tracked&&!stats.batting.PA&&!stats.pitching.BF&&ledger.history.filter(row=>row.season===s.calendar.seasonYear&&equivalentProId(row,"PE12")).length<2)add("PE12");
  return pool;
}
export function planProEventWeek(s:GameState){
  if(!proEventsEnabled(s)||!active(getPlayer(s)))return;const ledger=ensureProEvents(s);if(ledger.plannedWeek===s.week)return;ledger.plannedWeek=s.week;delete ledger.reservation;
  if(params["pro_events.general_chance"]<=0)return;
  const options=Array.from({length:7},(_,day)=>{const date=addDays(s.date,day);return proChannelFree(s,"general",date)?proGeneralCandidates(s,date).map(c=>({...c,date})):[];}).flat();
  let ids=[...new Set(options.map(c=>c.id))];const stages=ids.filter(id=>onceIds.has(id)||id==="PE18");if(stages.length)ids=stages;if(!ids.length||random(s,"events")>=params["pro_events.general_chance"])return;
  const continuations=ids.filter(id=>options.some(c=>c.id===id&&c.context.story?.sourceId));
  if(continuations.length&&random(s,"events")<.5)ids=continuations;
  const id=ids[Math.floor(random(s,"events")*ids.length)],dates=options.filter(c=>c.id===id),chosen=dates[Math.floor(random(s,"events")*dates.length)];ledger.reservation={week:s.week,date:chosen.date,id,context:chosen.context};
}
export function openProGeneralEvent(s:GameState){
  if(!proEventsEnabled(s)||s.careerEvent||s.careerNotice)return false;const reservation=ensureProEvents(s).reservation;if(!reservation||reservation.date!==s.date)return false;
  const candidate=proGeneralCandidates(s).find(c=>c.id===reservation.id&&c.context.target===reservation.context.target&&c.context.partnerId===reservation.context.partnerId&&c.context.injuryKey===reservation.context.injuryKey);
  if(!candidate||candidate.context.story?.sourceId!==reservation.context.story?.sourceId||getPlayer(s).teamId!==reservation.context.teamId||!proChannelFree(s,"general")){cancelProReservation(s,"발생 시점의 소속·몸 상태·자격 또는 선택 간격이 바뀌었습니다.");return false;}
  const event=createProEvent(s,reservation.id,{...reservation.context,openedAt:s.date});delete s.proEvents!.reservation;s.careerEvent=event;recordProChoice(s,event);return true;
}
function debuted(s:GameState){const p=getPlayer(s);return !!p.professional?.firsts.debut||!!p.seasonByLevel?.first.batting.PA||!!p.seasonByLevel?.first.pitching.BF||!!p.seasonPostseason?.batting.PA||!!p.seasonPostseason?.pitching.BF||p.career.some(row=>row.careerMode==="pro"&&((row.byLevel?.first.batting.PA??0)+(row.byLevel?.first.pitching.BF??0)+(row.postseason?.batting.PA??0)+(row.postseason?.pitching.BF??0)>0));}
function majorSeen(s:GameState,id:string,seriesId?:string){const ledger=ensureProEvents(s);return ledger.history.some(row=>equivalentProId(row,id)&&(id==="PE13"||row.seriesId===seriesId||row.catalogId==="PRO11"&&row.season===s.calendar.seasonYear))||ledger.cancellations.some(row=>row.id===`${id}:${seriesId??"career"}`);}
function preparationOptions(s:GameState,game:Game,sides:{field:string[];starter:string}[]){
  const p=getPlayer(s),options:{id:string;context:ProEventContext}[]=[];if(!active(p)||!available(p,s.date)||![game.homeTeamId,game.awayTeamId].includes(p.teamId))return options;
  const side=game.homeTeamId===p.teamId?0:1,playing=sides[side].field.includes(p.id)||sides[side].starter===p.id;
  if(p.teamId<10&&p.proContract?.status!=="developmental"&&playing&&!debuted(s)&&!majorSeen(s,"PE13"))options.push({id:"PE13",context:context(s,"PE13",s.date,{channel:"major",gameId:game.id,field:sides[side].starter===p.id?"pitching":"batting"})});
  const series=s.proWorld?.postseason?.series.find(row=>game.competitionId===`pro-playoffs-${row.id}`);
  if(series&&series.rosters[String(p.teamId)]?.includes(p.id)){
    const slot=series.clubs.indexOf(p.teamId),extra={channel:"major" as const,seriesId:series.id,gameId:game.id};
    if(slot>=0&&series.wins[1-slot]===series.target-1&&!majorSeen(s,"PE26",series.id))options.push({id:"PE26",context:context(s,"PE26",s.date,extra)});
    if(game.round===1&&!majorSeen(s,"PE25",series.id))options.push({id:"PE25",context:context(s,"PE25",s.date,extra)});
  }return options;
}
export function proMajorDueToday(s:GameState){
  if(!proEventsEnabled(s)||!proDayFree(s))return false;
  const mine=getPlayer(s);return s.calendar.events.filter(g=>g.date===s.date&&g.status==="scheduled"&&[g.homeTeamId,g.awayTeamId].includes(mine.teamId)).some(game=>{const series=s.proWorld?.postseason?.series.find(row=>game.competitionId===`pro-playoffs-${row.id}`);const sides=[game.homeTeamId,game.awayTeamId].map(team=>professionalLineup(s,s.players.filter(p=>p.teamId===team&&(!series||series.rosters[String(team)]?.includes(p.id))),s.date,game.evaluationPlayers));return sides.every(side=>side.field.length===9&&side.starter)&&preparationOptions(s,game,sides.map(side=>({field:side.field.map(p=>p.id),starter:side.starter!.id}))).length>0;});
}
export function openProPreparation(s:GameState,game:Game,sides:{field:string[];starter:string}[]){
  if(!proEventsEnabled(s)||!s.weekProgress||s.careerEvent||s.careerNotice||!proDayFree(s))return false;
  const options=preparationOptions(s,game,sides),chosen=options[0];if(!chosen)return false;
  for(const other of options.slice(1))ensureProEvents(s).cancellations.push({id:`${other.id}:${other.context.seriesId??"career"}`,date:s.date,reason:"당일 우선하는 주요 일정 선택을 먼저 처리했습니다."});
  s.careerEvent=createProEvent(s,chosen.id,chosen.context);recordProChoice(s,s.careerEvent);return true;
}
export function openProMatchEvent(s:GameState,scene:EventScene,batter:Player,pitcher:Player){
  if(!proEventsEnabled(s)||!s.weekProgress||s.careerEvent||s.careerNotice)return false;const p=getPlayer(s),ledger=ensureProEvents(s);
  const cursor=s.matchProgress;if(!cursor||!cursor.ready||cursor.gameId!==scene.gameId||cursor.inning!==scene.inning||cursor.battingSide!==scene.battingSide||cursor.pitchers[1-scene.battingSide]!==pitcher.id||cursor.sides[scene.battingSide].order[cursor.battingIndex[scene.battingSide]%9]!==batter.id)return false;
  if(!active(p)||!available(p,s.date))return false;
  if(scene.batting?batter.id!==p.id:pitcher.id!==p.id)return false;
  if(p.teamId<10&&p.proContract?.status!=="developmental"&&!debuted(s)&&!majorSeen(s,"PE13")&&proDayFree(s)){
    s.careerEvent=createProEvent(s,"PE13",context(s,"PE13",s.date,{channel:"major",gameId:scene.gameId,field:scene.batting?"batting":"pitching"}));s.careerEvent.scene=scene;recordProChoice(s,s.careerEvent);return true;
  }
  if(ledger.attemptedGames.includes(scene.gameId)||!proChannelFree(s,"game"))return false;
  const loaded=scene.bases.every(Boolean),lead=scene.score[scene.batting?scene.battingSide:1-scene.battingSide]-scene.score[scene.batting?1-scene.battingSide:scene.battingSide];
  const ids=scene.batting?[...(scene.inning>=7&&lead<=-1&&lead>=-3&&scene.bases.some(Boolean)?["PE21"]:[]),...(pitcher.stats.velocity>=batter.stats.contact+5?["PE20"]:[])]:[...(loaded&&[1,2].includes(scene.outs)?["PE22"]:[]),...(scene.inning>=6&&p.fatigue>=60&&p.fatigue<80?["PE24"]:[]),...(scene.inning>=7&&lead===1&&!loaded?["PE23"]:[])];
  const id=ids.find(id=>proIdFree(s,id,"game"));if(!id)return false;ledger.attemptedGames.push(scene.gameId);
  if(random(s,"events")>=params["pro_events.game_chance"])return false;
  s.careerEvent=createProEvent(s,id,context(s,id,s.date,{channel:"game",gameId:scene.gameId,field:scene.batting?"batting":"pitching"}));s.careerEvent.scene=scene;recordProChoice(s,s.careerEvent);return true;
}
