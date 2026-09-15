import {collectErrors} from './collect.mjs';
const nameRule=r=>typeof r.name!=='string'||r.name.trim()===''?{field:'name',code:'required'}:r.name.trim().length>40?{field:'name',code:'too_long'}:null;
const ageRule=r=>!Number.isInteger(r.age)||r.age<18||r.age>120?{field:'age',code:'invalid'}:null;
const emailRule=r=>{
 const absent=r.email===null||r.email===undefined||(typeof r.email==='string'&&r.email.trim()==='');
 if(absent)return r.newsletter===true?{field:'email',code:'required'}:null;
 return typeof r.email!=='string'||!(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/).test(r.email.trim())?{field:'email',code:'invalid'}:null;
};
const rules=[nameRule,ageRule,emailRule];
export function validate(record){return collectErrors(record,rules,{firstOnly:true})[0]??null;}
export function validateAll(record){return collectErrors(record,rules);}
