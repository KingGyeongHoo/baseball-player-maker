"use client";
import {useEffect,useId,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";

export default function Tooltip({content,children}:{content:ReactNode;children:ReactNode}){
  const id=useId(),trigger=useRef<HTMLSpanElement>(null);
  const [position,setPosition]=useState<{left:number;top:number;width:number;above:boolean;container:HTMLElement}|null>(null);
  const show=()=>{
    const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
    const width=Math.min(260,window.innerWidth-24),above=rect.bottom+88>window.innerHeight;
    setPosition({left:Math.max(12,Math.min(rect.left+rect.width/2-width/2,window.innerWidth-width-12)),top:above?rect.top-8:rect.bottom+8,width,above,container:trigger.current?.closest("dialog")??document.body});
  };
  const open=position!==null;
  useEffect(()=>{
    if(!open)return;
    const close=()=>setPosition(null);
    window.addEventListener("scroll",close,true);window.addEventListener("resize",close);
    return ()=>{window.removeEventListener("scroll",close,true);window.removeEventListener("resize",close);};
  },[open]);
  return <span ref={trigger} className="tooltip-trigger" tabIndex={0} aria-describedby={open?id:undefined}
    onMouseEnter={show} onMouseLeave={()=>setPosition(null)} onFocus={show} onBlur={()=>setPosition(null)}
    onClick={show} onKeyDown={event=>{if(event.key==="Escape")setPosition(null);}}>
    {children}
    {position&&createPortal(<div id={id} role="tooltip" className="app-tooltip" style={{left:position.left,top:position.top,width:position.width,transform:position.above?"translateY(-100%)":undefined}}>{content}</div>,position.container)}
  </span>;
}
