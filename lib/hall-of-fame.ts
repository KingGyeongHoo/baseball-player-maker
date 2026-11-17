import type {SavedRetiredNumber} from './retired-number-reservations';

// Same club order as proClubNames and the numeric club IDs in career saves.
export const retiredNumberLogos=['bears','twins','heros','landers','wiz','eagles','tigers','lions','dinos','lotte'];

export function retiredNumberImage(template:string,number:number){
  if(!Number.isInteger(number)||number<1||number>99)throw new Error('올바르지 않은 등번호입니다.');
  const svg=template.replace(/(<text\b[^>]*data-role="number"[^>]*>)[\s\S]*?(<\/text>)/,(_,before,after)=>`${before}${number}${after}`);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function clubRetiredNumbers(entries:SavedRetiredNumber[],club:number){
  const unique=new Map<string,SavedRetiredNumber>();
  for(const entry of entries)if(entry.club===club)unique.set(`${entry.saveId}:${entry.playerId}`,entry);
  return [...unique.values()].sort((a,b)=>a.number-b.number||a.playerName.localeCompare(b.playerName,'ko'));
}
