import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url),e=require('../.test-build/lib/sim/engine.js');
const a=require('../.test-build/lib/sim/player-evaluation.js'),m=require('../.test-build/lib/sim/evaluation-metrics.js'),r=require('../.test-build/lib/sim/evaluation-reference.js'),l=require('../.test-build/lib/sim/evaluation-lifecycle.js');
const creation=require('../.test-build/lib/player-creation.js');
const pro=creation.createRandomProCareer('Validation','SS',21,{randomUUID:()=> 'scouting-validation-reference',getRandomValues:a=>{a[0]=0;return a;}}),reference=r.evaluationReference(pro),p=e.getPlayer(pro),before=JSON.stringify(pro.rngStates);
function rng(seed){let state=e.hash(seed);return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function sample(count,expected,random){const record=e.emptyRecord(),b=record.batting;b.PA=count;for(let i=0;i<count;i++){let draw=random();if(draw<expected.bb){b.BB++;continue;}draw-=expected.bb;b.AB++;if(draw<expected.single){b.H++;continue;}draw-=expected.single;if(draw<expected.double){b.H++;b['2B']++;continue;}draw-=expected.double;if(draw<expected.triple){b.H++;b['3B']++;continue;}draw-=expected.triple;if(draw<expected.hr){b.H++;b.HR++;continue;}draw-=expected.hr;if(draw<expected.k)b.SO++;}return record;}
const baseline={...p,stats:Object.fromEntries(Object.entries(p.stats).map(([k])=>[k,reference.tools[k].mean]))},average=r.standardMatchup(baseline,reference),league=sample(100000,average,rng('league'));
const variants={raw:null,light:{events:50,hits:90,extraBases:150},initial:{events:100,hits:180,extraBases:300},strong:{events:200,hits:360,extraBases:600}};
const errors={development:{},holdout:{}};
for(const split of Object.keys(errors))for(const key of Object.keys(variants))errors[split][key]={squaredError:0,cases:0};
for(let seed=0;seed<48;seed++){
  const own=structuredClone(p),random=rng(`ability:${seed}`);for(const k of Object.keys(own.stats))own.stats[k]=45+random()*40;
  const expected=r.standardMatchup(own,reference),future=sample(1000,expected,rng(`future:${seed}`)),target=e.ops(future),split=seed<32?'development':'holdout';
  for(const count of [10,30,100,300]){const observed=sample(count,expected,rng(`observed:${seed}:${count}`));for(const [key,prior] of Object.entries(variants)){const estimate=prior?m.performanceEvidence(observed,league,'batting',false,false,prior).adjusted.ops:e.ops(observed);if(estimate!==null){errors[split][key].squaredError+=(estimate-target)**2;errors[split][key].cases++;}}}
}
for(const split of Object.values(errors))for(const value of Object.values(split))value.mse=value.squaredError/value.cases;
const best=Object.entries(errors.development).filter(([k])=>k!=='raw').sort((a,b)=>a[1].mse-b[1].mse)[0][0];
const exact=r.standardMatchup(p,reference),large=sample(200000,exact,rng('conditional-check')),observed=m.evaluationRates(large,'batting');
for(const [key,value] of [['bb',exact.bb],['k',exact.k],['hr',exact.hr]])assert.ok(Math.abs(observed[key]-value)<.005);
const school=e.createGame('scouting-validation-school','Validation','SS'),draftBefore=e.draftForecast(school).map(p=>({id:p.playerId,score:p.score,club:p.club}));l.capturePlayerEvaluations(school,'monthly');const draftAfter=e.draftForecast(school).map(p=>({id:p.playerId,score:p.score,club:p.club}));assert.deepEqual(draftAfter,draftBefore);
const shadowContext=a.buildEvaluationContext(pro),shadow=pro.players.map(player=>{const contextReport=a.createPlayerEvaluation(pro,player,shadowContext);return {legacy:contextReport.comparison.legacyRegistration,candidate:contextReport.comparison.candidateRegistration};});
assert.equal(JSON.stringify(pro.rngStates),before);
const activeVariant=Object.entries(variants).find(([,v])=>JSON.stringify(v)===JSON.stringify(m.evaluationPriors.pro))[0];
const result={activeVariant,activePriors:m.evaluationPriors.pro,activeHoldoutImprovement:1-errors.holdout[activeVariant].mse/errors.holdout.raw.mse,model:r.EVALUATION_MODEL,generatedAt:new Date().toISOString(),scope:'Fixed first-team opponent model experiments; not a longitudinal validation of promotion, contracts or pro success.',priors:variants,errors,developmentBest:best,initialHoldoutImprovement:1-errors.holdout.initial.mse/errors.holdout.raw.mse,conditionalProbabilities:{expected:exact,observed:{bb:observed.bb,k:observed.k,hr:observed.hr,ops:observed.ops},plateAppearances:200000},preserved:{randomStreams:true,draftTop10:true,developmentalRules:true,nationalTeamRules:true},decisionMode:'comparison-only',registrationComparison:{players:shadow.length,meanDifference:shadow.reduce((n,v)=>n+(v.candidate-v.legacy),0)/shadow.length},limits:['Priors remain provisional game parameters; no claim of real league calibration.','No second-team-to-first-team multiplication or fake defensive/medical measurements.','Registration and contract formulas are intentionally not switched before longitudinal validation.']};
writeFileSync('validation/player-evaluation-v1.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({developmentBest:best,holdout:errors.holdout,conditionalCheck:true,draftPreserved:true,decisionMode:result.decisionMode}));
