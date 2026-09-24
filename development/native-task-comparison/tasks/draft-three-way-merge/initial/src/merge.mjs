export function mergeDraft(base,local,remote){return {merged:{...remote,...local},conflicts:[]};}
