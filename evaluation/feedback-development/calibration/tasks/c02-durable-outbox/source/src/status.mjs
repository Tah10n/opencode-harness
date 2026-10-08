export function counts(outbox) {
 const records=outbox.snapshot().records;
 return {pending:records.filter(r=>r.status==='pending').length,sent:records.filter(r=>r.status==='sent').length};
}
