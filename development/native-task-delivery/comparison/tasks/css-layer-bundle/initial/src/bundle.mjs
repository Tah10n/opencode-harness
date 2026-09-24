export function bundle(blocks,edges){return blocks.map(b=>'@layer '+b.name+' { '+b.css+' }').join('\n');}
