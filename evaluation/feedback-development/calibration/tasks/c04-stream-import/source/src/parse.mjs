import {record} from './record.mjs';
export function parseText(text) { return text.split(/\r?\n/).filter(s=>s.trim()).map(s=>record(JSON.parse(s))); }
