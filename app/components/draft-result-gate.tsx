import { revealDraftResult } from "../../lib/sim/draft-outcome";
import type { GameState } from "../../lib/sim/types";

export default function DraftResultGate({state,onChange}:{state:GameState;onChange:(s:GameState)=>void}) {
  return <section className="panel draft-reveal-panel"><span className="eyebrow">THE NEXT CHAPTER</span><h1>당신의 다음 이야기가 기다립니다.</h1>
    <p>고교 마지막 시즌과 드래프트가 끝났습니다.<br/>준비됐다면 올해의 지명 결과를 확인하세요.</p>
    <button className="primary" onClick={()=>onChange(revealDraftResult(state))}>결과 확인 →</button>
    <p className="micro muted">결과 확인 후 고교 커리어와 다음 진로를 함께 볼 수 있습니다.</p>
  </section>;
}
