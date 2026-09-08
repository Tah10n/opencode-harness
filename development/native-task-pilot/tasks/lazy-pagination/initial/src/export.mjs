import {listItems} from './client.mjs';export async function exportNames(fetchPage){const items=await listItems(fetchPage);return items.length?items.map(x=>x.name).join('\n')+'\n':'';}
