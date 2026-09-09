export function decodeText(chunks){return chunks.map(c=>new TextDecoder().decode(c)).join('');}
