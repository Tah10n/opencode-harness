export function parseRows(text){return text.trim().split(/\r?\n/).map(row=>row.split(','));}
