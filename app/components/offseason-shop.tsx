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

const equipment:OffseasonItemId[]=['rosin','target','gripper','tee','barbell','weights','rebound','heating'];
const staff:OffseasonItemId[]=['pitchingCoach','battingCoach','physicalCoach','conditioning','agent'];
const priceText=(amount:number)=>`₩${(amount/10_000).toLocaleString('ko-KR')}만원`;

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
    return <article className="offseason-shop-card" key={id}>
      <span className="offseason-shop-icon" aria-hidden="true">{item.icon}</span>
      <h4>{item.name}</h4>
      <strong>{priceText(item.price)}</strong>
      <p>{item.detail}</p>
      <div className="offseason-shop-quantity">
        <button type="button" aria-label={`${item.name} 구매 수량 줄이기`} disabled={disabled||!quantity} onClick={()=>adjust(id,-1)}>−</button>
        <output aria-label={`${item.name} 구매 수량`}>{quantity}</output>
        <button type="button" aria-label={`${item.name} 구매 수량 늘리기`} disabled={disabled||total+item.price>balance} onClick={()=>adjust(id,1)}>+</button>
      </div>
      <small className="offseason-shop-stock">보유 {owned}개{hasShopItem(player,id,year)&&' · 적용 중'}</small>
    </article>;
  }
  return <section className="offseason-shop panel" aria-labelledby="shop-heading">
    <div className="offseason-shop-heading"><h2 id="shop-heading">상점</h2><span>잔고 {priceText(balance)}</span></div>
    <p>구매 즉시 효과가 적용됩니다. 시즌 결산 때 보유한 종류마다 하나씩 차감합니다.</p>
    <div className="offseason-shop-grid" aria-label="훈련 장비">{equipment.map(itemCard)}</div>
    <div className="offseason-shop-grid offseason-shop-staff" aria-label="트레이너와 에이전트">{staff.map(itemCard)}</div>
    <div className="offseason-shop-checkout">
      <span>구매 합계 <strong>{priceText(total)}</strong></span>
      <button type="button" className="primary" disabled={disabled||!total||total>balance} onClick={()=>{
        onAction({type:'buyOffseasonItems',items:cart});
        setCart({});
      }}>장바구니 구매</button>
    </div>
  </section>;
}
