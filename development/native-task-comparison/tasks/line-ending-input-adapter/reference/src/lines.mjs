export class LineDecoder{
 #pending='';#closed=false;
 push(chunk){
  if(this.#closed)throw Object.assign(new Error('closed'),{code:'LINE_DECODER_CLOSED'});
  const parts=(this.#pending+chunk).split('\n');this.#pending=parts.pop();
  return parts.map(line=>line.endsWith('\r')?line.slice(0,-1):line);
 }
 finish(){if(this.#closed)return [];this.#closed=true;const result=this.#pending===''?[]:[this.#pending];this.#pending='';return result;}
}
export function splitLines(text){const decoder=new LineDecoder();return [...decoder.push(text),...decoder.finish()];}
