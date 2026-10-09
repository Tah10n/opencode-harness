export function clip(text,width){const chars=Array.from(text);return chars.length<=width?text:chars.slice(0,width).join('')+'…';}
