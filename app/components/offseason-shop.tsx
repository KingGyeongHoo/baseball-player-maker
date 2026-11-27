'use client';

import {useState} from 'react';
import {
  hasShopItem,
  offseasonBalance,
  offseasonItems,
  type OffseasonInventory,
  type OffseasonItemId,
  type OffseasonShopAction,
} from '../../lib/sim/offseason-shop';
import type {GameState,Player} from '../../lib/sim/types';

const groups:{label:string;items:OffseasonItemId[];equipment:OffseasonItemId[]}[]=[
  {label:'투수 아이템',items:['rosin','target','gripper','pitchingCoach'],equipment:['velocityGlove','controlGlove','movementGlove']},
  {label:'타자 아이템',items:['tee','barbell','weights','rebound','battingCoach'],equipment:['contactBat','powerBat','speedSpikes','defenseSpikes']},
  {label:'공용 아이템',items:['heating','physicalCoach','conditioning','agent','trainingDiary'],equipment:['physicalBand']},
];
const priceText=(amount:number)=>`₩${(amount/10_000).toLocaleString('ko-KR')}만원`;

function BaseballBatIcon({power=false}:{power?:boolean}){
  return <span className="equipment-icon-art"><svg width="36" height="36" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="m8 39-2-2 12-13c4-5 8-12 14-18 3-3 6-3 9 0s3 6 0 9c-6 6-13 10-18 14L10 41Z" fill="#DDA867" stroke="#754B2D" strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="m22 23 13-14" stroke="#F8D9A7" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="m7 37 4 3 10-11-4-4Z" fill="#343D49"/>
    <path d="m10 34 4 3m-1-6 4 3m-1-6 4 3" stroke="#83909F" strokeWidth="1.3"/>
    <path d="m5 38 5 5" stroke="#754B2D" strokeWidth="4" strokeLinecap="round"/>
    {!power&&<path d="M35 42V27m-6 6 6-6 6 6" stroke="#DC2626" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>{power&&<span className="equipment-icon-badge bat-badge">💥</span>}</span>;
}

function BaseballSpikesIcon({defense=false}:{defense?:boolean}){
  return <span className="equipment-icon-art"><svg width="36" height="36" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="m8 34 1 5h4l1-5m8 0 1 5h4l1-5m10 0 1 5h4l1-5" fill="#808A98" stroke="#323B47" strokeWidth="1.2"/>
    <path d="M3 28c0-4 5-6 12-7l11-9 5 3c3 2 7 2 10-3l3 5v15c-9 4-27 4-39 1Z" fill="#202630" stroke="#0E1520" strokeWidth="1.7" strokeLinejoin="round"/>
    <path d="M4 30c11 3 27 3 39-1v5c-12 3-28 3-39-1Z" fill="#424B58" stroke="#101722" strokeWidth="1.2"/>
    <path d="m19 20 7 2m-3-6 7 2m-3-6 6 3" stroke="#B8C1CD" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M6 26c4-1 8-1 12 0m13-5 5 4" stroke="#566170" strokeWidth="1.4" strokeLinecap="round"/>
  </svg><span className="equipment-icon-badge spikes-badge">{defense?'🛡️':'💨'}</span></span>;
}

function ShopItemIcon({id}:{id:OffseasonItemId}){
  if(id==='contactBat'||id==='powerBat')return <BaseballBatIcon power={id==='powerBat'}/>;
  if(id==='speedSpikes'||id==='defenseSpikes')return <BaseballSpikesIcon defense={id==='defenseSpikes'}/>;
  if(['velocityGlove','controlGlove','movementGlove'].includes(id))return <span className="equipment-icon-art glove-icon-art"><BaseballGloveIcon/><span className={`equipment-icon-badge glove-badge${id==='velocityGlove'?' velocity-badge':''}`}>{id==='velocityGlove'?'km/h':id==='controlGlove'?'🎯':'↩️'}</span></span>;
  return offseasonItems[id].icon;
}

function BaseballGloveIcon(){
  return <svg width="30" height="30" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M13 39C6 34 4 26 5 22c1-3 4-3 6 0l4 6-3-17c-.5-4 5-5 6-1l3 13-1-17c0-4 6-4 6 0l1 17 2-16c.5-4 6-3 6 1l-2 17 4-12c1-4 6-2 5 2l-4 18c-1 6-6 10-13 11Z" fill="#BC783F" stroke="#643B24" strokeWidth="2" strokeLinejoin="round"/>
    <path d="m12 18 5-2 3 8-5 5-5-8Z" fill="#E4AE70" stroke="#643B24" strokeWidth="1.5"/>
    <path d="m11 19 7 5m-6 0 6-5M21 27c-5 2-5 9 1 11 5 2 11-2 11-8M18 39l4-2m0 5 3-4m3 4 1-4m4 1-1-4" stroke="#643B24" strokeWidth="1.7" strokeLinecap="round"/>
    <path d="m17 10 3 15m5-18 1 17m7-14-3 16m9-9-5 13" stroke="#EFC18C" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="m14 37 5 5 11-1 5-5" stroke="#643B24" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}

export default function OffseasonShop({state,player,disabled,onAction}:{
  state:GameState;player:Player;disabled:boolean;onAction:(action:OffseasonShopAction)=>void;
}){
  const [cart,setCart]=useState<OffseasonInventory>({});
  const year=state.calendar.seasonYear,shop=player.offseasonShop;
  const balance=offseasonBalance(player);
  const ids=Object.keys(cart) as OffseasonItemId[];
  const total=ids.reduce((sum,id)=>sum+offseasonItems[id].price*cart[id]!,0);
  function adjust(id:OffseasonItemId,delta:number){
    setCart(previous=>{
      const next={...previous},quantity=(next[id]??0)+delta;
      if(quantity>0)next[id]=quantity;else delete next[id];
      return next;
    });
  }
  function itemCard(id:OffseasonItemId){
    const item=offseasonItems[id],quantity=cart[id]??0,owned=shop?.items[id]??0;
    const active=id==='trainingDiary'?shop?.trainingDiary?.year===year:hasShopItem(player,id,year);
    return <article className="offseason-shop-card" key={id}>
      <span className="offseason-shop-icon" aria-hidden="true"><ShopItemIcon id={id}/></span>
      <h4>{item.name}</h4>
      <strong>{priceText(item.price)}</strong>
      <p>{item.detail}</p>
      <div className="offseason-shop-quantity">
        <button type="button" aria-label={`${item.name} 구매 수량 줄이기`} disabled={disabled||!quantity} onClick={()=>adjust(id,-1)}>−</button>
        <output aria-label={`${item.name} 구매 수량`}>{quantity}</output>
        <button type="button" aria-label={`${item.name} 구매 수량 늘리기`} disabled={disabled||total+item.price>balance} onClick={()=>adjust(id,1)}>+</button>
      </div>
      <small className="offseason-shop-stock">보유 {owned}개{active?' · 적용 중':id==='trainingDiary'&&owned>0?' · 다음 시즌 적용':''}</small>
    </article>;
  }
  return <section className="offseason-shop panel" aria-labelledby="shop-heading">
    <div className="offseason-shop-heading"><h2 id="shop-heading">상점</h2><span>잔고 {priceText(balance)}</span></div>
    <p>구매 즉시 효과가 적용됩니다. 시즌 결산 때 보유한 종류마다 하나씩 차감합니다.</p>
    <div className="offseason-shop-catalog">{groups.map(group=><section className="offseason-shop-group" aria-label={group.label} key={group.label}>
      <h3>{group.label}</h3>
      <div className="offseason-shop-grid">{group.items.map(itemCard)}</div>
      <div className="offseason-shop-grid offseason-equipment-row">{group.equipment.map(itemCard)}</div>
    </section>)}</div>
    <div className="offseason-shop-checkout">
      <span>구매 합계 <strong>{priceText(total)}</strong></span>
      <button type="button" className="primary" disabled={disabled||!total||total>balance} onClick={()=>{
        onAction({type:'buyOffseasonItems',items:cart});
        setCart({});
      }}>장바구니 구매</button>
    </div>
  </section>;
}
