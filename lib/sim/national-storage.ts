import type {NationalTournament} from './national-tournament';

// Foreign rosters are temporary match inputs. Historical results and named
// awards remain useful, while only the Korean team's individual records persist.
export function compactNationalTournament(t:NationalTournament):NationalTournament{
  if(!t.finished||t.progress||!t.countries.slice(1).some(country=>country.players.length))return t;
  const koreanIds=new Set(t.countries[0].players.map(player=>player.id));
  return {...t,countries:t.countries.map(country=>country.id===0?country:{...country,players:[]}),games:t.games.map(game=>{
    const copy={...game,boxScore:Object.fromEntries(Object.entries(game.boxScore).filter(([id])=>koreanIds.has(id)))};
    delete copy.proPreparedLineup;
    copy.lineup=game.lineup.map(side=>side.filter(id=>koreanIds.has(id)));
    if(copy.proAppearances)copy.proAppearances=Object.fromEntries(Object.entries(copy.proAppearances).filter(([id])=>koreanIds.has(id)));
    return copy;
  })};
}
