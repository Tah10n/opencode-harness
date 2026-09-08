const quote = x => '"'+String(x).replaceAll('"','""')+'"';
export function renderCsv(report) { return 'description,currency,amountCents\n'+report.rows.map(x=>[quote(x.description),x.currency,x.amountCents].join(',')+'\n').join(''); }
