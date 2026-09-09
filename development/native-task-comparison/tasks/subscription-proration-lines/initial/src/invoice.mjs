export function invoice(start,end,initial,changes,alreadyCharged){return {lines:[{plan:initial.id,start,end,cents:initial.price}],total:initial.price,adjustment:initial.price-alreadyCharged};}
