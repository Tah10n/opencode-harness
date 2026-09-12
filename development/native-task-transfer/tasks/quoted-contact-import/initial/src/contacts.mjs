import {parseRows} from './csv.mjs';export function importContacts(text){const [head,...rows]=parseRows(text);return rows.map(row=>({name:row[0],email:row[1]}));}
