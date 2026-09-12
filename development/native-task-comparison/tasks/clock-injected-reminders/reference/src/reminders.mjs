import {selectDue} from './reminder-core.mjs';
export function dueReminders(reminders,{clock=Date.now}={}){const now=clock();return selectDue(reminders,now);}
