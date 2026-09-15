export function words(text){
 const output=[];let word='',active=false,quote=null;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quote==="'"){if(c==="'")quote=null;else word+=c;continue;}
  if(c==='\\'){if(i+1===text.length)throw new SyntaxError('dangling escape');word+=text[++i];active=true;continue;}
  if(quote==='"'){if(c==='"')quote=null;else word+=c;continue;}
  if(c==="'"||c==='"'){quote=c;active=true;continue;}
  if(/[ \t\r\n]/.test(c)){if(active){output.push(word);word='';active=false;}continue;}
  word+=c;active=true;
 }
 if(quote!==null)throw new SyntaxError('unclosed quote');
 if(active)output.push(word);return output;
}
