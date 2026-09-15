export function parseMediaType(text){
 if(typeof text!=='string')throw new TypeError('media type');
 let i=0;const bad=()=>{throw new TypeError('media type');},ows=()=>{while(i<text.length&&/[ \t]/.test(text[i]))i++;};
 const token=()=>{const start=i;while(i<text.length&&/^[!#$%&'*+\-.^_\x60|~0-9A-Za-z]$/.test(text[i]))i++;if(i===start)bad();return text.slice(start,i);};
 ows();const type=token().toLowerCase();if(text[i++]!=='/')bad();const subtype=token().toLowerCase(),parameters={};ows();
 while(i<text.length){
  if(text[i++]!==';')bad();ows();const name=token().toLowerCase();ows();if(text[i++]!=='=')bad();ows();
  let value='';
  if(text[i]==='"'){throw new TypeError('quoted values unsupported');
   i++;let closed=false;
   while(i<text.length){let c=text[i++];if(c==='"'){closed=true;break;}if(c==='\\'){if(i===text.length)bad();c=text[i++];}
    const code=c.charCodeAt(0);if(c!=='\t'&&(code<32||code>126))bad();value+=c;}
   if(!closed)bad();
  }else value=token();
  Object.defineProperty(parameters,name,{value,enumerable:true,writable:true,configurable:true});ows();
 }
 return {type,subtype,parameters};
}
