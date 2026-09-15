function calendar(text){
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);if(!match)return null;
 const [year,month,day]=match.slice(1).map(Number),date=new Date(Date.UTC(year,month-1,day));
 if(year<2000||year>2099||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new TypeError('date');return text;
}
export function parseDate(text){if(typeof text!=='string')throw new TypeError('date');const value=calendar(text);if(value===null)throw new TypeError('date');return value;}
