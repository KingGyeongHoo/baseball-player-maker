import { createGame, getPlayer, hash, isPitcher, params, positions, reputationScore } from "./sim/engine";
import {continueCareer} from "./sim/pro-career";
import {choosePlayerJersey} from "./jersey-numbers";
import {choosePlayerHands} from "./player-handedness";
import type { PlayerHands, Position } from "./sim/types";

export type PlayerKind = "batter" | "pitcher";
export const fieldPositions: { id: Position; x: number; y: number; description: string }[] = [
  { id: "C", x: 50, y: 90, description: "홈을 지키는 수비의 중심. 수비와 어깨가 중요합니다." },
  { id: "1B", x: 69, y: 60, description: "1루를 지키는 중심 타선. 컨택과 파워를 키워보세요." },
  { id: "2B", x: 63, y: 51, description: "1·2루 사이를 지키는 내야수. 수비와 스피드가 중요합니다." },
  { id: "3B", x: 31, y: 60, description: "3루의 빠른 타구를 책임지는 내야수. 타격과 수비가 조화를 이룹니다." },
  { id: "SS", x: 37, y: 51, description: "2·3루 사이를 누비는 내야의 중심. 수비와 스피드가 중요합니다." },
  { id: "LF", x: 25, y: 34, description: "왼쪽 외야를 책임지는 야수. 컨택과 파워가 강점이 됩니다." },
  { id: "CF", x: 50, y: 23, description: "외야 한가운데의 넓은 수비 범위. 수비와 스피드를 키워보세요." },
  { id: "RF", x: 75, y: 34, description: "오른쪽 외야를 지키는 야수. 타격과 송구로 기회를 만듭니다." },
];
export const pitchingPositions: { id: Position; image: string; pose: string; description: string }[] = [
  { id: "SP", image: "/images/pitcher-starter.png", pose: "WINDUP", description: "와인드업 · 긴 이닝을 책임지는 선발" },
  { id: "RP", image: "/images/pitcher-reliever-front.png", pose: "SET POSITION", description: "셋포지션 · 경기의 흐름을 이어가는 계투" },
  { id: "CP", image: "/images/pitcher-closer-left.png", pose: "FINISHING PITCH", description: "역동적인 투구 · 마지막 아웃을 책임지는 마무리" },
];
export const kindForPosition = (position: Position): PlayerKind => ["SP", "RP", "CP"].includes(position) ? "pitcher" : "batter";

// The seed is internal: every start gets fresh entropy, while replayable engine
// inputs remain available to automated tests and diagnostics.
export function createRandomCareer(name: string, position: Position, entropy: Pick<Crypto, "randomUUID" | "getRandomValues"> = globalThis.crypto, jerseyNumber?:number,hands?:PlayerHands) {
  if (!name.trim()) throw new Error("선수 이름을 입력해 주세요.");
  if (!Object.hasOwn(positions, position)) throw new Error("희망 포지션을 선택해 주세요.");
  const teams = params["world.teams"];
  const limit = Math.floor(2 ** 32 / teams) * teams;
  const value = new Uint32Array(1);
  do { entropy.getRandomValues(value); } while (value[0] >= limit);
  const teamId = value[0] % teams;
  const s=choosePlayerJersey(createGame(entropy.randomUUID(), name, position, teamId),jerseyNumber);choosePlayerHands(getPlayer(s),hands);return s;
}

export function createRandomProCareer(name:string,position:Position,jerseyNumber?:number,entropy:Pick<Crypto,"randomUUID"|"getRandomValues">=globalThis.crypto,hands?:PlayerHands) {
  const s=createRandomCareer(name,position,entropy,undefined,hands),p=getPlayer(s);
  const main=isPitcher(p.primaryRole)?["velocity","control","movement"]:["contact","power","speed","defense"];
  const center=params["pro.second_mean"]+(hash(`${s.seed}:direct-center`)%1601)/100-8;
  for(const key of Object.keys(p.stats) as (keyof typeof p.stats)[]){
    if(main.includes(key)||["stamina","recovery","arm","bq"].includes(key))p.stats[key]=Math.max(1,Math.min(100,center+(hash(`${s.seed}:direct:${key}`)%1201)/100-6));
  }
  p.initialStats={...p.stats};p.grade=3;p.reputation=reputationScore(p);
  delete p.evaluationHistory;delete p.evaluationAvailability;delete s.evaluationSystem;
  s.date=s.calendar.draftDate;s.phase="ended";s.draftOutcome={revealed:true,offer:null};
  s.postSchool={graduationYear:s.calendar.seasonYear,graduationSchool:"프로 직접 시작",collegeYears:0,tryouts:[]};
  s.history=[{week:1,ovr:main.reduce((sum,key)=>sum+p.stats[key as keyof typeof p.stats],0)/main.length,ovrScale:100,fatigue:0}];
  return choosePlayerJersey(continueCareer(s,"direct"),jerseyNumber);
}
