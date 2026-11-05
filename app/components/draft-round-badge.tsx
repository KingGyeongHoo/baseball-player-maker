export default function DraftRoundBadge({ round, forecast = true }: { round:number;forecast?:boolean }) {
  return <small className={`draft-round-badge round-${Math.min(round,4)}`}>{round}라운더 {forecast?"예상":"지명"}</small>;
}
