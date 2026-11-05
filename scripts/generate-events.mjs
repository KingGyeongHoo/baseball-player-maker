import { readFileSync, writeFileSync } from 'node:fs';
const doc = readFileSync('docs/baseball-events.md', 'utf8');
const clean = text => text.replaceAll('**', '').trim();
const sections = doc.split(/^### (?=[TPCG]\d\d\.)/m).slice(1);
const events = sections.map(section => {
  const lines = section.split(/\r?\n/);
  const [,id,title] = lines[0].match(/^([TPCG]\d\d)\. (.*?)(?: —.*)?$/);
  const situation = lines.find(line => /^(?:- )?상황:/.test(line));
  if (!situation) throw new Error(id + ': missing situation');
  const description = clean(situation.replace(/^(?:- )?상황:\s*/, '')).replace(/^“|”$/g, '');
  const choices = [];
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1,-1).map(clean);
    if (cells.length !== 4 || !/^\d+(?:\.\d+)?%/.test(cells[1])) continue;
    let choice = choices.find(c => c.label === cells[0]);
    if (!choice) { choice = {id:'choice-'+(choices.length+1),label:cells[0],outcomes:[]}; choices.push(choice); }
    choice.outcomes.push({weight:parseFloat(cells[1]),message:cells[2],effect:cells[3]});
  }
  if (![2,3].includes(choices.length)) throw new Error(id + ': invalid choices');
  for (const choice of choices) if (choice.outcomes.reduce((n,o)=>n+o.weight,0)!==100) throw new Error(id+': invalid weights');
  return {id,title,description,choices};
});
if (events.length!==30 || new Set(events.map(e=>e.id)).size!==30) throw new Error('Expected 30 events');
writeFileSync('lib/sim/event-definitions.json', JSON.stringify({source:'docs/baseball-events.md',events},null,2)+'\n');
console.log('Generated 30 event definitions from docs/baseball-events.md');
