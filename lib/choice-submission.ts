// Only keep the duplicate-click latch when the parent actually accepted a choice.
// A busy/stale parent or a thrown resolver must leave the same event retryable.
export function submitChoice(latch:{current:boolean},disabled:boolean,choose:()=>boolean) {
  if(disabled||latch.current)return false;
  latch.current=true;let accepted=false;
  try{accepted=choose();return accepted;}
  finally{if(!accepted)latch.current=false;}
}
