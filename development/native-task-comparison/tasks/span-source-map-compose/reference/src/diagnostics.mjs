import {composeMaps,lookupPosition} from './maps.mjs';
export function createDiagnosticMapper(outer,innerBySource={}){
 const map=composeMaps(outer,innerBySource);return diagnostic=>{const location=lookupPosition(map,diagnostic);return{message:diagnostic.message,source:location?.source??'<generated>',line:location?.line??diagnostic.line,column:location?.column??diagnostic.column,mapped:location!==null};};
}
