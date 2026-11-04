import type { CareerEvent, Player, Stat } from "./types";

export function createCareerEvent(kind: CareerEvent["kind"], player: Player, date: string, week: number): CareerEvent {
  const pitching = ["선발", "중간계투", "마무리"].includes(player.primaryRole);
  const key: Stat = pitching ? "control" : "contact";
  const power: Stat = pitching ? "velocity" : "power";
  const candidates: Stat[] = pitching ? ["velocity", "control", "movement"] : ["contact", "power", "speed", "defense"];
  const weakest = [...candidates].sort((a,b) => player.stats[a] - player.stats[b])[0];
  const base = { id: `${player.id}-${week}-${kind}`, kind, date };
  if (kind === "coach") return { ...base, title: "감독의 주전 테스트", description: "감독이 다음 출전 기회를 앞두고 특별 훈련을 제안했습니다. 어떤 준비에 집중할까요?", choices: [
    { id: "precision", label: pitching ? "제구를 다듬는다" : "컨택을 다듬는다", description: "기본기를 다지고 안정적인 플레이를 준비합니다.", stats: { [key]: .4 }, reputation: 1, fatigue: 1 },
    { id: "routine", label: "기존 루틴을 유지한다", description: "추가 부담을 줄이고 경기 이해도에 집중합니다.", stats: { bq: .2 }, reputation: 0, fatigue: 0 },
  ] };
  if (kind === "condition") return { ...base, title: "훈련 중 몸의 이상 신호", description: "몸이 평소보다 무겁습니다. 추가 훈련을 이어갈지, 회복에 투자할지 결정할 시간입니다.", choices: [
    { id: "recover", label: "회복과 몸 관리에 투자한다", description: "몸 관리 능력을 기르고 누적 피로를 줄입니다.", stats: { recovery: .3 }, reputation: 0, fatigue: -3 },
    { id: "challenge", label: "한 번 더 강하게 훈련한다", description: "힘을 기르는 대신 피로 부담을 감수합니다.", stats: { [power]: .4 }, reputation: 1, fatigue: 3 },
  ] };
  return { ...base, title: "스카우트의 피드백", description: "경기를 지켜본 스카우트가 가능성과 보완점을 이야기합니다. 다음 기회를 어떻게 준비할까요?", choices: [
    { id: "weakness", label: "보완점을 훈련한다", description: "투수 또는 타자 핵심 능력 중 가장 낮은 항목을 개선합니다.", stats: { [weakest]: .5 }, reputation: 1, fatigue: 1 },
    { id: "impression", label: "장점을 보여줄 준비를 한다", description: "스카우트에게 인상을 남길 특별 준비를 합니다.", stats: { bq: .2 }, reputation: 2, fatigue: 2 },
  ] };
}
