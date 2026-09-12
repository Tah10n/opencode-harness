export function blocked(reservations){return reservations;}export function earliest(intervals,start,duration){return intervals.reduce((t,[a,b])=>t<b&&t+duration>a?b:t,start);}
