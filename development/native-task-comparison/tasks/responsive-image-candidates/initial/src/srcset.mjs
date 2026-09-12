export function parseCandidates(text){return text.trim()?text.split(',').map(x=>({url:x.trim().split(' ')[0],value:1,kind:'x'})):[];}
