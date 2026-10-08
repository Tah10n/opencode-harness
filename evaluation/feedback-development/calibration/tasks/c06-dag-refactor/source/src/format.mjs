export function formatPreview(plan) { return plan.waves.map((wave,i)=>'wave '+(i+1)+': '+wave.join(', ')).join('\n'); }
