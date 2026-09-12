import {decodeText} from './utf8.mjs';export function createDecoder(){return {push(frame){return [{type:'message',text:decodeText([frame.data])}];}};}
