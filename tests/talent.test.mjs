import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const e=require('../.test-build/lib/sim/engine.js');
const {talentMultiplier}=require('../.test-build/lib/sim/talent.js');
const {eventTrainingReward}=require('../.test-build/lib/sim/event-system.js');
const {draftAssessment}=require('../.test-build/lib/sim/draft.js');
const {encodeCareerSave,decodeCareerSave}=require('../.test-build/lib/career-save.js');
const Talents=require('../.test-build/app/components/player-talents.js').default;
const Editor=require('../.test-build/app/components/training-editor.js').default;
const Records=require('../.test-build/app/components/season-records.js').default;
const base=e.createGame('talent-zero','재능검증','SS');
const player=()=>{const p=structuredClone(e.getPlayer(base));p.bats='R';for(const k of Object.keys(p.stats))p.stats[k]=40;p.talentExposure={batting:10,pitching:10};return p;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('talents 0 through 10 grow linearly from 1x to 2x in normal and event training',()=>{
  for(let value=0;value<=10;value++){
    close(talentMultiplier(value),1+value/10);
    const p=player(),control=player();p.talent={batting:value,pitching:value};control.talent={batting:0,pitching:0};
    for(const q of [p,control]){for(const key of Object.keys(q.trainingPolicy.tickets))q.trainingPolicy.tickets[key]=0;q.trainingPolicy.tickets.physical=1;}
    close(eventTrainingReward(p,'contact',3),eventTrainingReward(control,'contact',3)*(1+value/10));
    e.train(p,5);e.train(control,5);for(const key of ['contact','power','speed','defense','velocity','control','movement'])close(p.stats[key]-40,(control.stats[key]-40)*(1+value/10));
    close(p.stats.stamina,control.stats.stamina);close(p.stats.bq,control.stats.bq);
  }
});
test('10-week bands use all five requested colors, with hidden values protected and numeric labels at 30 weeks',()=>{
  const p=player();
  for(const [value,label,tone] of [[0,'없음','none'],[1,'낮음','low'],[3,'낮음','low'],[4,'보통','normal'],[6,'보통','normal'],[7,'높음','high'],[9,'높음','high'],[10,'천재','genius']]){
    p.talent={batting:value,pitching:value};
    for(const week of [9.99,10,29.99,30]){
      p.talentExposure={batting:week,pitching:week};const text=e.talentLabel(p,'batting'),html=renderToStaticMarkup(createElement(Talents,{player:p}));
      assert.equal(text,week<10?'미상':week<30?label:`${value} / 10`);
      assert.ok(html.includes(`talent-${week<10?'unknown':tone}`));assert.ok(html.includes(text));
      if(week<10)assert.ok(!html.includes(`talent-${tone}`));
    }
  }
});
test('training settings and other-player record details render the same talent panel',()=>{
  const p=player();p.talent={batting:10,pitching:0};
  const editor=renderToStaticMarkup(createElement(Editor,{player:p,policy:p.trainingPolicy,setPolicy(){},showTalents:true}));
  const records=renderToStaticMarkup(createElement(Records,{player:p,year:2027,school:'검증고',ended:false,mine:false,onMyRecords(){}}));
  for(const html of [editor,records]){assert.ok(html.includes('talent-genius'));assert.ok(html.includes('천재'));assert.ok(html.includes('talent-none'));assert.ok(html.includes('없음'));assert.ok(html.includes('타자 재능'));assert.ok(html.includes('투수 재능'));}
});
test('zero talent survives save round trips and draft talent contribution cannot become negative',()=>{
  const s=structuredClone(base),p=e.getPlayer(s);p.talent={batting:0,pitching:0};
  const restored=decodeCareerSave(JSON.stringify(encodeCareerSave(s))).state;assert.deepEqual(e.getPlayer(restored).talent,p.talent);
  const zero=draftAssessment(p);p.talent.batting=10;close(draftAssessment(p)-zero,e.params['draft.talent_weight']*100);
});
