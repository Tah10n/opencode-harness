export function render(records,options) {
 return options.json ? JSON.stringify(records) : records.map(r=>r.id+': '+r.name).join('\n');
}
