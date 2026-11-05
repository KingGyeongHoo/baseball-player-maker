// Presentation only. Never feed the clipped value back into simulation state.
export const scoreText = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : String(Math.trunc(value));
export function changeText(value: number, scale = 1) {
  if(value===0)return "변화 없음";
  if(value<0)return "하락";
  const amount=value/scale;
  return amount<.1?"아주 조금 상승":amount<.5?"조금 상승":amount<1?"상승":amount<2?"크게 상승":"매우 크게 상승";
}
