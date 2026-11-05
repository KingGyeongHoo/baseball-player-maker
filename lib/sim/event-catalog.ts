import definitions from "./event-definitions.json";
import type { CareerEvent, CareerEventBranch, EventOpportunity, EventRewardWeeks, EventScene, Player, Role, Stat } from "./types";

export const eventIds = definitions.events.map(event => event.id);
export function eventKind(id: string): CareerEvent["kind"] {
  return id === "P08" ? "special" : id.startsWith("T") ? "training" : id.startsWith("P") ? "person" : id.startsWith("C") ? "tournament" : "game";
}
const rolePosition: Record<Role, string> = { "코너 야수": "1루수", "센터라인": "유격수", "포수": "포수", "선발": "선발투수", "중간계투": "중간계투", "마무리": "마무리" };
const statNames: Record<string, Stat> = { "컨택": "contact", "파워": "power", "스피드": "speed", "수비": "defense", "구속": "velocity", "제구": "control", "변화구": "movement", "스태미나": "stamina", "회복력": "recovery", "어깨": "arm", "야구 지능": "bq" };

// The checked-in JSON preserves every choice, narrative and branch probability
// from the design document. Resolve role-relative rewards when the event opens.
export function decodeEffects(effect: string, player: Player, targetRole?: Role): Omit<CareerEventBranch, "weight" | "message"> {
  const pitch = ["선발", "중간계투", "마무리"].includes(player.primaryRole);
  const core: Stat[] = pitch ? ["velocity", "control", "movement"] : ["contact", "power", "speed", "defense"];
  const weak = core.reduce((a, b) => player.stats[b] < player.stats[a] ? b : a);
  const output: Omit<CareerEventBranch, "weight" | "message"> = {};
  const permanent = effect.split(/이번 (?:타석|타자)/)[0].replace(/타자는 ([^,]+), 투수는 ([^.]+)\./, (_, bat, pitcher) => pitch ? pitcher : bat);
  const pattern = /(역할 핵심 능력 각각|전체 11개 능력치 각각|야구 지능|스태미나|회복력|변화구|컨택|파워|스피드|수비|구속|제구|어깨|정교함|힘|약점)\s*([+-]\d+(?:\.\d+)?)(주분)?/g;
  for (const match of permanent.matchAll(pattern)) {
    const name = match[1], amount = Number(match[2]);
    const keys: Stat[] = name === "역할 핵심 능력 각각" ? core : name === "전체 11개 능력치 각각" ? Object.values(statNames)
      : [name === "정교함" ? pitch ? "control" : "contact" : name === "힘" ? pitch ? "velocity" : "power" : name === "약점" ? weak : statNames[name]];
    for (const key of keys) {
      if (match[3]) {
        if (![3, 4, 6, 8, 12].includes(amount)) throw new Error("지원하지 않는 이벤트 훈련 보상입니다.");
        (output.weeks ??= {})[key] = amount as EventRewardWeeks;
      } else (output.stats ??= {})[key] = amount;
    }
  }
  for (const [label, key] of [["평판", "reputation"], ["피로", "fatigue"]] as const) {
    const match = permanent.match(new RegExp(`${label}\\s*([+-]\\d+(?:\\.\\d+)?)`));
    if (match) output[key] = Number(match[1]);
  }
  const injury = permanent.match(/보통 부상,\s*(\d+)일 결장/);
  if (injury) output.injury = { severity: "moderate", days: Number(injury[1]) };
  if (permanent.includes("제안한 주 역할")) output.role = targetRole;
  const sceneText = effect.match(/이번 (?:타석|타자)(.*)/)?.[1];
  if (sceneText) for (const [label, key] of [["안타", "hit"], ["홈런 판정", "hr"], ["볼넷", "bb"], ["삼진", "k"]] as const) {
    const match = sceneText.match(new RegExp(`${label}\\s*([+-]\\d+(?:\\.\\d+)?)%p`));
    if (match) (output.match ??= {})[key] = Number(match[1]) / 100;
  }
  return output;
}

export function createCareerEvent(definitionId: string, player: Player, date: string, week: number, context: Partial<EventOpportunity> & { scene?: EventScene } = {}): CareerEvent {
  const definition = definitions.events.find(event => event.id === definitionId);
  if (!definition) throw new Error("알 수 없는 이벤트입니다.");
  return {
    id: `${player.id}:${week}:${date}:${definitionId}`, rewardVersion: 2, definitionId, kind: eventKind(definitionId), date, title: definition.title,
    description: definition.description.replace("{제안 포지션}", context.targetRole ? rolePosition[context.targetRole] : "새로운 포지션"),
    choices: definition.choices.map(choice => ({ id: choice.id, label: choice.label,
      outcomes: choice.outcomes.map(outcome => ({ weight: outcome.weight, message: outcome.message, ...decodeEffects(outcome.effect, player, context.targetRole) })) })),
    ...(context.competitionId ? { competitionId: context.competitionId } : {}),
    ...(context.targetRole ? { targetRole: context.targetRole } : {}), ...(context.scene ? { scene: context.scene } : {}),
  };
}
