"use client";
import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import {savedRetiredNumberClaims} from '../../lib/career-save';
import {clubRetiredNumbers,retiredNumberImage,retiredNumberLogos} from '../../lib/hall-of-fame';
import type {SavedRetiredNumber} from '../../lib/retired-number-reservations';
import {proClubNames} from '../../lib/sim/club-names';

export function RetiredNumberGallery({entries,club,template}:{entries:SavedRetiredNumber[];club:number;template:string}){
  const players=clubRetiredNumbers(entries,club);
  return <section className="hall-club" id="hall-club-panel" role="tabpanel" aria-labelledby={`hall-club-${club}`}>
    <div className="hall-club-heading"><div><span className="eyebrow">RETIRED NUMBERS</span><h3>{proClubNames[club]} 영구결번</h3></div><span>{players.length}명</span></div>
    {players.length?<div className="hall-number-grid">{players.map(player=><article className="hall-number-card" key={player.key}>
      {template?<Image unoptimized src={retiredNumberImage(template,player.number)} width={256} height={256} alt={`${proClubNames[club]} 영구결번 ${player.number}번`}/>:<div className="hall-number-placeholder" aria-label={`${player.number}번`}>{player.number}</div>}
      <h4>{player.playerName}</h4><p>{proClubNames[club]} · {player.number}번</p>
    </article>)}</div>:<p className="hall-empty">아직 영구결번으로 남은 선수가 없습니다.</p>}
  </section>;
}

function HallOfFameDialog({onClose}:{onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),[entries,setEntries]=useState<SavedRetiredNumber[]>([]),[club,setClub]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[logo,setLogo]=useState({club:-1,template:'',error:''});
  const template=logo.club===club?logo.template:'',logoError=logo.club===club?logo.error:'';
  useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  useEffect(()=>{let active=true;void savedRetiredNumberClaims().then(rows=>{if(active)setEntries(rows);}).catch(()=>{if(active)setError('명예의 전당을 불러오지 못했습니다. 닫은 뒤 다시 열어 주세요.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  useEffect(()=>{const controller=new AbortController();void fetch(`/hall-of-fame/${retiredNumberLogos[club]}.svg`,{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error();return response.text();}).then(svg=>{if(!controller.signal.aborted)setLogo({club,template:svg,error:''});}).catch(()=>{if(!controller.signal.aborted)setLogo({club,template:'',error:'구단 로고를 불러오지 못했습니다.'});});return()=>controller.abort();},[club]);
  return <dialog ref={dialog} className="modal hall-of-fame-modal" aria-label="명예의 전당" onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="modal-header"><div><span className="eyebrow">HALL OF FAME</span><h2>명예의 전당</h2></div><button className="secondary" onClick={onClose}>닫기</button></div>
    <div className="hall-of-fame-body"><div className="hall-club-tabs" role="tablist" aria-label="영구결번 구단 선택">{proClubNames.map((name,id)=><button key={id} id={`hall-club-${id}`} role="tab" aria-selected={club===id} aria-controls="hall-club-panel" className={club===id?'selected':''} onClick={()=>setClub(id)}>{name}</button>)}</div>
      {loading?<p className="hall-empty" role="status">은퇴 선수 기록을 불러오는 중입니다.</p>:<><RetiredNumberGallery entries={entries} club={club} template={template}/>{error&&<p className="hall-empty" role="alert">{error}</p>}{logoError&&<p role="alert">{logoError}</p>}</>}
    </div>
  </dialog>;
}

export default function HallOfFameButton({onOpen}:{onOpen?:()=>void}){
  const [open,setOpen]=useState(false);
  return <><button className="text-button hall-of-fame-button" onClick={()=>{onOpen?.();setOpen(true);}}>명예의 전당</button>{open&&<HallOfFameDialog onClose={()=>setOpen(false)}/>}</>;
}
