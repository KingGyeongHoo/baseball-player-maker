import {useState} from "react";
import type {GameState} from "../../lib/sim/types";
import PostseasonBracket from "./postseason-bracket";
import FarmPostseasonBracket from "./farm-postseason-bracket";

export default function PostseasonView({state,initialLevel="first"}:{state:GameState;initialLevel?:"first"|"second"}){
  const [level,setLevel]=useState(initialLevel);
  const world=state.proWorld;
  const firstAvailable=!!world?.postseason&&["postseason","summary"].includes(world.stage);
  const secondAvailable=!!world?.farmPostseason;
  if(!firstAvailable&&!secondAvailable)return null;
  const available=level==="first"?firstAvailable:secondAvailable;
  return <div className="postseason-view">
    <div className="segmented postseason-level-picker" role="group" aria-label="포스트시즌 대진표 리그 선택">
      {([["first","1군"],["second","2군"]] as const).map(([id,label])=><button type="button" key={id} className={level===id?"selected":""} aria-pressed={level===id} onClick={()=>setLevel(id)}>{label}</button>)}
    </div>
    {available?level==="first"?<PostseasonBracket state={state}/>:<FarmPostseasonBracket state={state}/>:<section className="panel postseason-bracket" aria-label={`${level==="first"?"":"2군 "}포스트시즌 대진표`}><div className="panel-heading"><h2>{level==="first"?"":"2군 "}포스트시즌 대진표</h2></div><p className="empty-note">아직 대진이 확정되지 않았습니다.</p></section>}
  </div>;
}
