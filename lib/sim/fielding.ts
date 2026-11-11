import type { Player, Position, RecordLine } from "./types";

export const fieldPositions: Position[] = ["C", "SS", "CF", "2B", "1B", "3B", "LF", "RF", "DH"];
// A routed ball is one observed opportunity, not a second probability draw.
// Catcher fielding chances are popups; framing and throwing assists are not recorded.
const routeWeights = [5, 20, 18, 17, 9, 12, 9, 10];
export function fieldingIndex(roll: number) {
  let n = roll % 100;
  for (let i = 0; i < routeWeights.length; i++) {
    if (n < routeWeights[i]) return i;
    n -= routeWeights[i];
  }
  return 7;
}
export function fieldingLine(record: RecordLine) {
  return record.fielding ??= { version: 1, chances: 0, plays: 0, expectedPlays: 0, outs: {} };
}
export function recordFieldingPlay(record: RecordLine, out: boolean, expectedOut: number) {
  const f = fieldingLine(record);
  f.chances++; f.plays += Number(out); f.expectedPlays += expectedOut;
}
export function recordFieldingOuts(field: Player[], line: (p: Player) => RecordLine) {
  field.forEach((p, i) => {
    const f = fieldingLine(line(p)), pos = fieldPositions[i];
    if (pos) f.outs[pos] = (f.outs[pos] ?? 0) + 1;
  });
}
export function validFieldingRecord(value: unknown): value is NonNullable<RecordLine["fielding"]> {
  if (!value || typeof value !== "object") return false;
  const f = value as NonNullable<RecordLine["fielding"]>;
  return f.version === 1 && Number.isInteger(f.chances) && f.chances >= 0
    && Number.isInteger(f.plays) && f.plays >= 0 && f.plays <= f.chances
    && Number.isFinite(f.expectedPlays) && f.expectedPlays >= 0 && f.expectedPlays <= f.chances + 1e-7
    && !!f.outs && typeof f.outs === "object" && Object.entries(f.outs).every(([pos, n]) => fieldPositions.includes(pos as Position) && Number.isInteger(n) && n! >= 0);
}
