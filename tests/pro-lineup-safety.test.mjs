import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const pc=require('../.test-build/lib/sim/pro-career.js');
const world=require('../.test-build/lib/sim/pro-world.js');

test('an evaluation DH cannot turn an incomplete field into a nine-slot lineup with holes',()=>{
 const s=pc.acknowledgeCareer(pc.createProfessionalDemo('short-evaluation-lineup','평가선수','DH'));
 const base=e.getPlayer(s),positions=['C','SS','CF','2B','1B','3B','DH','DH','SP'];
 const roster=positions.map((position,i)=>{const p=structuredClone(base);p.id=`short-${i}`;p.position=position;p.primaryRole=e.roleFor(position);p.eligiblePositions=[position];p.teamId=10;p.fatigue=0;p.forcedRest=false;p.injury=null;p.trainingPolicy=e.defaultPolicy(p.primaryRole);return p;});
 const dh=roster.filter(p=>p.position==='DH').at(-1),result=world.professionalLineup(s,roster,s.date,[dh.id]);
 const opponent=roster.map(p=>({...structuredClone(p),id:`opponent-${p.id}`,teamId:11}));
 for(const position of ['LF','RF'])opponent.push({...structuredClone(opponent[0]),id:`opponent-${position}`,position,primaryRole:e.roleFor(position),eligiblePositions:[position]});
 s.players=[...roster,...opponent];s.playerId=dh.id;s.careerNotice=null;s.careerEvent=null;delete s.matchProgress;
 const game={id:'short-roster-game',date:s.date,homeTeamId:10,awayTeamId:11,competitionId:'pro-second',round:1,rulesetId:'test',status:'scheduled',score:[0,0],innings:[[],[]],lineup:[],boxScore:{},evaluationPlayers:[dh.id]};
 assert.doesNotThrow(()=>e.simulateGame(s,game,[roster,opponent]));
 assert.equal(game.status,'forfeit');
 assert.equal(result.field.length,7);
 assert.ok(Array.from(result.field).every(Boolean));
 assert.ok(Array.from(result.order).every(Boolean));
});
