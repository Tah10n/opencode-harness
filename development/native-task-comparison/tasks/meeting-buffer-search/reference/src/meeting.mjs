import {blocked,earliest} from './intervals.mjs';export function findMeeting(rooms,start,duration,buffer=0){return earliest(rooms.flatMap(r=>blocked(r,buffer)),start,duration);}
