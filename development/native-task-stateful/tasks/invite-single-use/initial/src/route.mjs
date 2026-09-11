import {redeem} from './redeem.mjs';
export function accept(book,request,clock){return redeem(book,request.token,clock());}
