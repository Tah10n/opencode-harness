export function buildReport(expenses) { return { rows: expenses.map(x=>({...x})), count: expenses.length, totalCents: expenses.reduce((n,x)=>n+x.amountCents,0) }; }
