export function selectCatalog(catalog,region){return catalog.filter(x=>region===undefined||x.region===region).map(x=>({...x}));}
