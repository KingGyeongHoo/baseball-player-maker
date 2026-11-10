import { statKeys, type Player, type Stats, type Stat } from "./types";
import type { AgingProfile } from "./pro-types";

const physicalStats: readonly Stat[] = [
  "power",
  "speed",
  "velocity",
  "arm",
  "stamina",
  "recovery",
];
export const isPhysicalStat = (key: Stat) => physicalStats.includes(key);
export function agingProfile(player: Player): AgingProfile {
  if (player.professional?.agingProfile)
    return player.professional.agingProfile;
  const source =
    player.professional?.peak ?? player.initialStats ?? player.stats;
  const pitching = ["선발", "중간계투", "마무리"].includes(player.primaryRole);
  const keys: Stat[] = player.twoWay
    ? ["power", "speed", "velocity", "arm", "stamina", "recovery"]
    : pitching
      ? ["velocity", "arm", "stamina", "recovery"]
      : ["power", "speed", "arm", "stamina", "recovery"];
  const physical =
    keys.reduce((sum, key) => sum + source[key], 0) / keys.length;
  const extension =
    physical >= 90 ? 3 : physical >= 75 ? 2 : physical >= 60 ? 1 : 0;
  return {
    version: 1,
    physical,
    peakStart: 28 - extension,
    declineStart: 32 + extension,
    loss: {},
  };
}
export function initializeAgingProfile(player: Player) {
  if (!player.professional || player.professional.agingProfile) return false;
  player.professional.agingProfile = agingProfile(player);
  return true;
}
export function ageEfficiency(player: Player, key?: Stat) {
  if (player.careerMode !== "pro") return 1;
  const age = player.age ?? 19;
  if (key && isPhysicalStat(key)) {
    const { peakStart, declineStart } = agingProfile(player);
    if (age < peakStart)
      return (
        1.5 -
        0.4 * Math.max(0, Math.min(1, (age - 20) / Math.max(1, peakStart - 21)))
      );
    if (age < declineStart)
      return (
        0.3 -
        (0.15 * (age - peakStart)) / Math.max(1, declineStart - peakStart - 1)
      );
    return Math.max(0.025, 0.1 - 0.015 * (age - declineStart));
  }
  return age <= 22
    ? 1.3
    : age <= 27
      ? 1.2
      : age <= 31
        ? 1
        : age <= 35
          ? 0.8
          : age <= 38
            ? 0.6
            : 0.4;
}
export function professionalGrowth(player: Player, key?: Stat) {
  return (
    ageEfficiency(player, key) *
    (player.professional?.employment === "freeAgent" ? 0.6 : 1)
  );
}
// The physical ceiling uses the player's recorded best, not a hidden potential OVR.
export function limitPhysicalGrowth(player: Player, key: Stat, value: number) {
  if (
    player.careerMode !== "pro" ||
    !player.professional ||
    !isPhysicalStat(key) ||
    value <= player.stats[key]
  )
    return value;
  const profile = agingProfile(player);
  if ((player.age ?? 19) < profile.declineStart) return value;
  const ceiling = Math.max(
    1,
    player.professional.peak[key] - (profile.loss[key] ?? 0),
  );
  return Math.min(value, Math.max(player.stats[key], ceiling));
}
export function applyAging(player: Player, year: number): Partial<Stats> {
  const pro = player.professional;
  if (!pro || pro.agedYear >= year) return {};
  initializeAgingProfile(player);
  const profile = pro.agingProfile!,
    elapsed = (player.age ?? 19) - profile.declineStart;
  const changes: Partial<Stats> = {};
  for (const key of statKeys) {
    const fast =
      elapsed < 0
        ? 0
        : elapsed < 3
          ? 0.15 + 0.1 * elapsed
          : elapsed < 6
            ? 0.45 + 0.15 * (elapsed - 3)
            : Math.min(2.2, 0.9 + 0.15 * (elapsed - 6));
    const body =
      elapsed < 0
        ? 0
        : elapsed < 3
          ? 0.1 + 0.075 * elapsed
          : elapsed < 6
            ? 0.325 + 0.1 * (elapsed - 3)
            : Math.min(1.8, 0.65 + 0.125 * (elapsed - 6));
    const rate =
      key === "speed" || key === "velocity"
        ? fast
        : isPhysicalStat(key)
          ? body
          : key === "bq"
            ? elapsed < 8
              ? 0
              : Math.min(0.2, 0.05 + 0.025 * (elapsed - 8))
            : elapsed < 3
              ? 0
              : Math.min(0.8, 0.05 + 0.05 * (elapsed - 3));
    const before = player.stats[key];
    pro.peak[key] = Math.max(pro.peak[key], before);
    player.stats[key] = Math.max(1, before - rate);
    changes[key] = player.stats[key] - before;
    if (isPhysicalStat(key))
      profile.loss[key] = (profile.loss[key] ?? 0) - changes[key]!;
  }
  pro.agedYear = year;
  pro.ageChanges = changes;
  return changes;
}
