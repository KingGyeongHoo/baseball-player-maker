import { scoreText, changeText } from "../../lib/display";
import { effective, labels, ovr, positions } from "../../lib/sim/engine";
import type { Player, Stat } from "../../lib/sim/types";

const groups: { id: string; title: string; keys: Stat[] }[] = [
  { id: "pitching", title: "투수 능력치", keys: ["velocity", "control", "movement"] },
  { id: "batting", title: "타자 능력치", keys: ["contact", "power", "speed", "defense"] },
  { id: "physical", title: "공통 능력치", keys: ["stamina", "recovery", "arm", "bq"] },
];

export default function PlayerAbilities({ player, compare = false, showEffective = false, detailsOnly = false }: { player: Player; compare?: boolean; showEffective?: boolean; detailsOnly?: boolean }) {
  const gameStats = showEffective ? effective(player) : null;
  const both = player.eligiblePositions.some(p => ["SP", "RP", "CP"].includes(p)) && player.eligiblePositions.some(p => !["SP", "RP", "CP"].includes(p));
  return <div className="player-abilities">
    {!detailsOnly && <div className="profile-ovrs"><span>투수 OVR <b>{scoreText(ovr(player, true))}</b></span><span>타자 OVR <b>{scoreText(ovr(player, false))}</b></span>{both && <strong>투타 겸업</strong>}</div>}
    {groups.map(group => <section className={`ability-group ${group.id}`} key={group.id} aria-label={group.title}>
      <h3>{group.title}</h3><div className="stat-bars">{group.keys.map(key => {
        const growth = player.stats[key] - player.initialStats[key];
        return <div className="stat-bar-row" key={key}><span>{labels[key]}</span><div className="stat-track"><i style={{ width: `${player.stats[key]}%` }} /></div><strong>{scoreText(player.stats[key])}</strong>{compare && <small className="positive">{changeText(growth)}</small>}{gameStats && <small className="muted">유효 {scoreText(gameStats[key])}</small>}</div>;
      })}</div>
    </section>)}
    {!detailsOnly && <p className="eligibility-note">출전 자격 · {player.eligiblePositions.map(p => positions[p]).join(" · ")}</p>}
  </div>;
}
