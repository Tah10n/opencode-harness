import {allOf,anyOf} from './rules.mjs';
const fail=message=>({ok:false,errors:[message]}),pass=()=>({ok:true,errors:[]});
const name=allOf([p=>p.name.length?pass():fail('name required'),p=>p.name.length<=20?pass():fail('name too long')]);
const contact=anyOf([p=>/^[^ @]+@[^ @]+$/.test(p.email)?pass():fail('email invalid'),p=>/^[0-9]{6,12}$/.test(p.phone)?pass():fail('phone invalid')]);
const profile=allOf([name,contact]);export function validateProfile(value){return profile(value);}
