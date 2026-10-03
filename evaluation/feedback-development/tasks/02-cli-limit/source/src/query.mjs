export function select(records,options) {
 return records.filter(r=>options.tag===null || r.tags.includes(options.tag));
}
