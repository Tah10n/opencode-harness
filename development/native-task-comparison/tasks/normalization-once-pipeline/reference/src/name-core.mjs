export function validateNormalized(name){if(name==='')return 'empty';if(name.length>20)return 'too_long';if(!(/^[a-z][a-z0-9_-]*$/).test(name))return 'invalid';return null;}
export function displayNormalized(name){return '@'+name;}
