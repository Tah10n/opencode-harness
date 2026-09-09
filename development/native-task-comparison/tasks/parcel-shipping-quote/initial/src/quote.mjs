export function quote(parcels,zone){return parcels.map(p=>({id:p.id,status:'quoted',grams:p.grams,cents:zone.base+Math.ceil(p.grams/zone.stepGrams)*zone.stepCents}));}
