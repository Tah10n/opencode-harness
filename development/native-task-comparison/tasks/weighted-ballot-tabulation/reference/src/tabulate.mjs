function validate(candidates,ballots){
 if(new Set(candidates).size!==candidates.length||candidates.some(x=>typeof x!=='string'||! /^[A-Za-z]{1,20}$/.test(x)))throw new TypeError('candidate');const names=new Set(candidates);
 for(const b of ballots)if(!Number.isSafeInteger(b.weight)||b.weight<0||b.weight>1000000||new Set(b.ranking).size!==b.ranking.length||b.ranking.some(x=>!names.has(x)))throw new TypeError('ballot');
}
export function tabulate(candidates,ballots){
 validate(candidates,ballots);const active=new Set([...candidates].sort()),rounds=[];const total=ballots.reduce((n,b)=>n+b.weight,0);
 while(active.size){const counts=new Map([...active].map(name=>[name,0]));let activeWeight=0;
  for(const ballot of ballots){const selected=ballot.ranking.find(name=>active.has(name));if(selected!==undefined){counts.set(selected,counts.get(selected)+ballot.weight);activeWeight+=ballot.weight;}}
  const totals=[...counts].map(([candidate,votes])=>({candidate,votes})),winner=activeWeight?totals.find(x=>x.votes>activeWeight/2)?.candidate:null;
  if(winner||!activeWeight){rounds.push({totals,activeWeight,exhaustedWeight:total-activeWeight,eliminated:null});return{winner:winner??null,rounds};}
  const minimum=Math.min(...counts.values()),eliminated=[...counts].filter(([,votes])=>votes===minimum).map(([name])=>name).sort().at(-1);
  rounds.push({totals,activeWeight,exhaustedWeight:total-activeWeight,eliminated});active.delete(eliminated);
 }
 return{winner:null,rounds};
}
