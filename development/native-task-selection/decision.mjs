// Syntactic consistency only. Model-provided evidence is not a semantic certificate.
export function assessDecision(text) {
 const matches=[...text.matchAll(/^DECISION: (X|Y|NEITHER|INSUFFICIENT)\s*$/gm)];
 const records=[...text.matchAll(/^RESULT\s+([^|\n]+)\|\s*([^|\n]+)\|\s*X=(confirmed|missing|unverified)\s*\|\s*Y=(confirmed|missing|unverified)\s*\|\s*(.+)$/gm)].map(m=>({id:m[1].trim(),requirement:m[2].trim(),X:m[3],Y:m[4],evidence:m[5].trim()}));
 if(matches.length!==1||!records.length||new Set(records.map(r=>r.id)).size!==records.length)return {decision:null,records,consistent:false,semanticValidity:'unverified'};
 const status=label=>records.some(r=>r[label]==='missing')?'incomplete':records.some(r=>r[label]==='unverified')?'uncertain':'acceptable';
 const X=status('X'),Y=status('Y'),d=matches[0][1];
 const permitted=X==='acceptable'||Y==='acceptable'?['X','Y'].filter(l=>({X,Y})[l]==='acceptable'):X==='incomplete'&&Y==='incomplete'?['NEITHER']:['INSUFFICIENT'];
 return {decision:d,records,consistent:permitted.includes(d),reportedAcceptance:{X,Y},semanticValidity:'unverified'};
}
