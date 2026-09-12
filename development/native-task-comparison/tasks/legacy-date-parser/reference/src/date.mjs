function calendar(text){
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);if(!match)return null;
 const [year,month,day]=match.slice(1).map(Number),date=new Date(Date.UTC(year,month-1,day));
 if(year<2000||year>2099||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new TypeError('date');return text;
}
export function parseDate(text){
 if(typeof text!=='string')throw new TypeError('date');
 const plain=calendar(text);if(plain!==null)return plain;
 const match=/^(\d{4})-W(\d{2})-([1-7])$/.exec(text);if(!match)throw new TypeError('week date');
 const [year,week,day]=match.slice(1).map(Number);if(year<2000||year>2099||week<1||week>53)throw new TypeError('week date');
 const jan4=Date.UTC(year,0,4),weekday=(new Date(jan4).getUTCDay()+6)%7;
 const monday=jan4-weekday*86400000+(week-1)*7*86400000;
 if(new Date(monday+3*86400000).getUTCFullYear()!==year)throw new TypeError('invalid week');
 return new Date(monday+(day-1)*86400000).toISOString().slice(0,10);
}
