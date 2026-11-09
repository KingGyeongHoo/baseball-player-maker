export const rosterGradeBands = [
  { grade: "S", minimum: 80, exclusive: true },
  { grade: "A", minimum: 72 },
  { grade: "B", minimum: 64 },
  { grade: "C", minimum: 56 },
  { grade: "D", minimum: 48 },
  { grade: "E", minimum: 40 },
  { grade: "F", minimum: 0 },
] as const;
export const proRosterGradeBands = [
  { grade: "S", minimum: 81, exclusive: true },
  { grade: "A", minimum: 79 },
  { grade: "B", minimum: 77 },
  { grade: "C", minimum: 75 },
  { grade: "D", minimum: 73 },
  { grade: "E", minimum: 71 },
  { grade: "F", minimum: -Infinity },
] as const;
export function rosterGrade(
  reputation: number | null | undefined,
  pro = false,
) {
  if (reputation == null || !Number.isFinite(reputation)) return "—";
  const score = pro ? Number(reputation.toFixed(1)) : reputation;
  return (
    (pro ? proRosterGradeBands : rosterGradeBands).find((b) =>
      "exclusive" in b && b.exclusive ? score > b.minimum : score >= b.minimum,
    )?.grade ?? "F"
  );
}
