import type {GameState,Player,Stat} from './types';

export const conditioningEffectMultiplier=.5;

const pitchers:readonly Stat[]=['velocity','control','movement'];
const hitters:readonly Stat[]=['contact','power','speed','defense'];
const physical:readonly Stat[]=['stamina','recovery','arm'];

export const offseasonItems={
  rosin:{name:'로진백',icon:'⚾',price:30_000_000,stats:['velocity'],bonus:.3,detail:'구속 훈련 배율 +0.3'},
  target:{name:'3X3 표적',icon:'🎯',price:30_000_000,stats:['control'],bonus:.3,detail:'제구 훈련 배율 +0.3'},
  gripper:{name:'악력기',icon:'✊',price:30_000_000,stats:['movement'],bonus:.3,detail:'변화구 훈련 배율 +0.3'},
  tee:{name:'티볼',icon:'🏏',price:30_000_000,stats:['contact'],bonus:.3,detail:'컨택 훈련 배율 +0.3'},
  barbell:{name:'바벨',icon:'🏋️',price:30_000_000,stats:['power'],bonus:.3,detail:'파워 훈련 배율 +0.3'},
  weights:{name:'모래주머니',icon:'👟',price:30_000_000,stats:['speed'],bonus:.3,detail:'주루 훈련 배율 +0.3'},
  rebound:{name:'리바운드 체인',icon:'🧤',price:30_000_000,stats:['defense'],bonus:.3,detail:'수비 훈련 배율 +0.3'},
  heating:{name:'온열찜질기',icon:'♨️',price:30_000_000,stats:physical,bonus:.3,detail:'스태미나·회복·송구 훈련 배율 +0.3'},
  pitchingCoach:{name:'투수 트레이너',icon:'🧢',price:200_000_000,stats:pitchers,bonus:.5,detail:'구속·제구·변화구 훈련 배율 +0.5'},
  battingCoach:{name:'타자 트레이너',icon:'🥎',price:200_000_000,stats:hitters,bonus:.5,detail:'컨택·파워·주루·수비 훈련 배율 +0.5'},
  physicalCoach:{name:'피지컬 코치',icon:'💪',price:180_000_000,stats:physical,bonus:.5,detail:'스태미나·회복·송구 훈련 배율 +0.5'},
  conditioning:{name:'컨디셔닝 코치',icon:'🩺',price:150_000_000,stats:[],bonus:0,detail:'경기·훈련 피로와 노화에 따른 능력 하락 50% 감소'},
  agent:{name:'에이전트',icon:'🤝',price:300_000_000,stats:[],bonus:0,detail:'FA·연봉 재협상 시 인상률 +10%p. 구단 예산 내 적용'},
} satisfies Record<string,{name:string;icon:string;price:number;stats:readonly Stat[];bonus:number;detail:string}>;

export type OffseasonItemId=keyof typeof offseasonItems;
export type OffseasonInventory=Partial<Record<OffseasonItemId,number>>;
export type OffseasonShop={
  spent:number;items:OffseasonInventory;active?:{id:OffseasonItemId;year:number};
  settlement?:{year:number;agent:boolean;conditioning:boolean};
};
export type OffseasonShopAction={type:'buyOffseasonItems';items:OffseasonInventory};
export function offseasonBalance(p:Player){
  return Math.max(0,(p.professional?.earnings??0)-(p.offseasonShop?.spent??0));
}
export function buyShopItems(s:GameState,p:Player,items:OffseasonInventory){
  if(s.careerMode!=='pro'||!s.proWorld||s.proWorld.stage==='retired'||p.id!==s.playerId||!p.professional)throw new Error('프로 커리어에서 상점을 이용할 수 있습니다.');
  if(!validInventory(items)||!Object.keys(items).length)throw new Error('구매할 아이템과 수량을 확인해 주세요.');
  const entries=Object.entries(items) as [OffseasonItemId,number][];
  const cost=entries.reduce((sum,[id,count])=>sum+offseasonItems[id].price*count,0);
  if(!Number.isSafeInteger(cost)||cost>offseasonBalance(p))throw new Error('보유 자금이 부족합니다.');
  const shop=p.offseasonShop??={spent:0,items:{}};
  for(const [id,count] of entries)shop.items[id]=(shop.items[id]??0)+count;
  shop.spent+=cost;
}

export function hasShopItem(p:Player,id:OffseasonItemId,year=p.professional?.agedYear){
  const shop=p.offseasonShop;
  return (shop?.items[id]??0)>0||shop?.active?.id===id&&shop.active.year===year;
}

export function settleShopItems(p:Player,year:number){
  const shop=p.offseasonShop;
  if(!shop||shop.settlement?.year===year)return;
  shop.settlement={year,agent:hasShopItem(p,'agent',year),conditioning:hasShopItem(p,'conditioning',year)};
  // Older saves deducted the activated copy immediately.
  const prepaid=shop.active?.year===year?shop.active.id:undefined;
  for(const id of Object.keys(shop.items) as OffseasonItemId[]){
    if(id===prepaid)continue;
    const count=shop.items[id]!;
    if(count===1)delete shop.items[id];else shop.items[id]=count-1;
  }
  if(shop.active&&shop.active.year<=year)delete shop.active;
}

function validInventory(value:unknown){
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([id,count])=>
    Object.hasOwn(offseasonItems,id)&&Number.isSafeInteger(count)&&count>0);
}
export function validOffseasonShop(value:unknown,year:number){
  if(!value||typeof value!=='object')return false;
  const shop=value as OffseasonShop;
  return Number.isSafeInteger(shop.spent)&&shop.spent>=0&&validInventory(shop.items)&&
    (shop.active===undefined||!!shop.active&&Object.hasOwn(offseasonItems,shop.active.id)&&
      Number.isInteger(shop.active.year)&&shop.active.year>0&&shop.active.year<=year+1)&&
    (shop.settlement===undefined||!!shop.settlement&&Number.isInteger(shop.settlement.year)&&
      shop.settlement.year>0&&shop.settlement.year<=year&&typeof shop.settlement.agent==='boolean'&&typeof shop.settlement.conditioning==='boolean');
}
const trainingItems=(Object.keys(offseasonItems) as OffseasonItemId[]).filter(id=>offseasonItems[id].bonus>0);
export function trainingItemBonus(p:Player,stat:Stat){
  if(!p.offseasonShop)return 0;
  let bonus=0;
  for(const id of trainingItems){
    const item=offseasonItems[id];
    if((item.stats as readonly Stat[]).includes(stat)&&hasShopItem(p,id))bonus+=item.bonus;
  }
  return bonus;
}
export function conditioningMultiplier(p:Player,year=p.professional?.agedYear){
  return hasShopItem(p,'conditioning',year)? conditioningEffectMultiplier : 1;
}
export function winterShopBenefit(p:Player,id:'agent'|'conditioning',year:number){
  // Contract negotiations and camp aging follow the season's stock deduction.
  const previous=p.offseasonShop?.settlement;
  return hasShopItem(p,id,year)||previous?.year===year-1&&previous[id];
}
