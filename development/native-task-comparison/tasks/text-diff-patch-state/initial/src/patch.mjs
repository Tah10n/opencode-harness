export function applyPatch(lines,hunks){const out=[...lines];for(const h of hunks)out.splice(h.at,h.remove.length,...h.insert);return {lines:out,inverse:[]};}
