export function selectDue(reminders,now){
 if(!Number.isSafeInteger(now)||now<0)throw new RangeError('clock');
 return reminders.filter(item=>item.enabled&&item.dueAt!==null&&item.dueAt<=now);
}
