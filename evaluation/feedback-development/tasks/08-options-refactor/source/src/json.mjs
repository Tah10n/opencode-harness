export function jsonReport(options={}) {

 const attempts=options.attempts===undefined?3:options.attempts;
 const timeout=options.timeout===undefined?250:options.timeout;
 if(!Number.isInteger(attempts)||attempts<1||attempts>10)throw new RangeError('attempts');
 if(!Number.isFinite(timeout)||timeout<0)throw new RangeError('timeout');
 return {attempts,timeout};
}
