// Compare the two disciplines symmetrically, using unrounded basic OVRs.
export function meetsTwoWayRatio(pitching:number,batting:number,ratio:number) {
  return Number.isFinite(pitching)&&Number.isFinite(batting)&&Math.max(pitching,batting)>0
    &&Math.min(pitching,batting)>=Math.max(pitching,batting)*ratio;
}
