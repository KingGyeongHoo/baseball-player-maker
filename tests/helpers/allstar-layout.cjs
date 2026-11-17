const e=require('../../.test-build/lib/sim/engine.js');
const pc=require('../../.test-build/lib/sim/pro-career.js');
const a=require('../../.test-build/lib/sim/pro-allstar.js');
module.exports=function fixture(finalized=true,played=true){
  const s=pc.acknowledgeCareer(pc.createProfessionalDemo('allstar-layout','올스타검증','SP')),base=structuredClone(e.getPlayer(s)),year=s.calendar.seasonYear;
  s.date=`${year}-07-20`;s.careerNotice=undefined;s.noticeQueue=[];s.careerEvent=null;delete s.weekProgress;delete s.matchProgress;
  const game=structuredClone(s.calendar.events[0]);s.calendar.events=[];s.players=[];
  const season=a.allstarSeasonView(s);season.skipped=false;if(finalized)season.finalizedAt=`${year}-06-30`;
  for(const [levelIndex,level]of ['first','second'].entries()){
    const entry=season.levels[level];
    for(const [sideIndex,side]of ['blue','white'].entries()){
      const club=sideIndex===0?1:0;
      const candidates=Array.from({length:3},(_,i)=>{
        const p=structuredClone(base);p.id=`qa-${level}-${side}-${i}`;p.name=`${level==='first'?'일군':'이군'}${side==='blue'?'청':'백'}${i+1}`;p.teamId=club+levelIndex*10;p.professional.firstClub=club;p.professional.contract.club=club;
        s.players.push(p);return {playerId:p.id,name:p.name,club,slot:'SP',votes:3000-i*500,nominated:true};
      });
      entry[side].ballots.SP=candidates;
      if(finalized)entry[side].roster=candidates.slice(0,sideIndex===0?2:3).map((r,i)=>({...r,method:i?'manager':'vote'}));
    }
    if(played){
      const winner=entry.white.roster[0];
      entry.game={...structuredClone(game),id:`qa-game-${level}`,status:'completed',score:levelIndex?[4,2]:[1,3],boxScore:{[winner.playerId]:e.emptyRecord()}};
      entry.game.boxScore[winner.playerId].pitching={BF:6,outs:6,H:0,BB:0,SO:4,HR:0,R:0,ER:0};
      entry.mvp={playerId:winner.playerId,name:winner.name,side:'white',merit:10};
    }
  }
  s.playerId=s.players[0].id;s.proWorld.allstar=season;return s;
};
