import {useState,type ReactNode} from "react";
import {getPlayer,overall,positionLabel,positions,validPolicy} from "../../lib/sim/engine";
import {canPlayPosition} from "../../lib/sim/position-eligibility";
import {positionRequestBlock} from "../../lib/sim/pro-role-evaluation";
import TwoWayRelease from './two-way-release';
import PlayerTalents from './player-talents';
import type {GameState,Policy,Position,Stance} from "../../lib/sim/types";
import {scoreText} from "../../lib/display";
import PlayerAbilities from "./player-abilities";
import TrainingEditor from "./training-editor";
import {PlayerGrade} from "./player-roster";

function Panel({title,eyebrow,children,className=""}:{title:string;eyebrow:string;children:ReactNode;className?:string}){
  return <section className={`panel ${className}`}><div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div></div>{children}</section>;
}
function StanceEditor({stance,setStance}:{stance:Stance;setStance:(s:Stance)=>void}){
  return <div className="stance-editor"><div><span className="small muted">타격 성향</span><div className="segmented">{(["down","level","up"] as const).map((v,i)=><button key={v} className={stance.batting===v?"selected":""} onClick={()=>setStance({...stance,batting:v})}>{["다운스윙","레벨스윙","어퍼스윙"][i]}</button>)}</div><p className="micro muted">{stance.batting==="level"?"기본 능력을 유지하는 균형 잡힌 스윙":stance.batting==="down"?"컨택 +5% · 파워 −5% · 땅볼 성향":"파워 +5% · 컨택 −5% · 뜬공 성향"}</p></div>
    <div><span className="small muted">투구 성향</span><div className="segmented">{(["full","regular","command"] as const).map((v,i)=><button key={v} className={stance.pitching===v?"selected":""} onClick={()=>setStance({...stance,pitching:v})}>{["파이어볼러","레귤러 피쳐","커맨더"][i]}</button>)}</div><p className="micro muted">{stance.pitching==="full"?"구속 +5% · 제구 −5%":stance.pitching==="command"?"구속 −5% · 제구 +5%":"구속·제구 기본"}</p></div></div>;
}
function GrowthChart({state}:{state:GameState}){
  const current=state.history.filter(point=>point.ovrScale===100),p=getPlayer(state);
  const history=current.length?current:[{week:state.week,ovr:overall(p),fatigue:p.fatigue}],values=history.map(h=>h.ovr);
  const min=Math.floor(Math.min(...values))-1,max=Math.ceil(Math.max(...values))+2;
  const points=history.map((h,i)=>`${30+i/Math.max(1,history.length-1)*490},${115-(h.ovr-min)/(max-min)*90}`).join(" ");
  return <div className="chart"><svg viewBox="0 0 550 150" role="img" aria-label={`종합 능력 ${scoreText(values[0])}에서 ${scoreText(values.at(-1))}로 성장`}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#0e2046" stopOpacity=".1"/><stop offset="1" stopColor="#0e2046" stopOpacity="0"/></linearGradient></defs>
    {[0,1,2].map(i=><g key={i}><line x1="30" y1={25+i*45} x2="525" y2={25+i*45} stroke="#e9ecf0" strokeDasharray="3 4"/><text x="0" y={29+i*45} fill="#8d95a3" fontSize="10">{scoreText(max-i*(max-min)/2)}</text></g>)}
    <polygon points={`30,120 ${points} ${history.length>1?520:30},120`} fill="url(#chartFill)"/><polyline points={points} fill="none" stroke="#0e2046" strokeWidth="2.5" strokeLinejoin="round"/>{history.length<2&&<circle cx="30" cy={115-(values[0]-min)/(max-min)*90} r="4" fill="#0e2046"/>}<text x="30" y="145" fontSize="10" fill="#8d95a3">{current.length===state.history.length?state.careerMode?"커리어 시작":"입학":"기준 변경"}</text><text x="500" y="145" fontSize="10" fill="#8d95a3">현재</text>
  </svg></div>;
}
export default function TrainingCenter({state,policy,setPolicy,stance,setStance,onSave,disabled=false,profile,message,onChange,onPositionRequest,positionRequestDisabled}:{
  state:GameState;policy:Policy;setPolicy:(p:Policy)=>void;stance:Stance;setStance:(s:Stance)=>void;onSave:()=>void;disabled?:boolean;profile?:ReactNode;message?:string;onChange?:(s:GameState)=>void;onPositionRequest?:(position:Position)=>void;positionRequestDisabled?:boolean;
}){
  const player=getPlayer(state),locked=disabled||state.phase==="ended"||!!state.weekProgress;
  const [position,setPosition]=useState<Position|"">("");
  const requestBlock=onPositionRequest?positionRequestBlock(state,player):undefined;
  const targets=(Object.keys(positions) as Position[]).filter(target=>target!==player.position&&canPlayPosition(player,target));
  const target=position&&targets.includes(position)?position:"";
  return <div className="training-center"><div className="section-intro"><div><span className="eyebrow">TRAINING CENTER</span><h1>훈련 센터</h1></div><button className="primary" onClick={onSave} disabled={locked||!validPolicy(policy)}>훈련 설정 저장</button></div>
    {message&&<p className="training-save-message" role="status">{message}</p>}
    <div className="training-layout"><Panel title="주간 훈련 배분" eyebrow="WEEKLY TRAINING"><fieldset className="content-lock" disabled={locked}><TrainingEditor player={player} policy={policy} setPolicy={setPolicy} date={state.date} context={state}/></fieldset></Panel>
      <div className="side-column"><Panel title="경기 성향" eyebrow="PLAYING STYLE"><fieldset className="content-lock" disabled={locked}><StanceEditor stance={stance} setStance={setStance}/></fieldset></Panel>
        {onPositionRequest&&<Panel title="포지션 변경 요청" eyebrow="POSITION REQUEST">
          <fieldset className="content-lock pro-position-request" disabled={locked||positionRequestDisabled||!!requestBlock}>
            <label htmlFor="training-position-request" className="small muted">희망 포지션</label>
            <select id="training-position-request" value={target} onChange={event=>setPosition(event.target.value as Position|"")}>
              <option value="">포지션 선택</option>{targets.map(value=><option key={value} value={value}>{positions[value]}</option>)}
            </select>
            <button className="secondary" disabled={!target} onClick={()=>{if(target)onPositionRequest(target);}}>변경 요청</button>
          </fieldset>
          <p className="small muted position-request-status">{requestBlock??"시즌당 1회 요청할 수 있습니다."}</p>
        </Panel>}
        {profile??<section className="player-card"><h2>{player.name}</h2><div className="detail-position"><span>{positionLabel(player)}</span><PlayerGrade player={player} pro={state.careerMode==="pro"} state={state}/></div><PlayerAbilities player={player}/><PlayerTalents player={player}/>{onChange&&<TwoWayRelease state={state} onChange={onChange} disabled={locked}/>}</section>}
      </div></div><Panel title="성장의 발자취" eyebrow="GROWTH TRACKER" className="training-growth"><GrowthChart state={state}/></Panel>
  </div>;
}
