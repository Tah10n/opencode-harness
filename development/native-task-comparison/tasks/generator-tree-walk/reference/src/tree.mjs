import {walkTree} from './walk.mjs';
export function collectTree(root,options){return Array.from(walkTree(root,options));}
