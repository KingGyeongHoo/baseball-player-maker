import type {retirementSummary} from '../../lib/retirement-summary';
import {useId} from 'react';

type Honors=ReturnType<typeof retirementSummary>['honorCollections'];
type HonorKind=keyof Honors;
const categories:{kind:HonorKind;label:string;note:string}[]=[
  {kind:'allstar',label:'올스타',note:'1·2군 선발 · 대체 선발 포함'},
  {kind:'gold',label:'골든글러브',note:'포지션 최고의 선수'},
  {kind:'mvp',label:'MVP',note:'시즌 최고의 선수'},
  {kind:'rookie',label:'신인상',note:'가장 빛난 첫 시즌'},
  {kind:'championship',label:'한국시리즈 우승',note:'우승 당시 소속팀 기준'},
  {kind:'national',label:'국가대표',note:'성인 대표 · WBC'},
];

function HonorIcon({kind}:{kind:HonorKind}){
  const id=useId(),gold=`url(#${id}-gold)`,darkGold=`url(#${id}-dark-gold)`;
  return <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={`retirement-honor-icon honor-icon-${kind}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id={`${id}-gold`} x1="12" y1="8" x2="50" y2="48" gradientUnits="userSpaceOnUse"><stop stopColor="#fff0b0"/><stop offset=".3" stopColor="#e3b34c"/><stop offset=".53" stopColor="#fff1ba"/><stop offset=".73" stopColor="#c79332"/><stop offset="1" stopColor="#91631f"/></linearGradient>
      <linearGradient id={`${id}-dark-gold`} x1="16" y1="16" x2="47" y2="48" gradientUnits="userSpaceOnUse"><stop stopColor="#94601e"/><stop offset=".45" stopColor="#dba749"/><stop offset="1" stopColor="#704816"/></linearGradient>
    </defs>
    {kind==='allstar'?<>
      <path d="M32 6 39.7 22 57.3 24.5 44.6 36.9 47.6 54.4 32 46.1 16.4 54.4 19.4 36.9 6.7 24.5 24.3 22Z" fill={gold} stroke="#ac792b" strokeWidth="1.2"/>
      <path d="M32 6V34L6.7 24.5 24.3 22Zm0 28 12.6 2.9 3 17.5L32 46.1Z" fill="#c69539"/>
      <path d="m32 12 5.8 12 12.8 1.8-10 3.4L32 22Z" fill="#fff0b5"/>
    </>:kind==='gold'?<>
      <path d="M28 43h9l2 10H25Z" fill={darkGold}/>
      <path d="M12 29C7 22 9 14 16 10c2-1 4 0 5 2 1-5 6-7 9-3 3-5 9-2 9 2 5-3 9 1 8 6 6 0 9 5 6 10l-6 12c-3 6-8 10-16 9-8-1-13-6-15-12Z" fill={gold} stroke="#8c5c20" strokeWidth="1.3"/>
      <path d="M16 12c-4 4-4 9 0 16m7-17c-4 6-3 10 0 16m9-17c-4 5-4 10-2 15m10-12c-3 4-4 8-4 12" stroke="#ad7829" strokeWidth="2.8"/>
      <path d="M16 12c-3 4-3 9 0 13m7-14c-2 5-2 9 0 13m9-14c-2 4-3 8-2 12m10-9c-2 3-3 7-3 9" stroke="#ffeaa4" strokeWidth="1.3"/>
      <path d="M18 29c0-7 11-12 19-7 6 3 7 11 3 16-6 8-18 4-22-9Z" fill={darkGold} stroke="#9f6b22"/>
      <path d="M23 29c3-4 9-5 13-2 4 4 2 10-3 11-5 1-9-3-10-9Z" fill="#b7802d"/>
      <path d="M45 18c-6 0-11 6-10 12l8 3 7-12Z" fill="#e3b655" stroke="#916020" strokeWidth="1.3"/>
      <path d="m39 22 8 4m-10 0 8 4m-3-9-4 9m7-9-4 11" stroke="#79501d" strokeWidth="1.4"/>
      <path d="M50 21c-2 8-7 15-11 19-5 4-13 4-18-2" stroke="#ffe7a1" strokeWidth="2.4"/>
      <path d="M12 21c0 9 6 20 16 24m23-21c-3 10-9 20-18 22" stroke="#81541f" strokeWidth="2.5" strokeDasharray=".4 4"/>
      <path d="m20 51 24 0 4 4H16Z" fill={gold} stroke="#9b702c"/>
      <rect x="14" y="55" width="36" height="7" rx="1.5" fill="#25364d"/>
      <path d="M25 58.5h14" stroke="#d8b970" strokeWidth="2"/>
    </>:kind==='championship'?<>
      <path d="M17 29c-6 4-7 20 0 26 7 6 23 6 30 0 7-6 6-22 0-26l-7 5c5 4 5 12 1 16-4 4-14 4-18 0-4-4-4-12 1-16Z" fill={gold} stroke="#956a29" strokeWidth="1.2"/>
      <path d="M17 38c-2 7 1 14 6 16m24-16c2 7-1 14-6 16" stroke="#ffdf87" strokeWidth="3"/>
      <path d="m15 16 9-8h16l9 8v17l-9 8H24l-9-8Z" fill={gold} stroke="#a4772c" strokeWidth="1.2"/>
      <path d="m21 19 6-5h10l6 5v12l-6 5H27l-6-5Z" fill="#263d61" stroke="#fff0c0" strokeWidth="1.5"/>
      <path d="m32 17 8 8-8 8-8-8Z" fill="#f4f7fb"/>
      <path d="m32 17 2 8-2 8-2-8Z" fill="#bbd5e6"/>
      <path d="M25 11h14M18 18v14m28-14v14M25 38h14" stroke="#fff8dc" strokeWidth="2" strokeDasharray="1 4"/>
    </>:kind==='national'?<>
      <rect x="3" y="12" width="58" height="40" rx="2" fill="#fff" stroke="#d5deea"/>
      <g transform="rotate(33.69 32 32)"><circle cx="32" cy="32" r="9" fill="#ce3343"/><path d="M23 32a9 9 0 0 0 18 0 4.5 4.5 0 0 0-9 0 4.5 4.5 0 0 1-9 0" fill="#24549b"/></g>
      <g stroke="#253047" strokeWidth="1.8">
        <g transform="translate(15 22) rotate(-56.31)"><path d="M-5-3H5M-5 0H5M-5 3H5"/></g>
        <g transform="translate(49 42) rotate(-56.31)"><path d="M-5-3h4m2 0h4M-5 0h4m2 0h4M-5 3h4m2 0h4"/></g>
        <g transform="translate(49 22) rotate(56.31)"><path d="M-5-3h4m2 0h4M-5 0H5M-5 3h4m2 0h4"/></g>
        <g transform="translate(15 42) rotate(56.31)"><path d="M-5-3H5M-5 0h4m2 0h4M-5 3H5"/></g>
      </g>
    </>:<>
      {kind==='mvp'&&<>
        <path d="M17 46C6 39 5 24 12 17m35 29c11-7 12-22 5-29" stroke="#bc8d35" strokeWidth="1.5"/>
        <path d="m12 22-6-5 1 8 6 3m-2 4-6-3 3 8 6 2m1 3-5-1 5 7 5 1m32-27 6-5-1 8-6 3m2 4 6-3-3 8-6 2m-1 3 5-1-5 7-5 1" fill="#d9ae50"/>
        <path d="m32 2 1.5 4.5L38 8l-4.5 1.5L32 14l-1.5-4.5L26 8l4.5-1.5Z" fill="#e4b444"/>
      </>}
      <path d="M20 17H12v6c0 8 6 11 12 10m20-16h8v6c0 8-6 11-12 10" stroke="#bd8a32" strokeWidth="3"/>
      <path d="M19 14h26l-2 16c-1 7-6 12-11 12s-10-5-11-12Z" fill={gold} stroke="#a77b32" strokeWidth="1.2"/>
      <path d="M19 14h26" stroke="#fff0ad" strokeWidth="2.4"/>
      <path d="m23 17 2 13c1 4 3 7 5 8V17Z" fill="#ffe8a0"/>
      {kind==='mvp'&&<path d="m32 20 2.4 4.8 5.3.8-3.9 3.8.9 5.3-4.7-2.5-4.7 2.5.9-5.3-3.9-3.8 5.3-.8Z" fill="#9a3c31" stroke="#fff0b0"/>}
      <path d="M29 42h6v9h-6Z" fill="#c18f39"/>
      <path d="m25 49-4 5h22l-4-5Z" fill={gold} stroke="#a77b32"/>
      <rect x="19" y="54" width="26" height="6" rx="1.5" fill={kind==='mvp'?'#263d61':'#806644'}/>
      <path d="M28 57h8" stroke="#edcf8a" strokeWidth="1.5"/>
    </>}
  </svg>;
}

export default function RetirementHonorDisplay({honors}:{honors:Honors}){
  return <section className="retirement-honor-counts" aria-label="선발과 수상 내역">
    {categories.map(({kind,label,note})=>{
      const entries=honors[kind];
      return <article className={`panel retirement-honor-card honor-${kind}`} key={kind}>
        <div className="retirement-honor-heading"><h2>{label}</h2><span>{entries.length}회</span></div>
        {entries.length?<ul className="retirement-honor-icons" aria-label={`${label} ${entries.length}회`}>{entries.map((entry,index)=><li key={`${entry.year}:${entry.title}:${index}`} title={`${entry.year}년 · ${entry.title}${entry.detail?` · ${entry.detail}`:''}`} aria-label={`${entry.year}년 ${entry.title}${entry.detail?` · ${entry.detail}`:''}`}><HonorIcon kind={kind}/></li>)}</ul>:<p className="retirement-honor-empty">해당 이력 없음</p>}
        <small>{note}</small>
      </article>;
    })}
  </section>;
}
